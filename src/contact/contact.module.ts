import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { SupabaseService } from '../supabase.service';

@Module({
  controllers: [ContactController],
  providers: [ContactService, SupabaseService],
})
export class ContactModule {}
