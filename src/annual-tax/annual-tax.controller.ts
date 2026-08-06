import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { AnnualTaxService } from './annual-tax.service';
import {
  AnnualTaxAnnexExportQueryDto,
  AnnualTaxCalculationDto,
  AnnualTaxExportQueryDto,
} from './dto';

@ApiTags('Fiscal annuel')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/dossiers/:dossierId/annual-tax')
export class AnnualTaxController {
  constructor(private readonly service: AnnualTaxService) {}

  @Post(':year/calculate')
  @RequirePermission(PermissionNames.DeclarationsManage)
  calculate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: AnnualTaxCalculationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.calculate(organizationId, dossierId, user.userId, year, dto);
  }

  @Get('deficits')
  @RequirePermission(PermissionNames.DeclarationsView)
  deficits(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listDeficits(organizationId, dossierId, user.userId);
  }

  @Get(':year')
  @RequirePermission(PermissionNames.DeclarationsView)
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.calculate(organizationId, dossierId, user.userId, year, {});
  }

  @Get(':year/export')
  @RequirePermission(PermissionNames.DeclarationsView)
  async export(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Query() query: AnnualTaxExportQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    const report = await this.service.calculate(
      organizationId,
      dossierId,
      user.userId,
      year,
      query,
    );
    const isPdf = query.format !== 'csv';
    const buffer = isPdf ? await this.service.toPdf(report) : await this.service.toCsv(report);
    return new StreamableFile(buffer, {
      type: isPdf ? 'application/pdf' : 'text/csv; charset=utf-8',
      disposition: `attachment; filename="fiscal-annuel-${year}.${isPdf ? 'pdf' : 'csv'}"`,
      length: buffer.length,
    });
  }

  @Post(':year/finalize')
  @RequirePermission(PermissionNames.DeclarationsManage)
  finalize(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: AnnualTaxCalculationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.finalize(organizationId, dossierId, user.userId, year, dto);
  }

  @Get(':year/annexes/amortissements')
  @RequirePermission(PermissionNames.DeclarationsView)
  depreciationAnnex(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.depreciationAnnex(organizationId, dossierId, user.userId, year);
  }

  @Get(':year/annexes/amortissements/export')
  @RequirePermission(PermissionNames.DeclarationsView)
  async depreciationAnnexExport(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Query() query: AnnualTaxAnnexExportQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    const annex = await this.service.depreciationAnnex(organizationId, dossierId, user.userId, year);
    const isPdf = query.format !== 'csv';
    const buffer = isPdf
      ? await this.service.depreciationAnnexPdf(annex)
      : await this.service.depreciationAnnexCsv(annex);
    return new StreamableFile(buffer, {
      type: isPdf ? 'application/pdf' : 'text/csv; charset=utf-8',
      disposition: `attachment; filename="amortissements-${year}.${isPdf ? 'pdf' : 'csv'}"`,
      length: buffer.length,
    });
  }

  @Get(':year/annexes/retenues-source')
  @RequirePermission(PermissionNames.DeclarationsView)
  withholdingAnnex(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.withholdingAnnex(organizationId, dossierId, user.userId, year);
  }

  @Get(':year/annexes/retenues-source/export')
  @RequirePermission(PermissionNames.DeclarationsView)
  async withholdingAnnexExport(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Query() query: AnnualTaxAnnexExportQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    const annex = await this.service.withholdingAnnex(organizationId, dossierId, user.userId, year);
    const isPdf = query.format !== 'csv';
    const buffer = isPdf
      ? await this.service.withholdingAnnexPdf(annex)
      : await this.service.withholdingAnnexCsv(annex);
    return new StreamableFile(buffer, {
      type: isPdf ? 'application/pdf' : 'text/csv; charset=utf-8',
      disposition: `attachment; filename="retenues-source-${year}.${isPdf ? 'pdf' : 'csv'}"`,
      length: buffer.length,
    });
  }
}
