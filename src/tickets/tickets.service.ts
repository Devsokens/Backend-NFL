import {
  Injectable, NotFoundException, InternalServerErrorException, ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { CreateTicketDto, UpdateTicketStatusDto } from './dto/ticket.dto';
import * as QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { LOGO_URL } from '../assets/logo-constant';

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
    try {
      await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { email: process.env.BREVO_SENDER_EMAIL, name: "NFL Courtier & Service" },
        to: [{ email: email, name: fullName }],
        subject: `Votre billet — ${eventTitle}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="background: #32140c; padding: 5px; text-align: center;">
              <img src="${LOGO_URL}" alt="NFL Logo" style="max-width: 280px; height: auto; display: block; margin: 0 auto;" />
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #32140c;">Bonjour ${fullName}</h2>
              <p style="color: #555; font-size: 16px;">Votre inscription à l'événement <strong>${eventTitle}</strong> est confirmée !</p>
              <div style="background: #f9f5ee; border-left: 4px solid #c79d4f; padding: 20px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0; color: #32140c;"><strong>Date:</strong> ${eventDate}</p>
                <p style="margin: 8px 0 0; color: #32140c;"><strong>Lieu:</strong> ${eventLocation}</p>
                <p style="margin: 8px 0 0; color: #32140c;"><strong>Référence:</strong> ${ticketId}</p>
              </div>
              <p style="color: #555;">Votre billet PDF est joint à cet email. Présentez-le à l'entrée.</p>
              <hr style="border: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px; text-align: center;">© NFL Courtier & Service — Libreville, Gabon</p>
            </div>
          </div>
        `,
        attachment: [
          {
            content: pdfBuffer.toString('base64'),
            name: `ticket-nfl-${ticketId}.pdf`
          }
        ]
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY || '',
          'content-type': 'application/json'
        }
      });

      console.log(`[TICKETS] Billet envoyé via API à : ${email}`);
    } catch (error) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error.message;
      console.error("[TICKETS] ÉCHEC ENVOI API :", msg);
    }
  }

  private async generatePDF(
    fullName: string,
    eventTitle: string,
    eventDate: string,
    eventTime: string,
    eventLocation: string,
    eventPrice: number | string,
    ticketId: string,
    qrCodeDataUrl: string,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 250]);
    const { width, height } = page.getSize();
 
    // Fond sombre
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.196, 0.078, 0.047) });
    // Découpe
    page.drawRectangle({ x: 0, y: 0, width: width * 0.65, height, color: rgb(0.224, 0.098, 0.059) });
 
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const gold = rgb(0.784, 0.616, 0.31);
    const white = rgb(1, 1, 1);
    const lightGray = rgb(0.8, 0.8, 0.8);
 
    // Intégration du LOGO
    try {
      // Chemin relatif à la racine du projet backend
      const logoPath = path.resolve(process.cwd(), 'src/assets/logo.png');
      
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const logoImage = await pdfDoc.embedPng(logoBuffer);
        const logoDims = logoImage.scale(0.12);
        page.drawImage(logoImage, {
          x: 24,
          y: height - logoDims.height - 10,
          width: logoDims.width,
          height: logoDims.height,
        });
      } else {
        page.drawText('NFL COURTIER & SERVICE', { x: 24, y: height - 35, size: 12, font: boldFont, color: gold });
      }
    } catch (e) {
      console.warn("PDF LOGO FAIL (Fallback to text):", e.message);
      page.drawText('NFL COURTIER & SERVICE', { x: 24, y: height - 35, size: 12, font: boldFont, color: gold });
    }
 
    page.drawText('BILLET D\'ENTRÉE', { x: 24, y: height - 60, size: 8, font: regularFont, color: lightGray });
 
    page.drawLine({ start: { x: 24, y: height - 70 }, end: { x: width * 0.62, y: height - 70 }, thickness: 1, color: gold, opacity: 0.4 });
 
    // Titre de l'événement avec gestion du retour à la ligne
    const safeTitle = (eventTitle || "Événement").toUpperCase();
    const maxTitleWidth = width * 0.6 - 24;
    const titleSize = 15;
    
    // Fonction simple de découpe de texte
    const words = safeTitle.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const textWidth = boldFont.widthOfTextAtSize(currentLine + " " + word, titleSize);
        if (textWidth < maxTitleWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);

    // Limiter à 2 lignes pour garder le design propre
    let titleY = height - 95;
    const titleLines = lines.slice(0, 2);
    titleLines.forEach((line, index) => {
      page.drawText(line, { 
        x: 24, 
        y: titleY - (index * 18), 
        size: titleSize, 
        font: boldFont, 
        color: white 
      });
    });
    
    // Ajuster le point de départ des infos suivantes
    const infoStartY = titleY - (titleLines.length * 18) - 10;
    
    // Infos Événement repositionnées
    page.drawText(`Date: ${eventDate || "À venir"}`, { x: 24, y: infoStartY, size: 10, font: regularFont, color: lightGray });
    page.drawText(`Heure: ${eventTime || "20:00"}`, { x: 140, y: infoStartY, size: 10, font: regularFont, color: lightGray });
    page.drawText(`Lieu: ${eventLocation || "Libreville"}`, { x: 24, y: infoStartY - 18, size: 10, font: regularFont, color: lightGray });
    
    // Tarif
    const displayPrice = (eventPrice && Number(eventPrice) > 0) 
      ? `${Number(eventPrice).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA` 
      : 'Gratuit / Sur invitation';
      
    page.drawText('TARIF:', { x: 24, y: infoStartY - 38, size: 8, font: boldFont, color: gold });
    page.drawText(displayPrice, { x: 65, y: infoStartY - 38, size: 10, font: boldFont, color: white });
 
    // Participant
    page.drawText('PARTICIPANT', { x: 24, y: infoStartY - 62, size: 8, font: boldFont, color: gold });
    page.drawText(String(fullName || "Invité"), { x: 24, y: infoStartY - 78, size: 12, font: boldFont, color: white });
 
    // Référence
    page.drawText('REF:', { x: 24, y: infoStartY - 104, size: 8, font: boldFont, color: gold });
    page.drawText(ticketId.toUpperCase(), { x: 50, y: infoStartY - 104, size: 8, font: regularFont, color: lightGray });
 
    // QR Code sécurisé
    try {
      if (qrCodeDataUrl && qrCodeDataUrl.includes(',')) {
        const qrBase64 = qrCodeDataUrl.split(',')[1];
        const qrBuffer = Buffer.from(qrBase64, 'base64');
        const qrImage = await pdfDoc.embedPng(qrBuffer);
        const qrSize = 120;
        const qrX = width - qrSize - 30;
        const qrY = (height - qrSize) / 2;
        page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrSize + 8, height: qrSize + 8, color: white });
        page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
        page.drawText('Scanner pour valider', { x: qrX - 2, y: qrY - 16, size: 7, font: regularFont, color: lightGray });
      }
    } catch (e) {
      console.warn("QR CODE EMBED FAIL:", e.message);
    }
 
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
      .select('*, events(*)')
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async findByEvent(eventId: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('*, events(*)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('*, events(*)')
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
        
        let event = existingTicket.events || (existingTicket as any).event;
        if (Array.isArray(event)) event = event[0];
        
        if (!event) {
          throw new Error("L'événement associé à ce ticket est introuvable.");
        }
 
        const pdfBuffer = await this.generatePDF(
          existingTicket.full_name || "Invité",
          event.title || "Événement",
          event.date || "À venir",
          event.time || "20:00",
          event.location || "Libreville",
          event.price || 0,
          ticketId,
          qrCodeDataUrl || "",
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

  async getTicketPdf(id: string) {
    try {
      const ticket = await this.findOne(id);
      console.log("DEBUG: ticket.events structure =", JSON.stringify(ticket.events, null, 2));
      
      let event = ticket.events;
      if (Array.isArray(event)) event = event[0];
      
      if (!event) {
        throw new Error("L'événement associé à ce ticket est introuvable.");
      }
      
      const qrData = ticket.qr_code_data;
      let parsedQr: any = {};
      try { parsedQr = JSON.parse(qrData); } catch (e) {}
      const ticketId = parsedQr.ticketId || id.split('-')[0].toUpperCase();
      
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, { width: 200 });
      
      const buffer = await this.generatePDF(
        ticket.full_name || "Invité",
        event.title || "Événement",
        event.date || "Date à venir",
        event.time || "20:00",
        event.location || "Libreville",
        event.price || 0,
        ticketId,
        qrCodeDataUrl || "",
      );

      return {
        buffer,
        filename: `Billet_${ticketId}.pdf`
      };
    } catch (err) {
      console.error("PDF GENERATION ERROR:", err);
      throw new InternalServerErrorException(`Erreur de génération PDF: ${err.message}`);
    }
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
