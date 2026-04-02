import {
  Injectable, NotFoundException, InternalServerErrorException, ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { CreateTicketDto, UpdateTicketStatusDto } from './dto/ticket.dto';
import * as QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

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
    eventLocation: string,
    ticketId: string,
    qrCodeDataUrl: string,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 250]);
    const { width, height } = page.getSize();

    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.196, 0.078, 0.047) });
    page.drawRectangle({ x: 0, y: 0, width: width * 0.65, height, color: rgb(0.224, 0.098, 0.059) });

    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const gold = rgb(0.784, 0.616, 0.31);
    const white = rgb(1, 1, 1);
    const lightGray = rgb(0.8, 0.8, 0.8);

    page.drawText('NFL COURTIER & SERVICE', { x: 24, y: height - 40, size: 14, font: boldFont, color: gold });
    page.drawText('BILLET D\'ENTRÉE', { x: 24, y: height - 58, size: 9, font: regularFont, color: lightGray });

    page.drawLine({ start: { x: 24, y: height - 68 }, end: { x: width * 0.62, y: height - 68 }, thickness: 1, color: gold, opacity: 0.4 });

    page.drawText(eventTitle, { x: 24, y: height - 92, size: 16, font: boldFont, color: white });
    page.drawText(`Date: ${eventDate}`, { x: 24, y: height - 118, size: 10, font: regularFont, color: lightGray });
    page.drawText(`Lieu: ${eventLocation}`, { x: 24, y: height - 136, size: 10, font: regularFont, color: lightGray });

    page.drawText('PARTICIPANT', { x: 24, y: height - 162, size: 8, font: boldFont, color: gold });
    page.drawText(fullName, { x: 24, y: height - 178, size: 12, font: boldFont, color: white });

    page.drawText('REF:', { x: 24, y: height - 204, size: 8, font: boldFont, color: gold });
    page.drawText(ticketId.toUpperCase(), { x: 50, y: height - 204, size: 8, font: regularFont, color: lightGray });

    const qrBase64 = qrCodeDataUrl.split(',')[1];
    const qrBuffer = Buffer.from(qrBase64, 'base64');
    const qrImage = await pdfDoc.embedPng(qrBuffer);
    const qrSize = 120;
    const qrX = width - qrSize - 30;
    const qrY = (height - qrSize) / 2;
    page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrSize + 8, height: qrSize + 8, color: white });
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    page.drawText('Scanner pour valider', { x: qrX - 2, y: qrY - 16, size: 7, font: regularFont, color: lightGray });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
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
      .select('*, events(title, date, location, whatsapp_number)')
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
          event.location,
          ticketId,
          qrCodeDataUrl,
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
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('*, events(title, date, location)')
      .eq('qr_code_data', qrCodeData)
      .single();
    if (error || !data) return { valid: false, message: 'QR Code invalide ou ticket introuvable' };
    if (data.status === 'utilisé') return { valid: false, message: 'Ticket déjà utilisé', ticket: data };
    if (data.status === 'annulé') return { valid: false, message: 'Ticket annulé', ticket: data };

    await this.supabase.getAdminClient().from('tickets').update({ status: 'utilisé' }).eq('id', data.id);
    return { valid: true, message: 'Ticket validé avec succès ✅', ticket: { ...data, status: 'utilisé' } };
  }
}
