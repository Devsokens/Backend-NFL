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

  async notifyNewEvent(event: any) {
    const { data: subscribers, error } = await this.supabase
      .getAdminClient()
      .from('newsletter_subscribers')
      .select('email');

    if (error) {
      console.error('Error fetching subscribers:', error);
      return;
    }
    
    if (!subscribers || subscribers.length === 0) {
      console.log('No newsletter subscribers found to notify.');
      return;
    }

    console.log(`[NEWSLETTER] Démarrage de l'envoi pour l'événement "${event.title}"`);
    console.log(`[NEWSLETTER] Nombre d'abonnés à notifier : ${subscribers.length}`);

    let successCount = 0;
    let failCount = 0;

    for (const sub of subscribers) {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://nfl-ga.vercel.app';
        const eventUrl = `${frontendUrl}/event/${event.id}`;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY || '',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            sender: { 
              email: process.env.BREVO_SENDER_EMAIL, 
              name: "NFL Courtier & Service" 
            },
            to: [{ email: sub.email }],
            subject: `Nouvel Evénement : ${event.title}`,
            htmlContent: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fff; border: 1px solid #eee;">
                <div style="background: #32140c; padding: 32px; text-align: center;">
                  <h1 style="color: #c79d4f; margin: 0;">NFL Courtier & Service</h1>
                </div>
                <div style="padding: 32px;">
                  <h2 style="color: #32140c;">Découvrez notre nouvel événement !</h2>
                  <p style="color: #555; font-size: 16px;">Nous avons le plaisir de vous annoncer l'ouverture des réservations pour : <strong>${event.title}</strong>.</p>
                  <div style="background: #f9f5ee; border-left: 4px solid #c79d4f; padding: 20px; border-radius: 8px; margin: 24px 0;">
                    <p style="margin: 0; color: #32140c;"><strong>Date:</strong> ${new Date(event.date).toLocaleDateString('fr-FR')}</p>
                    <p style="margin: 8px 0 0; color: #32140c;"><strong>Lieu:</strong> ${event.location}</p>
                  </div>
                  <p style="color: #555; font-size: 14px; margin: 24px 0;">${event.description ? event.description.substring(0, 200) + '...' : ''}</p>
                  <div style="text-align: center; margin-top: 32px;">
                    <a href="${eventUrl}" style="background: #c79d4f; color: #32140c; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Réserver ma place</a>
                  </div>
                  <p style="color: #999; font-size: 12px; margin-top: 32px; text-align: center;">Vous recevez cet email car vous êtes abonné à la newsletter NFL.</p>
                </div>
              </div>
            `
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(`Erreur API Brevo HTTP: ${errData.message || 'Requête rejetée'}`);
        }

        successCount++;
        console.log(`[NEWSLETTER] ✅ Mail via API envoyé à : ${sub.email}`);
      } catch (e) {
        failCount++;
        console.error(`[NEWSLETTER] ❌ Échec pour ${sub.email}:`, e.message);
      }
    }
    console.log(`[NEWSLETTER] Synthèse : ${successCount} envoyés, ${failCount} échecs.`);

    // Mise à jour du statut de l'événement pour notifier le frontend via Realtime
    try {
      await this.supabase
        .getAdminClient()
        .from('events')
        .update({ 
          newsletter_status: 'sent',
          newsletter_sent_at: new Date().toISOString() 
        })
        .eq('id', event.id);
      console.log(`[NEWSLETTER] Statut de l'événement ${event.id} mis à jour : 'sent'`);
    } catch (dbErr) {
      console.error(`[NEWSLETTER] Erreur mise à jour statut DB :`, dbErr.message);
    }
  }

  private async sendWelcomeEmail(email: string) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY || '',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { 
          email: process.env.BREVO_SENDER_EMAIL, 
          name: "NFL Courtier & Service" 
        },
        to: [{ email: email }],
        subject: 'Bienvenue dans la Newsletter NFL',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fff; border: 1px solid #eee;">
            <div style="background: #32140c; padding: 32px; text-align: center;">
              <h1 style="color: #c79d4f; margin: 0;">NFL Courtier & Service</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #32140c;">Bienvenue !</h2>
              <p style="color: #555; font-size: 16px;">Vous êtes maintenant abonné à notre newsletter. Vous recevrez en avant-première nos événements, nos offres de voyage et nos actualités.</p>
              <p style="color: #999; font-size: 12px; margin-top: 32px;">Pour vous désabonner, répondez à cet email avec "Désabonnement".</p>
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error(`Welcome email API Error:`, errData);
    } else {
      console.log(`Welcome email via API sent to ${email}`);
    }
  }

  async testSmtpConnection() {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.BREVO_SMTP_USER,
          pass: process.env.BREVO_API_KEY,
        },
      });

      const verifyResult = await transporter.verify();
      
      return { 
        status: 'success', 
        message: 'Connexion au serveur Brevo réussie !', 
        user: process.env.BREVO_SMTP_USER,
        verifyResult 
      };
    } catch (error) {
      console.error('SMTP Test Failed', error);
      return { 
        status: 'error', 
        message: "Échec de connexion à Brevo. Vérifiez vos identifiants dans l'onglet Environment de Render.", 
        error: error.message,
        user: process.env.BREVO_SMTP_USER || 'NON_DEFINI'
      };
    }
  }
}
