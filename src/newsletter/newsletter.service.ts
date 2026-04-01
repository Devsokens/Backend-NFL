import { Injectable, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { SubscribeNewsletterDto } from './dto/newsletter.dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NewsletterService {
  constructor(private readonly supabase: SupabaseService) {}

  async subscribe(dto: SubscribeNewsletterDto) {
    // Check if already subscribed
    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('newsletter_subscribers')
      .select('id')
      .eq('email', dto.email)
      .single();

    if (existing) throw new ConflictException('Cet email est déjà inscrit à la newsletter.');

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('newsletter_subscribers')
      .insert({ email: dto.email })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    // Send welcome email
    try {
      await this.sendWelcomeEmail(dto.email);
    } catch (e) {
      console.error('Welcome email failed:', e);
    }

    return { message: 'Abonnement confirmé ! Bienvenue dans la newsletter NFL 🎉', data };
  }

  async findAll() {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('newsletter_subscribers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return { count: data.length, subscribers: data };
  }

  async unsubscribe(email: string) {
    const { error } = await this.supabase
      .getAdminClient()
      .from('newsletter_subscribers')
      .delete()
      .eq('email', email);
    if (error) throw new InternalServerErrorException(error.message);
    return { message: `${email} a été désabonné avec succès.` };
  }

  private async sendWelcomeEmail(email: string) {
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      auth: {
        user: process.env.BREVO_SENDER_EMAIL,
        pass: process.env.BREVO_API_KEY,
      },
    });

    await transporter.sendMail({
      from: `"NFL Courtier & Service" <${process.env.BREVO_SENDER_EMAIL}>`,
      to: email,
      subject: '🎉 Bienvenue dans la Newsletter NFL !',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #32140c; padding: 32px; text-align: center;">
            <h1 style="color: #c79d4f; margin: 0;">NFL Courtier & Service</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #32140c;">Bienvenue ! 🥳</h2>
            <p style="color: #555; font-size: 16px;">Vous êtes maintenant abonné à notre newsletter. Vous recevrez en avant-première nos événements, nos offres de voyage et nos actualités.</p>
            <p style="color: #999; font-size: 12px; margin-top: 32px;">Pour vous désabonner, répondez à cet email avec "Désabonnement".</p>
          </div>
        </div>
      `,
    });
  }
}
