import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister tous les événements', description: 'Retourne la liste complète des événements triés par date.' })
  @ApiResponse({ status: 200, description: 'Liste des événements.' })
  findAll() {
    return this.eventsService.findAll();
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Événements à venir', description: 'Retourne uniquement les événements dont la date est dans le futur.' })
  @ApiResponse({ status: 200, description: 'Liste des événements à venir.' })
  findUpcoming() {
    return this.eventsService.findUpcoming();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un événement', description: 'Retourne les détails d\'un événement, y compris le nombre de tickets.' })
  @ApiParam({ name: 'id', description: 'UUID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Détail de l\'événement.' })
  @ApiResponse({ status: 404, description: 'Événement introuvable.' })
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Get(':id/stats')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Statistiques des tickets d\'un événement', description: 'Retourne le décompte des tickets par statut pour un événement donné.' })
  @ApiParam({ name: 'id', description: 'UUID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Statistiques des tickets.', schema: { example: { total: 45, validé: 30, utilisé: 10, annulé: 3, soumis: 2 } } })
  getStats(@Param('id') id: string) {
    return this.eventsService.getStats(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Créer un événement', description: 'Crée un nouvel événement. Nécessite une authentification admin.' })
  @ApiResponse({ status: 201, description: 'Événement créé avec succès.' })
  create(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.create(createEventDto);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Mettre à jour un événement' })
  @ApiParam({ name: 'id', description: 'UUID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Événement mis à jour.' })
  update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto) {
    return this.eventsService.update(id, updateEventDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Supprimer un événement' })
  @ApiParam({ name: 'id', description: 'UUID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Événement supprimé.' })
  remove(@Param('id') id: string) {
    return this.eventsService.remove(id);
  }
}
