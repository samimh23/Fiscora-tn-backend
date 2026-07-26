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
  CloseAccountingYearDto,
  CreateClosingAdjustmentDto,
  LockPeriodDto,
  PeriodYearQueryDto,
  ReopenPeriodDto,
} from './dto';
import { PeriodClosingService } from './period-closing.service';

@ApiTags('Clôture comptable')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/period-closing',
)
export class PeriodClosingController {
  constructor(private readonly service: PeriodClosingService) {}

  @Get('periods')
  @RequirePermission(PermissionNames.PeriodClosingView)
  listPeriods(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Query() query: PeriodYearQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listPeriods(
      organizationId,
      dossierId,
      query.year,
      user.userId,
    );
  }

  @Post('periods/:year/:month/lock')
  @RequirePermission(PermissionNames.PeriodClosingValidate)
  lockPeriod(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Body() dto: LockPeriodDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.lockPeriod(
      organizationId,
      dossierId,
      year,
      month,
      user.userId,
      dto.note,
    );
  }

  @Post('periods/:year/:month/reopen')
  @RequirePermission(PermissionNames.PeriodClosingValidate)
  reopenPeriod(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Body() dto: ReopenPeriodDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reopenPeriod(
      organizationId,
      dossierId,
      year,
      month,
      user.userId,
      dto.reason,
    );
  }

  @Get('adjustments')
  @RequirePermission(PermissionNames.PeriodClosingView)
  listAdjustments(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listAdjustments(organizationId, dossierId, user.userId);
  }

  @Post('adjustments')
  @RequirePermission(PermissionNames.PeriodClosingManage)
  createAdjustment(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Body() dto: CreateClosingAdjustmentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createAdjustment(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Get('years')
  @RequirePermission(PermissionNames.PeriodClosingView)
  listClosings(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listClosings(organizationId, dossierId, user.userId);
  }

  @Get('years/:year/readiness')
  @RequirePermission(PermissionNames.PeriodClosingView)
  yearReadiness(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.yearReadiness(
      organizationId,
      dossierId,
      year,
      user.userId,
    );
  }

  @Post('years/:year/close')
  @RequirePermission(PermissionNames.PeriodClosingValidate)
  closeYear(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: CloseAccountingYearDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.closeYear(
      organizationId,
      dossierId,
      year,
      user.userId,
      dto,
    );
  }
}
