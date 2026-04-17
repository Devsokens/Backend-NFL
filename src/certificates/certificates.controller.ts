import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('generate/:eventId')
  @UseGuards(JwtAuthGuard)
  async generate(
    @Param('eventId') eventId: string,
    @Body('ticketIds') ticketIds: string[],
  ) {
    return this.certificatesService.generateAndSend(eventId, ticketIds);
  }
}
