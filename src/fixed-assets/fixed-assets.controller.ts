import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
import {
  CreateFixedAssetCategoryDto,
  CreateFixedAssetDto,
  DisposeFixedAssetDto,
  FixedAssetReportQueryDto,
  PostDepreciationDto,
} from './dto';
import { FixedAssetsService } from './fixed-assets.service';

@ApiTags('Immobilisations et amortissements')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/fixed-assets',
)
export class FixedAssetsController {
  constructor(private readonly service: FixedAssetsService) {}

  @Get('categories')
  @RequirePermission(PermissionNames.FixedAssetsView)
  listCategories(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listCategories(organizationId, dossierId, user.userId);
  }

  @Post('categories')
  @RequirePermission(PermissionNames.FixedAssetsManage)
  createCategory(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateFixedAssetCategoryDto,
  ) {
    return this.service.createCategory(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Get()
  @RequirePermission(PermissionNames.FixedAssetsView)
  listAssets(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listAssets(organizationId, dossierId, user.userId);
  }

  @Get('years')
  @RequirePermission(PermissionNames.FixedAssetsView)
  listYears(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listYears(organizationId, dossierId, user.userId);
  }

  @Get('reports/depreciation')
  @RequirePermission(PermissionNames.FixedAssetsView)
  report(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: FixedAssetReportQueryDto,
  ) {
    return this.service.depreciationReport(
      organizationId,
      dossierId,
      query.year,
      user.userId,
    );
  }

  @Get(':assetId')
  @RequirePermission(PermissionNames.FixedAssetsView)
  getAsset(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getAsset(
      organizationId,
      dossierId,
      assetId,
      user.userId,
    );
  }

  @Post()
  @RequirePermission(PermissionNames.FixedAssetsManage)
  createAsset(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateFixedAssetDto,
  ) {
    return this.service.createAsset(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Post(':assetId/generate-schedule')
  @RequirePermission(PermissionNames.FixedAssetsManage)
  generateSchedule(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.generateSchedule(
      organizationId,
      dossierId,
      assetId,
      user.userId,
    );
  }

  @Post('depreciation-periods/:periodId/post')
  @RequirePermission(PermissionNames.FixedAssetsValidate)
  postDepreciation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: PostDepreciationDto,
  ) {
    return this.service.postDepreciation(
      organizationId,
      dossierId,
      periodId,
      dto.journalId,
      user.userId,
    );
  }

  @Post(':assetId/dispose')
  @RequirePermission(PermissionNames.FixedAssetsValidate)
  dispose(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: DisposeFixedAssetDto,
  ) {
    return this.service.disposeAsset(
      organizationId,
      dossierId,
      assetId,
      user.userId,
      dto,
    );
  }

  @Post('years/:year/validate')
  @RequirePermission(PermissionNames.FixedAssetsValidate)
  validateYear(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.validateYear(
      organizationId,
      dossierId,
      year,
      user.userId,
    );
  }
}
