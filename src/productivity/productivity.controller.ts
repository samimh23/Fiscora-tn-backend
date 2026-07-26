import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateMemberCostRateDto,
  CreateTimeEntryDto,
  ProfitabilityQueryDto,
  ReviewTimeEntryDto,
  TimeEntryQueryDto,
  UpdateTimeEntryDto,
} from './dto';
import { ProductivityService } from './productivity.service';

@ApiTags('Temps et rentabilité')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId')
export class ProductivityController {
  constructor(private readonly service: ProductivityService) {}

  @Get('team-cost-rates')
  @RequirePermission(PermissionNames.TeamCostsManage)
  listCostRates(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.service.listCostRates(organizationId);
  }

  @Post('team-cost-rates')
  @RequirePermission(PermissionNames.TeamCostsManage)
  createCostRate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateMemberCostRateDto,
  ) {
    return this.service.createCostRate(organizationId, user.userId, dto);
  }

  @Get('dossiers/:dossierId/time-entries')
  @RequirePermission(PermissionNames.TimeTrackingView)
  listTimeEntries(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: TimeEntryQueryDto,
  ) {
    return this.service.listTimeEntries(
      organizationId,
      dossierId,
      user.userId,
      query,
    );
  }

  @Post('dossiers/:dossierId/time-entries')
  @RequirePermission(PermissionNames.TimeTrackingManage)
  createTimeEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTimeEntryDto,
  ) {
    return this.service.createTimeEntry(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Put('dossiers/:dossierId/time-entries/:entryId')
  @RequirePermission(PermissionNames.TimeTrackingManage)
  updateTimeEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.service.updateTimeEntry(
      organizationId,
      dossierId,
      entryId,
      user.userId,
      dto,
    );
  }

  @Post('dossiers/:dossierId/time-entries/:entryId/submit')
  @RequirePermission(PermissionNames.TimeTrackingManage)
  submitTimeEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.submitTimeEntry(
      organizationId,
      dossierId,
      entryId,
      user.userId,
    );
  }

  @Post('dossiers/:dossierId/time-entries/:entryId/review')
  @RequirePermission(PermissionNames.TimeTrackingApprove)
  reviewTimeEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: ReviewTimeEntryDto,
  ) {
    return this.service.reviewTimeEntry(
      organizationId,
      dossierId,
      entryId,
      user.userId,
      dto,
    );
  }

  @Get('profitability')
  @RequirePermission(PermissionNames.ProfitabilityView)
  profitability(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ProfitabilityQueryDto,
  ) {
    return this.service.profitability(organizationId, user.userId, query);
  }
}
