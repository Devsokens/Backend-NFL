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

    // Agrégation par jour pour le graphique
    const statsByDay: Record<string, number> = {};
    
    // Initialiser les 7 derniers jours à 0 pour avoir un beau graphique même s'il manque des jours
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      statsByDay[dateStr] = 0;
    }

    if (data) {
      data.forEach(visit => {
        const dateStr = new Date(visit.created_at).toISOString().split('T')[0];
        // On ne compte que si on suit ce jour
        if (statsByDay[dateStr] !== undefined) {
          statsByDay[dateStr]++;
        } else if (statsByDay[dateStr] === undefined && new Date(dateStr) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
           // Si c'est dans les 7 derniers jours mais pas initialisé (cas rare dû aux fuseaux horaires), on initialise
           statsByDay[dateStr] = 1;
        }
      });
    }

    // Format pour Recharts: [{ date: '2023-10-01', visites: 12 }, ...]
    const chartData = Object.entries(statsByDay).map(([date, visites]) => ({
      date: new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      visites
    }));

    return {
      totalVisits: data ? data.length : 0,
      chartData
    };
  }
}
