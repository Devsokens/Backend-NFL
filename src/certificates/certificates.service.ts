import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

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
    // Ici on fixe une taille raisonnable
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

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Dynamic Texts
    const name = (ticket.full_name || ticket.name || "Participant").toUpperCase();
    const theme = event.title;
    const dateStr = new Date(event.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    // 1. [PRÉNOM NOM] - Centré horizontalement
    const nameSize = 34;
    const nameWidth = fontBold.widthOfTextAtSize(name, nameSize);
    page.drawText(name, {
      x: (width - nameWidth) / 2,
      y: 515, // Coordonnée Y estimée pour le milieu du certificat
      size: nameSize,
      font: fontBold,
      color: rgb(0.2, 0.08, 0.05), // #32140c
    });

    // 2. Thème (Masterclass title) - Centré
    const themeText = `"${theme}"`;
    const themeSize = 22;
    const themeWidth = fontBold.widthOfTextAtSize(themeText, themeSize);
    page.drawText(themeText, {
      x: (width - themeWidth) / 2,
      y: 410, // Coordonnée Y estimée
      size: themeSize,
      font: fontBold,
      color: rgb(0.78, 0.62, 0.31), // #c79d4f
    });

    // 3. Date - Alignée à gauche du bloc date (DÉLIVRÉ LE)
    page.drawText(dateStr, {
      x: 200, 
      y: 200,
      size: 14,
      font: fontBold,
      color: rgb(0.2, 0.08, 0.05),
    });

    // 4. Lieu (Ville) - Optionnel
    if (event.location) {
        page.drawText(event.location, {
            x: 360,
            y: 200,
            size: 14,
            font: fontBold,
            color: rgb(0.2, 0.08, 0.05),
        });
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
