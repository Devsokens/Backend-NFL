import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { NewsletterService } from './newsletter.service';
import { SubscribeNewsletterDto } from './dto/newsletter.dto';

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @ApiOperation({
    summary: 'S\'abonner à la newsletter',
    description: 'Inscrit un email à la newsletter et envoie un email de bienvenue via Brevo.',
  })
  @ApiResponse({ status: 201, description: 'Abonnement confirmé.' })
  @ApiResponse({ status: 409, description: 'Email déjà inscrit.' })
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletterService.subscribe(dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Lister tous les abonnés', description: 'Retourne la liste complète des abonnés à la newsletter.' })
  @ApiResponse({ status: 200, description: 'Liste des abonnés.', schema: { example: { count: 42, subscribers: [{ id: 'uuid', email: 'user@example.com', created_at: '2026-04-01' }] } } })
  findAll() {
    return this.newsletterService.findAll();
  }

  @Delete(':email')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Désabonner un email' })
  @ApiParam({ name: 'email', description: 'Email à désabonner' })
  @ApiResponse({ status: 200, description: 'Email désabonné.' })
  unsubscribe(@Param('email') email: string) {
    return this.newsletterService.unsubscribe(email);
  }

  @Get('test-smtp')
  @ApiOperation({ summary: 'Test Diagnostic SMTP', description: 'Permet de vérifier en direct si les identifiants SMTP fonctionnent pour la newsletter.' })
  async testSmtp() {
    return this.newsletterService.testSmtpConnection();
  }
}
