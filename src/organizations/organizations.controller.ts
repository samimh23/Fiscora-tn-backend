import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import {
  AuditQueryDto,
  CreateRoleDto,
  InvitationDto,
  UpdateMemberDto,
  UpdateRolePermissionsDto,
} from './dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organisations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  getMine(@CurrentUser() user: JwtUser) {
    return this.service.getForUser(user.userId);
  }

  @Get(':organizationId')
  @RequirePermission(PermissionNames.OrganizationView)
  get(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.get(organizationId);
  }

  @Get(':organizationId/members')
  @RequirePermission(PermissionNames.UsersView)
  getMembers(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.getMembers(organizationId);
  }

  @Patch(':organizationId/members/:membershipId')
  @RequirePermission(PermissionNames.UsersManage)
  updateMember(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.service.updateMember(
      organizationId,
      membershipId,
      user.userId,
      dto,
    );
  }

  @Get(':organizationId/roles')
  @RequirePermission(PermissionNames.RolesView)
  getRoles(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.getRoles(organizationId);
  }

  @Get(':organizationId/permissions')
  @RequirePermission(PermissionNames.RolesView)
  getPermissions() {
    return this.service.getPermissions();
  }

  @Get(':organizationId/audit-logs')
  @RequirePermission(PermissionNames.AuditView)
  getAuditLogs(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: AuditQueryDto,
  ) {
    return this.service.getAuditLogs(organizationId, query.take);
  }

  @Post(':organizationId/roles')
  @RequirePermission(PermissionNames.RolesManage)
  createRole(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateRoleDto,
  ) {
    return this.service.createRole(organizationId, user.userId, dto);
  }

  @Put(':organizationId/roles/:roleId/permissions')
  @RequirePermission(PermissionNames.RolesManage)
  updateRolePermissions(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.service.updateRolePermissions(
      organizationId,
      roleId,
      user.userId,
      dto,
    );
  }

  @Post(':organizationId/invitations')
  @RequirePermission(PermissionNames.UsersManage)
  invite(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: InvitationDto,
  ) {
    return this.service.invite(organizationId, user.userId, dto);
  }

  @Get(':organizationId/invitations')
  @RequirePermission(PermissionNames.UsersView)
  getInvitations(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.service.getInvitations(organizationId);
  }

  @Post(':organizationId/invitations/:invitationId/resend')
  @RequirePermission(PermissionNames.UsersManage)
  resendInvitation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.resendInvitation(
      organizationId,
      invitationId,
      user.userId,
    );
  }

  @Delete(':organizationId/invitations/:invitationId')
  @RequirePermission(PermissionNames.UsersManage)
  revokeInvitation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.revokeInvitation(
      organizationId,
      invitationId,
      user.userId,
    );
  }
}
