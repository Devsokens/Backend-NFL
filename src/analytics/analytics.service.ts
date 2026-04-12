import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async trackVisit(data: { path: string; userAgent?: string; referrer?: string }) {
    const { error } = await this.supabase.getAdminClient()
      .from('site_analytics')
      .insert([
        {
          path: data.path,
          user_agent: data.userAgent,
          referrer: data.referrer,
        }
      ]);

    if (error) {
      this.logger.error(`Erreur lors de l'enregistrement de la visite: ${error.message}`);
    }
    
    return { success: !error };
  }

  async getStats() {
    // On récupère les visites des 30 derniers jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data, error } = await this.supabase.getAdminClient()
      .from('site_analytics')
      .select('created_at, path')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Erreur lors de la récupération des stats: ${error.message}`);
      throw error;
    }

    // Agrégation pour 7 jours
    const stats7Days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      stats7Days[d.toISOString().split('T')[0]] = 0;
    }

    // Agrégation pour 30 jours
    const stats30Days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      stats30Days[d.toISOString().split('T')[0]] = 0;
    }

    if (data) {
      data.forEach(visit => {
        const dateStr = new Date(visit.created_at).toISOString().split('T')[0];
        
        if (stats30Days[dateStr] !== undefined) {
          stats30Days[dateStr]++;
        } else if (new Date(dateStr) >= thirtyDaysAgo) {
          stats30Days[dateStr] = 1;
        }

        if (stats7Days[dateStr] !== undefined) {
          stats7Days[dateStr]++;
        } else if (new Date(dateStr) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
           stats7Days[dateStr] = 1;
        }
      });
    }

    const chartData7Days = Object.entries(stats7Days).map(([date, visites]) => ({
      date: new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      visites
    }));

    const chartData30Days = Object.entries(stats30Days).map(([date, visites]) => ({
      date: new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      visites
    }));

    return {
      totalVisits: data ? data.length : 0,
      chartData7Days,
      chartData30Days
    };
  }
}
