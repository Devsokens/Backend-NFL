import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('track')
  async trackVisit(@Body() body: { path: string }, @Req() request: Request) {
    const userAgent = request.headers['user-agent'];
    const referrer = request.headers['referer'] || request.headers['referrer'] as string;
    
    return this.analyticsService.trackVisit({
      path: body.path,
      userAgent,
      referrer,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getStats() {
    return this.analyticsService.getStats();
  }
}
