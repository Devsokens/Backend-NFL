import { IsString, IsEmail, IsNotEmpty, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ example: 'uuid-of-the-event', description: 'UUID de l\'événement' })
  @IsUUID() @IsNotEmpty() event_id: string;

  @ApiProperty({ example: '+241077617776', description: 'Numéro de téléphone du payeur' })
  @IsString() @IsNotEmpty() payer_phone: string;

  @ApiPropertyOptional({ example: 'Jean Mboulou', description: 'Nom final du payeur (optionnel)' })
  @IsOptional() @IsString() payer_name?: string;

  @ApiProperty({ example: 'Moussa Obiang', description: 'Nom complet du participant' })
  @IsString() @IsNotEmpty() full_name: string;

  @ApiProperty({ example: 'moussa@email.ga', description: 'Email du participant' })
  @IsEmail() @IsNotEmpty() email: string;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: ['validé', 'utilisé', 'annulé', 'soumis'], description: 'Nouveau statut du ticket' })
  @IsEnum(['validé', 'utilisé', 'annulé', 'soumis']) status: string;
}
