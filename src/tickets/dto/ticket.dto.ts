import { IsString, IsEmail, IsNotEmpty, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ example: 'uuid-of-the-event', description: 'UUID de l\'événement' })
  @IsUUID() @IsNotEmpty() event_id: string;

  @ApiProperty({ example: 'Moussa Obiang', description: 'Nom complet du participant' })
  @IsString() @IsNotEmpty() full_name: string;

  @ApiProperty({ example: 'moussa@email.ga', description: 'Email du participant' })
  @IsEmail() @IsNotEmpty() email: string;

  @ApiProperty({ example: '+241077123456', description: 'Numéro de téléphone du participant' })
  @IsString() @IsNotEmpty() phone: string;

  @ApiProperty({ example: '+241066987654', description: 'Numéro de téléphone du compte mobile money (payeur)' })
  @IsString() @IsNotEmpty() payer_phone: string;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: ['validé', 'utilisé', 'annulé', 'soumis'], description: 'Nouveau statut du ticket' })
  @IsEnum(['validé', 'utilisé', 'annulé', 'soumis']) status: string;
}
