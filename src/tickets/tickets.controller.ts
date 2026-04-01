import {
  Controller, Get, Post, Patch, Body, Param, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { TicketsService } from './tickets.service';
import { CreateTicketDto, UpdateTicketStatusDto } from './dto/ticket.dto';

@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @ApiOperation({
    summary: 'Réserver un ticket',
    description: 'Crée un ticket, génère un QR code et un PDF, et envoie le billet par email au participant.',
  })
  @ApiResponse({ status: 201, description: 'Ticket créé et email envoyé avec succès.' })
  @ApiResponse({ status: 404, description: 'Événement introuvable.' })
  create(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Lister tous les tickets', description: 'Retourne tous les tickets avec le détail de l\'événement associé.' })
  @ApiResponse({ status: 200, description: 'Liste de tous les tickets.' })
  findAll() {
    return this.ticketsService.findAll();
  }

  @Get('event/:eventId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Tickets d\'un événement', description: 'Retourne tous les tickets liés à un événement spécifique.' })
  @ApiParam({ name: 'eventId', description: 'UUID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Liste des tickets pour cet événement.' })
  findByEvent(@Param('eventId') eventId: string) {
    return this.ticketsService.findByEvent(eventId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Détail d\'un ticket' })
  @ApiParam({ name: 'id', description: 'UUID du ticket' })
  @ApiResponse({ status: 200, description: 'Détail du ticket.' })
  @ApiResponse({ status: 404, description: 'Ticket introuvable.' })
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '[Admin] Changer le statut d\'un ticket',
    description: 'Permet de changer le statut d\'un ticket (validé, utilisé, annulé, soumis).',
  })
  @ApiParam({ name: 'id', description: 'UUID du ticket' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour.' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.ticketsService.updateStatus(id, dto);
  }

  @Post('validate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '[Admin] Valider un ticket via QR Code',
    description: 'Prend les données du QR code scanné, vérifie le ticket et le marque comme "utilisé".',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { qr_code_data: { type: 'string', example: '{"ticketId":"NFL-ABCD1234","eventId":"uuid","email":"user@example.com"}' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Résultat de la validation.', schema: { example: { valid: true, message: 'Ticket validé', ticket: {} } } })
  validate(@Body('qr_code_data') qrCodeData: string) {
    return this.ticketsService.validate(qrCodeData);
  }
}
