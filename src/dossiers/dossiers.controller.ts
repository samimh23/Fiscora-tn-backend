import {
  Body,
  Controller,
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
  CreateDossierContactDto,
  CreateDossierDto,
  DossierQueryDto,
  UpdateDossierContactDto,
  UpdateDossierDto,
  UpsertDossierAssignmentDto,
} from './dto';
import { DossiersService } from './dossiers.service';

@ApiTags('Dossiers clients')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/dossiers')
export class DossiersController {
  constructor(private readonly service: DossiersService) {}

  @Get()
  @RequirePermission(PermissionNames.DossiersView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: DossierQueryDto,
  ) {
    return this.service.list(organizationId, user.userId, query);
  }

  @Post()
  @RequirePermission(PermissionNames.DossiersCreate)
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateDossierDto,
  ) {
    return this.service.create(organizationId, user.userId, dto);
  }

  @Get(':dossierId')
  @RequirePermission(PermissionNames.DossiersView)
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.get(organizationId, dossierId, user.userId);
  }

  @Patch(':dossierId')
  @RequirePermission(PermissionNames.DossiersManage)
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateDossierDto,
  ) {
    return this.service.update(organizationId, dossierId, user.userId, dto);
  }

  @Post(':dossierId/archive')
  @RequirePermission(PermissionNames.DossiersCreate)
  archive(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.archive(organizationId, dossierId, user.userId);
  }

  @Get(':dossierId/contacts')
  @RequirePermission(PermissionNames.DossiersView)
  getContacts(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getContacts(organizationId, dossierId, user.userId);
  }

  @Post(':dossierId/contacts')
  @RequirePermission(PermissionNames.DossierContactsManage)
  createContact(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateDossierContactDto,
  ) {
    return this.service.createContact(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Patch(':dossierId/contacts/:contactId')
  @RequirePermission(PermissionNames.DossierContactsManage)
  updateContact(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateDossierContactDto,
  ) {
    return this.service.updateContact(
      organizationId,
      dossierId,
      contactId,
      user.userId,
      dto,
    );
  }

  @Get(':dossierId/assignments')
  @RequirePermission(PermissionNames.DossiersAssign)
  getAssignments(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
  ) {
    return this.service.getAssignments(organizationId, dossierId);
  }

  @Put(':dossierId/assignments/:membershipId')
  @RequirePermission(PermissionNames.DossiersAssign)
  upsertAssignment(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpsertDossierAssignmentDto,
  ) {
    return this.service.upsertAssignment(
      organizationId,
      dossierId,
      membershipId,
      user.userId,
      dto,
    );
  }
}
