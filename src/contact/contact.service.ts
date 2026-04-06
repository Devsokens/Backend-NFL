import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { CreateContactDto } from './dto/create-contact.dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ContactService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(dto: CreateContactDto) {
    // 1. Save to Supabase (table: contacts)
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('contacts')
      .insert({
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase Contact Error:', error);
      // We don't block the email if DB fails, but we should log it
    }

    // 2. Send Emails
    try {
      await this.sendEmails(dto);
    } catch (e) {
      console.error('Email sending failed:', e);
      throw new InternalServerErrorException("Une erreur est survenue lors de l'envoi de votre message.");
    }

    return { 
      message: 'Votre message a bien été envoyé. Nous vous répondrons bientôt.',
      data: data || null 
    };
  }

  private async sendEmails(dto: CreateContactDto) {
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_API_KEY,
      },
    });

    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const adminEmail = process.env.BREVO_SENDER_EMAIL; // Using sender for now or a config

    // Notification to Admin
    await transporter.sendMail({
      from: `"NFL Website" <${senderEmail}>`,
      to: adminEmail,
      replyTo: dto.email,
      subject: `[CONTACT] ${dto.subject}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #32140c;">Nouvelle demande de contact</h2>
          <p><strong>De:</strong> ${dto.name} (${dto.email})</p>
          <p><strong>Sujet:</strong> ${dto.subject}</p>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
            <p><strong>Message:</strong></p>
            <p>${dto.message.replace(/\n/g, '<br>')}</p>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #888;">Message envoyé depuis le formulaire de contact du site NFL.</p>
        </div>
      `,
    });

    // Confirmation to User
    await transporter.sendMail({
      from: `"NFL Courtier & Service" <${senderEmail}>`,
      to: dto.email,
      subject: 'Accusé de réception - Votre message pour NFL',
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="text-align: center; background: #32140c; padding: 20px;">
             <h1 style="color: #c79d4f; margin: 0;">NFL Courtier & Service</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
            <h2>Bonjour ${dto.name},</h2>
            <p>Nous avons bien reçu votre message concernant : <strong>${dto.subject}</strong>.</p>
            <p>Notre équipe examine votre demande et reviendra vers vous dans les plus brefs délais.</p>
            <p>Merci pour votre confiance.</p>
            <p>Cordialement,<br><strong>L'équipe NFL</strong></p>
          </div>
        </div>
      `,
    });
  }
}
