import { IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendManualNewsletterDto {
  @ApiProperty({ example: 'Offre exclusive de Pâques', description: 'Sujet de la newsletter' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ example: '<h1>Bonjour</h1><p>Voici nos offres...</p>', description: 'Contenu HTML de la newsletter' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: ['client1@gmail.com', 'client2@yahoo.fr'], description: 'Liste des destinataires' })
  @IsArray()
  @IsString({ each: true })
  recipientEmails: string[];
}
