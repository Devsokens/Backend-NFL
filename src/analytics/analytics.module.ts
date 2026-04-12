import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { SupabaseService } from '../supabase.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SupabaseService],
})
export class AnalyticsModule {}
