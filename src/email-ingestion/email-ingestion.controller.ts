import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { ClassifyInboundEmailDto } from './dto';
import { EmailIngestionService } from './email-ingestion.service';
import type { BrevoInboundPayload } from './email-ingestion.types';

@ApiTags('Réception de documents par e-mail')
@Controller('api/email-ingestion')
export class EmailIngestionWebhookController {
  constructor(private readonly service: EmailIngestionService) {}

  @Post('brevo')
  @HttpCode(202)
  receiveBrevoWithHeader(
    @Headers('x-fiscora-webhook-secret') secret: string | undefined,
    @Body() payload: BrevoInboundPayload,
  ) {
    return this.service.receiveBrevo(secret, payload);
  }

  // Kept for already-configured webhooks. New deployments use the header route
  // above so credentials do not appear in access logs or webhook URLs.
  @Post('brevo/:secret')
  @HttpCode(202)
  receiveBrevo(
    @Param('secret') secret: string,
    @Body() payload: BrevoInboundPayload,
  ) {
    return this.service.receiveBrevo(secret, payload);
  }
}

@ApiTags('Réception de documents par e-mail')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/email-ingestion')
export class EmailIngestionController {
  constructor(private readonly service: EmailIngestionService) {}

  @Get('unmatched')
  @RequirePermission(PermissionNames.DocumentsView)
  listUnmatched(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.service.listUnmatched(organizationId);
  }

  @Patch(':messageId/classify')
  @RequirePermission(PermissionNames.DocumentsUpload)
  classify(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: ClassifyInboundEmailDto,
  ) {
    return this.service.classify(
      organizationId,
      messageId,
      dto.dossierId,
      user.userId,
    );
  }
}
