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
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionNames } from '../database/permissions';
import { CreateTrainingExportDto, TrainingConsentDto } from './dto';
import { TrainingDatasetsService } from './training-datasets.service';

@ApiTags('Jeux de données IA')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PlatformAdminGuard)
@Controller('api/platform-admin/training-datasets')
export class TrainingDatasetsController {
  constructor(private readonly service: TrainingDatasetsService) {}

  @Get()
  overview() {
    return this.service.overview();
  }

  @Post('exports')
  createExport(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTrainingExportDto,
  ) {
    return this.service.createExport(user.userId, dto);
  }

  @Post('exports/:id/download')
  download(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.download(user.userId, id);
  }
}

@ApiTags('Autorisation des jeux de données IA')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/training-consent',
)
export class TrainingConsentController {
  constructor(private readonly service: TrainingDatasetsService) {}

  @Get()
  @RequirePermission(PermissionNames.DocumentsView)
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.consent(organizationId, dossierId, user.userId);
  }

  @Patch()
  @RequirePermission(PermissionNames.OrganizationManage)
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: TrainingConsentDto,
  ) {
    return this.service.updateConsent(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }
}
