import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
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
import { ClientPortalService } from './client-portal.service';
import { CreateClientPortalMessageDto } from './dto';
import {
  SaveClientApprovalDto,
  SaveClientNotificationPreferencesDto,
} from './dto';
import type { Request } from 'express';

@ApiTags('Portail client')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/client-portal',
)
export class ClientPortalController {
  constructor(private readonly service: ClientPortalService) {}

  @Get('messages')
  @RequirePermission(PermissionNames.ClientPortalView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.list(organizationId, dossierId, user.userId);
  }

  @Post('messages')
  @RequirePermission(PermissionNames.ClientPortalMessage)
  send(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateClientPortalMessageDto,
  ) {
    return this.service.send(organizationId, dossierId, user.userId, dto);
  }

  @Get('contacts')
  @RequirePermission(PermissionNames.ClientPortalView)
  contacts(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.contacts(organizationId, dossierId, user.userId);
  }

  @Get('approvals')
  @RequirePermission(PermissionNames.ClientPortalView)
  approvals(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.approvals(organizationId, dossierId, user.userId);
  }

  @Post('approvals')
  @RequirePermission(PermissionNames.ClientPortalView)
  approve(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveClientApprovalDto,
    @Req() request: Request,
  ) {
    return this.service.approve(
      organizationId,
      dossierId,
      user.userId,
      dto,
      request.ip,
      request.get('user-agent') ?? null,
    );
  }
}

@ApiTags('Préférences du portail client')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/client-portal')
export class ClientPortalPreferencesController {
  constructor(private readonly service: ClientPortalService) {}

  @Get('preferences')
  preferences(@CurrentUser() user: JwtUser) {
    return this.service.preferences(user.userId);
  }

  @Put('preferences')
  savePreferences(
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveClientNotificationPreferencesDto,
  ) {
    return this.service.savePreferences(user.userId, dto);
  }
}
