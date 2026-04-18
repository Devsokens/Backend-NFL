import { Module } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { SupabaseService } from '../supabase.service';

@Module({
  providers: [CertificatesService, SupabaseService],
  controllers: [CertificatesController],
  exports: [CertificatesService],
})
export class CertificatesModule {}
