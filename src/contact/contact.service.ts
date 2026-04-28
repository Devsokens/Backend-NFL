import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { CreateContactDto } from './dto/create-contact.dto';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import { LOGO_BASE64 } from '../assets/logo-constant';

@Injectable()
export class ContactService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return data;
  }

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
    }

    // 2. Send Emails (Non-blocking / Asynchronous)
    this.sendEmails(dto).catch(e => console.error('Background Email Error:', e));

    // Return immediate response to user
    return { 
      message: 'Votre message a bien été envoyé. Nous vous répondrons bientôt.',
      data: data || null 
    };
  }

  private async sendEmails(dto: CreateContactDto) {
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const adminEmail = process.env.BREVO_SENDER_EMAIL; 

    try {
      // 1. Notification to Admin
      await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { email: senderEmail, name: "NFL Website Notification" },
        to: [{ email: adminEmail }],
        replyTo: { email: dto.email, name: dto.name },
        subject: `[CONTACT] ${dto.subject}`,
        htmlContent: `
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
        `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY || '',
          'content-type': 'application/json'
        }
      });

      // 2. Confirmation to User
      await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { email: senderEmail, name: "NFL Courtier & Service" },
        to: [{ email: dto.email }],
        subject: 'Accusé de réception - Votre message pour NFL',
        htmlContent: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; color: #333;">
            <div style="text-align: center; background: #32140c; padding: 20px;">
               <img src="data:image/png;base64,${LOGO_BASE64}" alt="NFL Logo" style="max-height: 70px; display: block; margin: 0 auto;" />
            </div>
            <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
              <h2>Bonjour ${dto.name},</h2>
              <p>Nous avons bien reçu votre message concernant : <strong>${dto.subject}</strong>.</p>
              <p>Notre équipe examine votre demande et reviendra vers vous dans les plus brefs délais.</p>
              <p>Merci pour votre confiance.</p>
              <p>Cordialement,<br><strong>L'équipe NFL</strong></p>
            </div>
          </div>
        `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY || '',
          'content-type': 'application/json'
        }
      });

      console.log(`[CONTACT] E-mails envoyés via API pour : ${dto.email}`);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message || e.message : e.message;
      console.error(`[CONTACT] Error sending emails: ${msg}`);
    }
  }
}
