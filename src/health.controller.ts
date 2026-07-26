import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { join } from 'node:path';

@ApiTags('Système')
@Controller()
export class HealthController {
  @Get()
  index(@Res() response: Response) {
    return response.sendFile(join(process.cwd(), 'public', 'index.html'));
  }

  @Get('health')
  health() {
    return { status: 'healthy', message: 'L’API NestJS est opérationnelle.' };
  }
}
