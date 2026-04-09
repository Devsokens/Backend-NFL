import {
  Injectable, NotFoundException, InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';

import { NewsletterService } from '../newsletter/newsletter.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly newsletterService: NewsletterService,
  ) {}

  async findAll() {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .select('*, tickets(status)')
      .order('date', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return data.map((event: any) => ({
      ...event,
      ticketsSold: event.tickets?.filter((t: any) => 
        ['validé', 'validated', 'utilisé', 'used', 'confirmed', 'confirmé'].includes(t.status)
      ).length || 0,
    }));
  }

  async findUpcoming() {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .select('*, tickets(status)')
      .eq('status', 'publié')
      .gte('date', today)
      .order('date', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return data.map((event: any) => ({
      ...event,
      ticketsSold: event.tickets?.filter((t: any) => 
        ['validé', 'validated', 'utilisé', 'used', 'confirmed', 'confirmé'].includes(t.status)
      ).length || 0,
    }));
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .select('*, tickets(id, status)')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException(`Événement #${id} introuvable`);
    return {
      ...data,
      ticketsSold: data.tickets?.filter((t: any) => 
        ['validé', 'validated', 'utilisé', 'used', 'confirmed', 'confirmé'].includes(t.status)
      ).length || 0,
    };
  }

  async create(dto: CreateEventDto) {
    const { sendNewsletter, ...eventData } = dto;
    
    // Set initial newsletter status based on sendNewsletter toggle
    const newsletterStatus = sendNewsletter ? 'sent' : 'none';
    const eventStatus = dto.status || 'brouillon';
    
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .insert({ 
        ...eventData, 
        currency: dto.currency || 'XAF', 
        newsletter_status: newsletterStatus,
        status: eventStatus 
      })
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    // Only notify if toggle was ON
    if (sendNewsletter) {
      this.newsletterService.notifyNewEvent(data).catch((e) => {
        console.error('[BACKGROUND] Newsletter notification failed:', e.message);
      });
    }

    return data;
  }

  async update(id: string, dto: UpdateEventDto) {
    const oldEvent = await this.findOne(id);
    const { sendNewsletter, ...eventData } = dto;

    // Logic: if user toggles ON and it wasn't already sent, trigger send
    const shouldSendNow = sendNewsletter && oldEvent.newsletter_status !== 'sent';
    const newStatus = shouldSendNow ? 'sent' : oldEvent.newsletter_status;

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .update({ 
        ...eventData, 
        updated_at: new Date().toISOString(),
        newsletter_status: newStatus 
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    // Execute background send if conditions are met
    if (shouldSendNow) {
      this.newsletterService.notifyNewEvent(data).catch((e) => {
        console.error('[BACKGROUND] Manual Newsletter trigger failed:', e.message);
      });
    }

    return data;
  }

  async remove(id: string) {
    await this.findOne(id);
    const { error } = await this.supabase
      .getAdminClient()
      .from('events')
      .delete()
      .eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
    return { message: `Événement #${id} supprimé avec succès` };
  }

  async getStats(id: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('status')
      .eq('event_id', id);
    if (error) throw new InternalServerErrorException(error.message);
    const stats = { total: data.length, validé: 0, utilisé: 0, annulé: 0, soumis: 0 };
    data.forEach((t) => { if (t.status in stats) stats[t.status]++; });
    return stats;
  }
}
