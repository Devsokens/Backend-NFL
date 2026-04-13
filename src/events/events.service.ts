import {
  Injectable, NotFoundException, InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';

import { NewsletterService } from '../newsletter/newsletter.service';

function generateSlug(title?: string): string {
  if (!title) return Math.random().toString(36).substring(2, 10);
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Injectable()
export class EventsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly newsletterService: NewsletterService,
  ) {}

  async findAll(includeDrafts = false) {
    let query = this.supabase
      .getAdminClient()
      .from('events')
      .select('*, tickets(status)');

    if (!includeDrafts) {
      query = query.eq('status', 'publié');
    }

    const { data, error } = await query.order('date', { ascending: true });
    
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
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    let query = this.supabase
      .getAdminClient()
      .from('events')
      .select('*, tickets(id, status)');
      
    if (isUuid) {
      query = query.eq('id', id);
    } else {
      query = query.eq('slug', id);
    }

    const { data, error } = await query.single();
    if (error || !data) throw new NotFoundException(`Événement introuvable`);
    return {
      ...data,
      ticketsSold: data.tickets?.filter((t: any) => 
        ['validé', 'validated', 'utilisé', 'used', 'confirmed', 'confirmé'].includes(t.status)
      ).length || 0,
    };
  }

  async create(dto: CreateEventDto) {
    const { sendNewsletter, ...eventData } = dto;
    
    const eventStatus = dto.status || 'brouillon';
    // Only send if explicit toggle is ON AND status is 'publié'
    const actuallySend = sendNewsletter && eventStatus === 'publié';
    const newsletterStatus = actuallySend ? 'sent' : 'none';
    const slug = generateSlug(eventData.title);
    
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .insert({ 
        ...eventData, 
        currency: dto.currency || 'XAF', 
        newsletter_status: newsletterStatus,
        status: eventStatus,
        slug
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

    const eventStatus = dto.status || oldEvent.status;
    
    // Logic: if user toggles ON, it's not already sent, AND the target status is 'publié'
    const shouldSendNow = sendNewsletter && oldEvent.newsletter_status !== 'sent' && eventStatus === 'publié';
    const newStatus = shouldSendNow ? 'sent' : oldEvent.newsletter_status;
    const updatePayload: any = { ...eventData, updated_at: new Date().toISOString(), newsletter_status: newStatus };
    
    if (!oldEvent.slug && eventData.title) {
       updatePayload.slug = generateSlug(eventData.title);
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[EventsService] Update failed for event ${id}:`, error.message);
      throw new InternalServerErrorException(`Erreur Database: ${error.message}`);
    }

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
    const event = await this.findOne(id); // Use findOne to handle slug/UUID resolution securely
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('tickets')
      .select('status')
      .eq('event_id', event.id);
    if (error) throw new InternalServerErrorException(error.message);
    const stats = { total: data.length, validé: 0, utilisé: 0, annulé: 0, soumis: 0 };
    data.forEach((t) => { if (t.status in stats) stats[t.status]++; });
    return stats;
  }
}
