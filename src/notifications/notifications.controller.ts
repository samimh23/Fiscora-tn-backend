import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @RequirePermission(PermissionNames.NotificationsView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.list(
      organizationId,
      user.userId,
      unreadOnly === 'true',
    );
  }

  @Patch(':notificationId/read')
  @RequirePermission(PermissionNames.NotificationsView)
  markRead(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.markRead(organizationId, user.userId, notificationId);
  }

  @Patch('read-all')
  @RequirePermission(PermissionNames.NotificationsView)
  markAllRead(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.markAllRead(organizationId, user.userId);
  }

  @Post('scan')
  @RequirePermission(PermissionNames.NotificationsManage)
  scan(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.scan(organizationId);
  }
}
