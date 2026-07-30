import {
  Controller,
  Get,
  Headers,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  async getMetrics(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const expectedToken = process.env.METRICS_TOKEN?.trim();
    if (expectedToken && authorization !== `Bearer ${expectedToken}`) {
      throw new UnauthorizedException(
        'Une authentification est requise pour consulter les métriques.',
      );
    }
    response.setHeader('Content-Type', this.metrics.contentType);
    return this.metrics.render();
  }
}
