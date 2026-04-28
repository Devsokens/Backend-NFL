import { Injectable, ConflictException, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { SubscribeNewsletterDto } from './dto/newsletter.dto';
import { SendManualNewsletterDto } from './dto/send-newsletter.dto';
import axios from 'axios';
import { LOGO_BASE64 } from '../assets/logo-constant';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

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

    // Send welcome email (Non-blocking)
    this.sendWelcomeEmail(dto.email).catch(e => this.logger.error('Welcome email failed:', e));

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

  async getHistory() {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('newsletter_history')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // If table doesn't exist yet, return empty
      if (error.code === 'PGRST116' || error.message.includes('relation "newsletter_history" does not exist')) {
        return [];
      }
      throw new InternalServerErrorException(error.message);
    }
    return data;
  }

  async sendManualNewsletter(dto: SendManualNewsletterDto) {
    const { subject, content, recipientEmails, attachmentUrl, attachmentName } = dto;

    if (!recipientEmails || recipientEmails.length === 0) {      throw new ConflictException('Aucun destinataire sélectionné.');
    }

    this.logger.log(`[MANUAL-NEWSLETTER] Envoi de "${subject}" à ${recipientEmails.length} personnes.`);

    let successCount = 0;
    let failCount = 0;

    for (const email of recipientEmails) {
      try {
        await axios.post('https://api.brevo.com/v3/smtp/email', {
          sender: { 
            email: process.env.BREVO_SENDER_EMAIL, 
            name: "NFL Courtier & Service" 
          },
          to: [{ email }],
          subject: subject,
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fff; border: 1px solid #eee;">
              <div style="background: #32140c; padding: 32px; text-align: center;">
                <img src="data:image/png;base64,${LOGO_BASE64}" alt="NFL Logo" style="max-height: 70px; display: block; margin: 0 auto;" />
              </div>
              <div style="padding: 32px;">
                ${content}
                <p style="color: #999; font-size: 11px; margin-top: 40px; text-align: center; border-top: 1px solid #eee; pt: 20px;">
                  Vous recevez cet email car vous êtes abonné à la newsletter NFL. 
                  <br/> NFL Courtier & Service - Libreville, Gabon
                </p>
              </div>
            </div>
          `,
          ...(attachmentUrl && {
            attachment: [
              {
                url: attachmentUrl,
                name: attachmentName || "document.pdf"
              }
            ]
          })
        }, {
          headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY || '',
            'content-type': 'application/json'
          }
        });

        successCount++;
      } catch (e) {
        failCount++;
        const msg = axios.isAxiosError(e) ? e.response?.data?.message || e.message : e.message;
        this.logger.error(`Failed to send to ${email}: ${msg}`);
      }
    }

    // Save to history
    try {
      await this.supabase
        .getAdminClient()
        .from('newsletter_history')
        .insert({
          subject,
          content,
          recipient_count: recipientEmails.length,
          success_count: successCount,
          fail_count: failCount
        });
    } catch (e) {
      this.logger.error('Failed to log newsletter history:', e.message);
    }

    return {
      message: `Envoi terminé. Succès: ${successCount}, Échecs: ${failCount}`,
      successCount,
      failCount
    };
  }

  async notifyNewEvent(event: any) {
    const { data: subscribers, error } = await this.supabase
      .getAdminClient()
      .from('newsletter_subscribers')
      .select('email');

    if (error) {
      this.logger.error('Error fetching subscribers:', error);
      return;
    }
    
    if (!subscribers || subscribers.length === 0) {
      this.logger.log('No newsletter subscribers found to notify.');
      return;
    }

    this.logger.log(`[NEWSLETTER] Démarrage de l'envoi pour l'événement "${event.title}"`);

    let successCount = 0;
    let failCount = 0;

    for (const sub of subscribers) {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://nfl-ga.vercel.app';
        const eventUrl = `${frontendUrl}/event/${event.id}`;

        await axios.post('https://api.brevo.com/v3/smtp/email', {
          sender: { 
            email: process.env.BREVO_SENDER_EMAIL, 
            name: "NFL Courtier & Service" 
          },
          to: [{ email: sub.email }],
          subject: `Nouvel Evénement : ${event.title}`,
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fff; border: 1px solid #eee;">
              <div style="background: #32140c; padding: 32px; text-align: center;">
                <img src="data:image/png;base64,${LOGO_BASE64}" alt="NFL Logo" style="max-height: 70px; display: block; margin: 0 auto;" />
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #32140c;">Découvrez notre nouvel événement !</h2>
                <p style="color: #555; font-size: 16px;">Nous avons le plaisir de vous annoncer l'ouverture des réservations pour : <strong>${event.title}</strong>.</p>
                <div style="background: #f9f5ee; border-left: 4px solid #c79d4f; padding: 20px; border-radius: 8px; margin: 24px 0;">
                  <p style="margin: 0; color: #32140c;"><strong>Date:</strong> ${new Date(event.date).toLocaleDateString('fr-FR')}</p>
                  <p style="margin: 8px 0 0; color: #32140c;"><strong>Heure:</strong> ${event.time || "Non précisée"}</p>
                  <p style="margin: 8px 0 0; color: #32140c;"><strong>Lieu:</strong> ${event.location}</p>
                </div>
                <p style="color: #555; font-size: 14px; margin: 24px 0;">
                  ${event.description ? event.description.substring(0, 200) + '... ' : ''}
                  <a href="${eventUrl}" style="color: #c79d4f; text-decoration: underline; font-weight: bold;">Voir plus</a>
                </p>
                <div style="text-align: center; margin-top: 32px;">
                  <a href="${eventUrl}" style="background: #c79d4f; color: #32140c; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Réserver ma place</a>
                </div>
                <p style="color: #999; font-size: 12px; margin-top: 32px; text-align: center;">Vous recevez cet email car vous êtes abonné à la newsletter NFL.</p>
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

        successCount++;
      } catch (e) {
        failCount++;
        const msg = axios.isAxiosError(e) ? e.response?.data?.message || e.message : e.message;
        this.logger.error(`[NEWSLETTER] ❌ Échec pour ${sub.email}: ${msg}`);
      }
    }

    // Update event status
    try {
      await this.supabase
        .getAdminClient()
        .from('events')
        .update({ 
          newsletter_status: 'sent',
          newsletter_sent_at: new Date().toISOString() 
        })
        .eq('id', event.id);
    } catch (dbErr) {
      this.logger.error(`[NEWSLETTER] Erreur mise à jour statut DB : ${dbErr.message}`);
    }
  }

  private async sendWelcomeEmail(email: string) {
    try {
      await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { 
          email: process.env.BREVO_SENDER_EMAIL, 
          name: "NFL Courtier & Service" 
        },
        to: [{ email: email }],
        subject: 'Bienvenue dans la Newsletter NFL',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fff; border: 1px solid #eee;">
            <div style="background: #32140c; padding: 24px; text-align: center;">
              <img src="data:image/png;base64,${LOGO_BASE64}" alt="NFL Logo" style="max-height: 70px; display: block; margin: 0 auto;" />
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #32140c;">Bienvenue !</h2>
              <p style="color: #555; font-size: 16px;">Vous êtes maintenant abonné à notre newsletter. Vous recevrez en avant-première nos événements, nos offres de voyage et nos actualités.</p>
              <p style="color: #999; font-size: 12px; margin-top: 32px;">Pour vous désabonner, répondez à cet email avec "Désabonnement".</p>
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
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message || JSON.stringify(e.response?.data) : e.message;
      this.logger.error(`Welcome email API Error: ${msg}`);
    }
  }
}


