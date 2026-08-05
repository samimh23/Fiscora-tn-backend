import {
  Body,
  Controller,
  Get,
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
import { PlatformAdminGuard } from '../common/platform-admin.guard';
import {
  RevokePlatformSessionsDto,
  SendPlatformTestEmailDto,
  UpdatePlatformStatusDto,
} from './dto';
import { PlatformAdminService } from './platform-admin.service';

@ApiTags('Administration de la plateforme')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PlatformAdminGuard)
@Controller('api/platform-admin')
export class PlatformAdminController {
  constructor(private readonly service: PlatformAdminService) {}

  @Get('overview')
  overview() {
    return this.service.overview();
  }

  @Get('organizations')
  organizations() {
    return this.service.organizations();
  }

  @Patch('organizations/:organizationId/status')
  updateOrganizationStatus(
    @CurrentUser() user: JwtUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdatePlatformStatusDto,
  ) {
    return this.service.updateOrganizationStatus(user, organizationId, dto);
  }

  @Get('users')
  users() {
    return this.service.users();
  }

  @Patch('users/:userId/status')
  updateUserStatus(
    @CurrentUser() user: JwtUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdatePlatformStatusDto,
  ) {
    return this.service.updateUserStatus(user, userId, dto);
  }

  @Post('users/:userId/revoke-sessions')
  revokeUserSessions(
    @CurrentUser() user: JwtUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RevokePlatformSessionsDto,
  ) {
    return this.service.revokeUserSessions(user, userId, dto);
  }

  @Get('jobs')
  jobs() {
    return this.service.jobs();
  }

  @Get('email/status')
  emailStatus() {
    return this.service.emailStatus();
  }

  @Get('email/logs')
  emailLogs() {
    return this.service.emailLogs();
  }

  @Post('email/test')
  sendTestEmail(@CurrentUser() user: JwtUser, @Body() dto: SendPlatformTestEmailDto) {
    return this.service.sendTestEmail(user, dto);
  }

  @Get('audit-logs')
  auditLogs() {
    return this.service.auditLogs();
  }
}
