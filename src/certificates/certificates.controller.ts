import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CertificatesService } from './certificates.service';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('generate/:eventId')
  @UseGuards(AuthGuard('jwt'))
  async generate(
    @Param('eventId') eventId: string,
    @Body('ticketIds') ticketIds: string[],
  ) {
    return this.certificatesService.generateAndSend(eventId, ticketIds);
  }
}
