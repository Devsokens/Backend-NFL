import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

import * as qrcode from 'qrcode';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async generateAndSend(eventId: string, ticketIds: string[]) {
    // 1. Fetch Event
    const { data: event, error: eventError } = await this.supabase
      .getAdminClient()
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError || !event) throw new InternalServerErrorException("Événement introuvable");

    // 2. Fetch Tickets
    const { data: tickets, error: ticketsError } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('*')
      .in('id', ticketIds);

    if (ticketsError) throw new InternalServerErrorException("Erreur lors de la récupération des billets");

    this.logger.log(`Génération de certificates pour ${tickets.length} participants...`);

    // 3. Load Template
    const templatePath = path.join(process.cwd(), 'src/assets/template-certificate.png');
    if (!fs.existsSync(templatePath)) {
      throw new InternalServerErrorException("Template de certificat introuvable dans les assets backend");
    }
    const templateBytes = fs.readFileSync(templatePath);

    let successCount = 0;
    let failCount = 0;

    for (const ticket of tickets) {
      try {
        const pdfBytes = await this.createCertificatePdf(event, ticket, templateBytes);
        const base64Pdf = Buffer.from(pdfBytes).toString('base64');

        await this.sendCertificateEmail(event, ticket, base64Pdf);
        successCount++;
      } catch (err) {
        failCount++;
        this.logger.error(`Échec de l'envoi pour ${ticket.email}: ${err.message}`);
      }
    }

    // 4. Update Event Status
    await this.supabase
      .getAdminClient()
      .from('events')
      .update({ 
        certificates_sent: true, 
        certificates_sent_at: new Date().toISOString() 
      })
      .eq('id', eventId);

    return { 
      message: `Opération terminée. Succès: ${successCount}, Échecs: ${failCount}`,
      successCount, 
      failCount 
    };
  }

  private async createCertificatePdf(event: any, ticket: any, templateBytes: Buffer) {
    // On crée un PDF au format A4 approximatif (basé sur le ratio de l'image si possible)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 850]); 
    const { width, height } = page.getSize();

    const image = await pdfDoc.embedPng(templateBytes);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });

    // -----------------------------------------------------
    // MASQUAGE DU TEXTE FICTIF (Draw rectangles to hide template text)
    // -----------------------------------------------------
    // Retour à la couleur d'origine "parchemin" qui se fond le mieux au centre (#FDFBF2)
    const bgColor = rgb(0.992, 0.984, 0.949); 
    
    // 1. Masquer [PRÉNOM NOM] (On remonte un peu le bas pour ne pas couper le signe infini)
    page.drawRectangle({ x: 80, y: 495, width: 440, height: 58, color: bgColor });
    
    // 2. Masquer le Thème (On augmente la hauteur pour cacher les miettes en haut)
    page.drawRectangle({ x: 80, y: 385, width: 440, height: 85, color: bgColor });
    
    // 3. Masquer la Date (On descend le haut de la boite pour ne pas cacher la ligne déco)
    page.drawRectangle({ x: 190, y: 178, width: 130, height: 35, color: bgColor });
    
    // 4. Masquer [VILLE] (Ramené vers la droite pour ne pas cacher l'icône de localisation)
    page.drawRectangle({ x: 350, y: 178, width: 145, height: 35, color: bgColor });

    // 5. Masquer le faux Code QR (Rabaissé pour ne pas toucher l'icône calendrier/date, relevé du bas pour la ligne déco)
    page.drawRectangle({ x: 75, y: 60, width: 95, height: 110, color: bgColor });
    
    // -----------------------------------------------------
    // ÉCRITURE DU TEXTE DYNAMIQUE
    // -----------------------------------------------------

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Dynamic Texts
    const name = (ticket.full_name || ticket.name || "Participant").toUpperCase();
    const theme = event.title;
    const dateStr = new Date(event.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const ticketRef = `REF: ${ticket.id.split('-')[0].toUpperCase()}`;

    // 1. [PRÉNOM NOM] - Centré horizontalement avec redimensionnement automatique si trop long
    let nameSize = 34;
    let nameWidth = fontBold.widthOfTextAtSize(name, nameSize);
    
    // Réduire la taille de police jusqu'à ce que le nom rentre dans 420 pixels (pour éviter le débordement)
    while (nameWidth > 420 && nameSize > 14) {
      nameSize -= 2;
      nameWidth = fontBold.widthOfTextAtSize(name, nameSize);
    }
    
    page.drawText(name, {
      x: (width - nameWidth) / 2,
      y: 508, // On réajuste pour bien chuter dans la boite
      size: nameSize,
      font: fontBold,
      color: rgb(0.2, 0.08, 0.05), // #32140c
    });

    // 2. Thème - Centré avec gestion des textes longs (retour à la ligne automatique)
    const themeSize = 20;
    const maxThemeWidth = 460; // On réduit pour que ça rentre bien dans le cadre
    const fullThemeText = `"${theme}"`;
    const themeWords = fullThemeText.split(' ');
    
    let themeLines: string[] = [];
    let currentThemeLine = '';

    for (const word of themeWords) {
      const testLine = currentThemeLine.length === 0 ? word : currentThemeLine + ' ' + word;
      const testWidth = fontBold.widthOfTextAtSize(testLine, themeSize);
      if (testWidth > maxThemeWidth && currentThemeLine.length > 0) {
        themeLines.push(currentThemeLine);
        currentThemeLine = word;
      } else {
        currentThemeLine = testLine;
      }
    }
    if (currentThemeLine.length > 0) {
      themeLines.push(currentThemeLine);
    }

    const themeLineHeight = themeSize * 1.4;
    // Ajuster le Y initial si on a plusieurs lignes pour rester centré dans la zone beige
    let themeStartY = 422;
    if (themeLines.length > 1) {
       themeStartY += ((themeLines.length - 1) * themeLineHeight) / 2;
    }

    themeLines.forEach((line, index) => {
      const lineWidth = fontBold.widthOfTextAtSize(line, themeSize);
      page.drawText(line, {
        x: (width - lineWidth) / 2,
        y: themeStartY - (index * themeLineHeight),
        size: themeSize,
        font: fontBold,
        color: rgb(0.78, 0.62, 0.31), // #c79d4f
      });
    });

    // 3. Date
    page.drawText(dateStr, {
      x: 195, 
      y: 193, // Ajourné vers le bas
      size: 14,
      font: fontBold,
      color: rgb(0.2, 0.08, 0.05),
    });

    // 4. Lieu (Ville) - Avec gestion des longs textes et redimensionnement
    if (event.location) {
        let locationSize = 13;
        // Si le lieu est long, réduire la police pour limiter les retours à la ligne excessifs
        if (event.location.length > 30) locationSize = 11;
        if (event.location.length > 50) locationSize = 9;
        
        const maxLocationWidth = 155; 
        const locWords = event.location.split(' ');
        
        let locLines: string[] = [];
        let curLocLine = '';

        for (const w of locWords) {
            const tLine = curLocLine.length === 0 ? w : curLocLine + ' ' + w;
            const tWidth = fontBold.widthOfTextAtSize(tLine, locationSize);
            if (tWidth > maxLocationWidth && curLocLine.length > 0) {
               locLines.push(curLocLine);
               curLocLine = w;
            } else {
               curLocLine = tLine;
            }
        }
        if (curLocLine.length > 0) locLines.push(curLocLine);

        const locLineHeight = locationSize * 1.3;
        let locStartY = 193; // Ajourné vers le bas
        if (locLines.length > 1) {
            locStartY += ((locLines.length - 1) * locLineHeight) / 2;
        }

        locLines.forEach((line, index) => {
            page.drawText(line, {
                x: 355, // Ramené vers la droite
                y: locStartY - (index * locLineHeight),
                size: locationSize,
                font: fontBold,
                color: rgb(0.2, 0.08, 0.05),
            });
        });
    }

    // 5. Code QR Unique
    try {
        const qrUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/verify/${ticket.id}` : `https://nfl-ga.vercel.app/verify/${ticket.id}`;
        // Génération du QR Code
        const qrBuffer = await qrcode.toBuffer(qrUrl, { 
            margin: 1, 
            color: { dark: '#32140c', light: '#fdfbf2' },
            width: 80 
        });
        const qrImage = await pdfDoc.embedPng(qrBuffer);
        
        page.drawImage(qrImage, {
            x: 85, // Encore décalé vers la droite
            y: 96, // Encore remonté
            width: 75,
            height: 75
        });

        // Texte sous le QR code (Reference de certificat unique)
        const refWidth = fontBold.widthOfTextAtSize(ticketRef, 10);
        page.drawText(ticketRef, {
            x: 85 + (75 - refWidth) / 2, // Centré sous le QR
            y: 81, // Encore remonté
            size: 10,
            font: fontBold,
            color: rgb(0.2, 0.08, 0.05)
        });
    } catch (e) {
        this.logger.error("Erreur de génération QR Code: " + e.message);
    }

    return await pdfDoc.save();
  }

  private async sendCertificateEmail(event: any, ticket: any, base64Pdf: string) {
    if (!process.env.BREVO_API_KEY) {
        throw new Error("Clé API Brevo manquante");
    }

    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { 
        email: process.env.BREVO_SENDER_EMAIL || "contact@nfl-courtier.ga", 
        name: "NFL Courtier & Service" 
      },
      to: [{ email: ticket.email, name: ticket.full_name }],
      subject: `Félicitations ! Votre Certificat de Participation - ${event.title}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fff; border: 1px solid #eee;">
          <div style="background: #32140c; padding: 32px; text-align: center;">
            <h1 style="color: #c79d4f; margin: 0;">NFL Courtier & Service</h1>
          </div>
          <div style="padding: 32px; line-height: 1.6; color: #333;">
            <h2 style="color: #32140c;">Félicitations pour votre participation !</h2>
            <p>Bonjour <strong>${ticket.full_name}</strong>,</p>
            <p>Nous avons le plaisir de vous transmettre votre certificat de participation pour l'événement : <strong>${event.title}</strong>.</p>
            <p>Ce document atteste de votre engagement et des compétences acquises lors de cette session.</p>
            <p>Vous trouverez votre certificat en pièce jointe de cet e-mail.</p>
            <div style="text-align: center; margin: 40px 0;">
                <p style="font-style: italic; color: #666;">"L'excellence est une discipline."</p>
            </div>
            <p style="margin-top: 40px;">Cordialement,<br/><strong>L'équipe NFL Courtier & Service</strong></p>
          </div>
          <div style="background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #999;">
            NFL Courtier & Service - Libreville, Gabon
          </div>
        </div>
      `,
      attachment: [
        {
          content: base64Pdf,
          name: `Certificat-${ticket.full_name.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`
        }
      ]
    }, {
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      }
    });
  }
}
