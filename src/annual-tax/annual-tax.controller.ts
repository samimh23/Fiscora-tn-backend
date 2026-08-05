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
import { AnnualTaxCalculationDto, AnnualTaxExportQueryDto } from './dto';

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
}
