import {
  IsString, IsDateString, IsNumber, IsOptional, IsEnum, IsInt, Min, IsNotEmpty, IsBoolean
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Forum Entreprises & Leadership', description: 'Titre de l\'événement' })
  @IsString() @IsOptional() title?: string;

  @ApiPropertyOptional({ example: 'Journée professionnelle dédiée aux dirigeants...' })
  @IsOptional() @IsString() description?: string;

  @ApiProperty({ example: '2026-05-15', description: 'Date de l\'événement (YYYY-MM-DD)' })
  @IsDateString() @IsOptional() date?: string;

  @ApiProperty({ example: '20:00', description: 'Heure (HH:MM)' })
  @IsString() @IsOptional() time?: string;

  @ApiProperty({ example: 'Radisson Blu, Libreville', description: 'Lieu' })
  @IsString() @IsOptional() location?: string;

  @ApiProperty({ example: 25000, description: 'Prix en XAF' })
  @IsNumber() @Min(0) @IsOptional() price?: number;

  @ApiPropertyOptional({ example: 'XAF', default: 'XAF' })
  @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  @IsOptional() @IsString() image_url?: string;

  @ApiPropertyOptional({ enum: ['soirée', 'conférence', 'atelier', 'concert', 'seminaire'] })
  @IsOptional() @IsEnum(['soirée', 'conférence', 'atelier', 'concert', 'seminaire']) category?: string;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional() @IsInt() @Min(1) capacity?: number;

  @ApiPropertyOptional({ example: '+241077617776' })
  @IsOptional() @IsString() whatsapp_number?: string;

  @ApiPropertyOptional({ example: 'brouillon', enum: ['publié', 'brouillon', 'annulé'] })
  @IsOptional() @IsEnum(['publié', 'brouillon', 'annulé']) status?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional() @IsBoolean() sendNewsletter?: boolean;

  @ApiPropertyOptional({ example: 'none' })
  @IsOptional() @IsString() newsletter_status?: string;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}
