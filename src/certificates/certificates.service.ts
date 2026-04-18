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
    const pdfDoc = await PDFDocument.create();
    const image = await pdfDoc.embedPng(templateBytes);
    
    // On s'adapte à la taille exacte de l'image (garantit le bon format Paysage/Portrait)
    const { width, height } = image.scale(1);
    const page = pdfDoc.addPage([width, height]); 

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });

    // -----------------------------------------------------
    // MASQUAGE DU TEXTE FICTIF
    // -----------------------------------------------------
    // Nouvelle couleur de fond d'après le template Paysage : beige/saumon clair #F9F0EF
    const bgColor = rgb(0.976, 0.941, 0.937); 
    
    // Le Thème est environ au centre de la page en hauteur (Gommage élargi aux extrémités)
    page.drawRectangle({ x: width * 0.08, y: height * 0.43, width: width * 0.84, height: height * 0.15, color: bgColor });
    
    // La Date: on suppose qu'elle est en bas à gauche (~25% X, ~20% Y) - Ramenée vers la droite pour éviter l'icône
    page.drawRectangle({ x: width * 0.23, y: height * 0.18, width: 140, height: 45, color: bgColor });

    // -----------------------------------------------------
    // ÉCRITURE DU TEXTE DYNAMIQUE
    // -----------------------------------------------------

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Dynamic Texts
    const name = (ticket.full_name || ticket.name || "Participant").toUpperCase();
    const theme = event.title;
    const dateStr = new Date(event.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    // 1. [PRÉNOM NOM] - Centré Horizontalement, plus haut sur la page (Y ~ 60%)
    let nameSize = Math.max(34, width * 0.04);
    let nameWidth = fontBold.widthOfTextAtSize(name, nameSize);
    
    const maxNameWidth = width * 0.7; // 70% de la largeur max
    while (nameWidth > maxNameWidth && nameSize > 14) {
      nameSize -= 2;
      nameWidth = fontBold.widthOfTextAtSize(name, nameSize);
    }
    
    page.drawText(name, {
      x: (width - nameWidth) / 2,
      y: height * 0.60, 
      size: nameSize,
      font: fontBold,
      color: rgb(0.2, 0.08, 0.05), // #32140c
    });

    // 2. Thème - Centré bas avec l'algorithme multiligne (Y ~ 48%)
    const themeSize = Math.max(20, width * 0.025);
    const maxThemeWidth = width * 0.8;
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
    let themeStartY = height * 0.50; // Approximatif
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
      x: width * 0.22, // Légèrement décalé à droite dans son masque
      y: height * 0.20,
      size: Math.max(14, width * 0.02),
      font: fontBold,
      color: rgb(0.2, 0.08, 0.05),
    });

    // Remarque : Le Lieu est désactivé et le QR Code supprimé.
    // Remarque : Rendu du Code QR retiré à la demande du client.

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
