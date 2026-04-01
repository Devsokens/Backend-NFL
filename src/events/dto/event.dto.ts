import {
  IsString, IsDateString, IsNumber, IsOptional, IsEnum, IsInt, Min, IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Forum Entreprises & Leadership', description: 'Titre de l\'événement' })
  @IsString() @IsNotEmpty() title: string;

  @ApiPropertyOptional({ example: 'Journée professionnelle dédiée aux dirigeants...' })
  @IsOptional() @IsString() description?: string;

  @ApiProperty({ example: '2026-05-15', description: 'Date de l\'événement (YYYY-MM-DD)' })
  @IsDateString() date: string;

  @ApiProperty({ example: '20:00', description: 'Heure (HH:MM)' })
  @IsString() @IsNotEmpty() time: string;

  @ApiProperty({ example: 'Radisson Blu, Libreville', description: 'Lieu' })
  @IsString() @IsNotEmpty() location: string;

  @ApiProperty({ example: 25000, description: 'Prix en XAF' })
  @IsNumber() @Min(0) price: number;

  @ApiPropertyOptional({ example: 'XAF', default: 'XAF' })
  @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  @IsOptional() @IsString() image_url?: string;

  @ApiPropertyOptional({ enum: ['soirée', 'conférence', 'atelier', 'concert'] })
  @IsOptional() @IsEnum(['soirée', 'conférence', 'atelier', 'concert']) category?: string;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional() @IsInt() @Min(1) capacity?: number;

  @ApiPropertyOptional({ example: '+241077617776' })
  @IsOptional() @IsString() whatsapp_number?: string;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}
