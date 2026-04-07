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
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .insert({ ...dto, currency: dto.currency || 'XAF' })
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    // Notify newsletter subscribers
    try {
      // Await the notification to ensure background process doesn't get killed 
      // by the hosting provider (Render/Vercel) before finishing.
      await this.newsletterService.notifyNewEvent(data);
    } catch (e) {
      console.error('Newsletter notification failed:', e);
    }

    return data;
  }

  async update(id: string, dto: UpdateEventDto) {
    await this.findOne(id);
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('events')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
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
