import { Module } from '@nestjs/common';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';
import { SupabaseService } from '../supabase.service';

@Module({
  controllers: [NewsletterController],
  providers: [NewsletterService, SupabaseService],
  exports: [NewsletterService],
})
export class NewsletterModule {}
