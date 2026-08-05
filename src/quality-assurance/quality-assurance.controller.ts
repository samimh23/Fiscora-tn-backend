import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { QualityAssuranceService } from './quality-assurance.service';

@ApiTags('Assurance qualité')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/quality-assurance')
export class QualityAssuranceController {
  constructor(private readonly service: QualityAssuranceService) {}

  @Get()
  @RequirePermission(PermissionNames.QualityAssuranceView)
  getSummary(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Query('dossierId') dossierId?: string,
  ) {
    return this.service.getSummary(organizationId, user.userId, dossierId);
  }

  @Get('dossiers/:dossierId')
  @RequirePermission(PermissionNames.QualityAssuranceView)
  getDossierReport(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getDossierReport(organizationId, dossierId, user.userId);
  }
}
