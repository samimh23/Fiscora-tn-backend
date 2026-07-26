import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { ClientPortalService } from './client-portal.service';
import { CreateClientPortalMessageDto } from './dto';

@ApiTags('Portail client')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/dossiers/:dossierId/client-portal')
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
}
