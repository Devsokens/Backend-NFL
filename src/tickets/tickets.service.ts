import {
  Injectable, NotFoundException, InternalServerErrorException, ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { CreateTicketDto, UpdateTicketStatusDto } from './dto/ticket.dto';
import * as QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import * as nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TicketsService {
  constructor(private readonly supabase: SupabaseService) {}

  private async sendEmailWithTicket(
    email: string,
    fullName: string,
    eventTitle: string,
    eventDate: string,
    eventLocation: string,
    ticketId: string,
    qrCodeBase64: string,
    pdfBuffer: Buffer,
  ) {
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_API_KEY,
      },
    });

    try {
      await transporter.sendMail({
        from: `"NFL Courtier & Service" <${process.env.BREVO_SENDER_EMAIL}>`,
        to: email,
        subject: `🎟️ Votre billet — ${eventTitle}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="background: #32140c; padding: 32px; text-align: center;">
              <h1 style="color: #c79d4f; margin: 0; font-size: 28px;">NFL Courtier & Service</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #32140c;">Bonjour ${fullName} 👋</h2>
              <p style="color: #555; font-size: 16px;">Votre inscription à l'événement <strong>${eventTitle}</strong> est confirmée !</p>
              <div style="background: #f9f5ee; border-left: 4px solid #c79d4f; padding: 20px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0; color: #32140c;"><strong>📅 Date:</strong> ${eventDate}</p>
                <p style="margin: 8px 0 0; color: #32140c;"><strong>📍 Lieu:</strong> ${eventLocation}</p>
                <p style="margin: 8px 0 0; color: #32140c;"><strong>🎫 Référence:</strong> ${ticketId}</p>
              </div>
              <p style="color: #555;">Votre billet PDF est joint à cet email. Présentez-le à l'entrée.</p>
              <hr style="border: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px; text-align: center;">© NFL Courtier & Service — Libreville, Gabon</p>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: `ticket-nfl-${ticketId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (error) {
      console.error("DÉTAIL ERREUR NODEMAILER :", error);
      throw error;
    }
  }

  private async generatePDF(
    fullName: string,
    eventTitle: string,
    eventDate: string,
    eventTime: string,
    eventLocation: string,
    ticketId: string,
    qrCodeData: string,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 250]);
    const { width, height } = page.getSize();

    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 1. Fond blanc
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });

    // 2. Séparateur de la souche (ligne fine dorée à gauche)
    const stubWidth = 140;
    page.drawLine({
      start: { x: stubWidth, y: 20 },
      end: { x: stubWidth, y: height - 20 },
      thickness: 1,
      color: rgb(0.8, 0.6, 0.2), // Or
      opacity: 0.3
    });

    // 3. Dessiner le logo NFL (Chargé depuis les assets du frontend)
    try {
      const logoPath = path.join(process.cwd(), '..', 'nfl-tickets', 'src', 'assets', 'LOGO_NFL-removebg-preview.png');
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        const logoImg = await pdfDoc.embedPng(logoBytes);
        page.drawImage(logoImg, { x: 160, y: height - 60, width: 60, height: 40 });
      }
    } catch (e) {
      console.log("Logo non chargé dans le PDF");
    }

    // 4. Section GAUCHE (Souche) - Infos
    const stubX = 20;
    // Date
    page.drawText('DATE', { x: stubX, y: height - 80, size: 8, font: boldFont, color: rgb(0.7,0.7,0.7) });
    page.drawText(eventDate, { x: stubX, y: height - 100, size: 12, font: boldFont, color: rgb(0,0,0) });
    
    // Heure
    page.drawText('HEURE', { x: stubX, y: height - 130, size: 8, font: boldFont, color: rgb(0.7,0.7,0.7) });
    page.drawText(eventTime, { x: stubX, y: height - 150, size: 12, font: boldFont, color: rgb(0,0,0) });

    // Tarif
    page.drawText('TARIF', { x: stubX, y: height - 180, size: 8, font: boldFont, color: rgb(0.7,0.7,0.7) });
    page.drawText('PAYÉ ✓', { x: stubX, y: height - 200, size: 12, font: boldFont, color: rgb(0.2, 0.6, 0.2) });

    // 5. Section CENTRE (Corps) - Texte VERTICAL
    // Le titre est écrit verticalement comme sur l'image
    page.drawText(eventTitle.toUpperCase(), {
      x: 300,
      y: 40,
      size: 20,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
      rotate: degrees(90),
    });

    page.drawText(eventLocation.toUpperCase(), {
      x: 340,
      y: 40,
      size: 11,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
      rotate: degrees(90),
    });

    // 6. Infos Participant (Horizontales)
    page.drawText(`PARTICIPANT: ${fullName.toUpperCase()}`, { x: 160, y: 50, size: 10, font: boldFont, color: rgb(0,0,0) });
    page.drawText(`REF: ${ticketId}`, { x: 160, y: 35, size: 10, font: regularFont, color: rgb(0.5, 0.5, 0.5) });

    // 7. QR CODE (À DROITE)
    try {
      const qrImage = await QRCode.toDataURL(qrCodeData, { margin: 1, color: { dark: '#000000', light: '#FFFFFF' } });
      const qrBuffer = Buffer.from(qrImage.split(',')[1], 'base64');
      const qrDocImg = await pdfDoc.embedPng(qrBuffer);
      page.drawImage(qrDocImg, { x: width - 110, y: height - 110, width: 90, height: 90 });
      page.drawText('VALIDATION ACCÈS', { x: width - 110, y: height - 125, size: 7, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    } catch (e) {
      console.error("QR Code Error in PDF:", e);
    }

    return Buffer.from(await pdfDoc.save());
  }

  async create(dto: CreateTicketDto) {
    const { data: event, error: evErr } = await this.supabase
      .getClient()
      .from('events')
      .select('*')
      .eq('id', dto.event_id)
      .single();
    if (evErr || !event) throw new NotFoundException('Événement introuvable');

    const { data: existing, error: checkErr } = await this.supabase
      .getClient()
      .from('tickets')
      .select('id')
      .eq('event_id', dto.event_id)
      .eq('email', dto.email)
      .not('status', 'eq', 'annulé') 
      .limit(1);

    if (checkErr) { console.error("Erreur check anti-fraude :", checkErr); }

    if (existing && existing.length > 0) {
      throw new ConflictException('Cet email est déjà enregistré pour cet événement.');
    }

    const ticketId = `NFL-${uuidv4().split('-')[0].toUpperCase()}`;
    const qrData = JSON.stringify({ ticketId, eventId: dto.event_id, email: dto.email });

    const { data: ticket, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .insert({ 
        event_id: dto.event_id,
        full_name: dto.full_name,
        email: dto.email,
        phone: dto.phone,
        payer_phone: dto.payer_phone,
        qr_code_data: qrData, 
        status: 'soumis' 
      })
      .select()
      .single();

    if (error) {
      console.error("ERREUR CRITIQUE INSERT TICKET :", error);
      throw new InternalServerErrorException(`Supabase Error: ${error.message} (Code: ${error.code})`);
    }

    return { ...ticket, message: 'Ticket créé et sauvegardé avec succès (en attente de paiement)' };
  }

  async findAll() {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('*, events(title, date, location)')
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async findByEvent(eventId: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('*, events(title, date, time, location, whatsapp_number)')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException(`Ticket #${id} introuvable`);
    return data;
  }

  async updateStatus(id: string, dto: UpdateTicketStatusDto) {
    const existingTicket = await this.findOne(id);
    
    if (dto.status === 'validé' && existingTicket.status !== 'validé') {
      try {
        const qrData = existingTicket.qr_code_data;
        let parsedQr: any = {};
        try { parsedQr = JSON.parse(qrData); } catch (e) {}
        const ticketId = parsedQr.ticketId || id.split('-')[0].toUpperCase();
        
        const qrCodeDataUrl = await QRCode.toDataURL(qrData, { width: 200 });
        
        const event = existingTicket.events;
        const pdfBuffer = await this.generatePDF(
          existingTicket.full_name,
          event.title,
          event.date,
          event.time || "20:00",
          event.location,
          ticketId,
          qrData,
        );

        await this.sendEmailWithTicket(
          existingTicket.email,
          existingTicket.full_name,
          event.title,
          event.date,
          event.location,
          ticketId,
          qrCodeDataUrl,
          pdfBuffer,
        );
      } catch (err) {
        console.error("Erreur lors de la génération/envoi du ticket validé :", err);
        throw new InternalServerErrorException(`Billet généré mais échec de l'envoi d'email : ${err.message}`);
      }
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .update({ status: dto.status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async validate(qrCodeData: string) {
    // 1. Essai de correspondance exacte avec la colonne qr_code_data
    let { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('*, events(title, date, location)')
      .eq('qr_code_data', qrCodeData)
      .maybeSingle();

    // 2. Si pas de match exact, on essaie d'extraire le ticketId si c'est du JSON
    if (!data) {
      try {
        const parsed = JSON.parse(qrCodeData);
        if (parsed.ticketId) {
          const { data: byId, error: errId } = await this.supabase
            .getAdminClient()
            .from('tickets')
            .select('*, events(title, date, location)')
            .ilike('qr_code_data', `%${parsed.ticketId}%`)
            .maybeSingle();
          if (byId) data = byId;
        }
      } catch (e) {
        // Pas du JSON, on ignore
      }
    }

    if (!data) return { valid: false, message: 'QR Code invalide ou ticket introuvable.' };
    if (data.status === 'utilisé') return { valid: false, message: 'Ticket déjà validé et utilisé.', ticket: data };
    if (data.status === 'annulé') return { valid: false, message: 'Ce billet a été officiellement annulé.', ticket: data };

    // Marquer comme utilisé
    await this.supabase.getAdminClient().from('tickets').update({ status: 'utilisé' }).eq('id', data.id);
    
    return { 
      valid: true, 
      message: 'Accès autorisé ! ✅', 
      ticket: { ...data, status: 'utilisé' } 
    };
  }
}
