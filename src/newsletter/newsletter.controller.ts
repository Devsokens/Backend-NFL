import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { NewsletterService } from './newsletter.service';
import { SubscribeNewsletterDto } from './dto/newsletter.dto';
import { SendManualNewsletterDto } from './dto/send-newsletter.dto';

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
  @ApiResponse({ status: 200, description: 'Liste des abonnés.' })
  findAll() {
    return this.newsletterService.findAll();
  }

  @Get('history')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Historique des newsletters', description: 'Retourne l\'historique des newsletters envoyées manuellement.' })
  @ApiResponse({ status: 200, description: 'Liste de l\'historique.' })
  getHistory() {
    return this.newsletterService.getHistory();
  }

  @Post('send')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Envoyer une newsletter manuelle', description: 'Envoie un email personnalisé à une liste de destinataires.' })
  @ApiResponse({ status: 201, description: 'Newsletter envoyée avec succès.' })
  sendNewsletter(@Body() dto: SendManualNewsletterDto) {
    return this.newsletterService.sendManualNewsletter(dto);
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
}

