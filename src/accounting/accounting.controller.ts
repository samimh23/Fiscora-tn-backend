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
import { AccountingService } from './accounting.service';
import {
  CompanyProfileDto,
  CreateFiscalYearDto,
  CreateLedgerAccountDto,
  LedgerAccountsQueryDto,
  UpdateLedgerAccountDto,
} from './dto';

@ApiTags('Comptabilité')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId')
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get('company-profile')
  @RequirePermission(PermissionNames.CompanyProfileView)
  getCompanyProfile(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.service.getCompanyProfile(organizationId);
  }

  @Put('company-profile')
  @RequirePermission(PermissionNames.CompanyProfileManage)
  upsertCompanyProfile(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CompanyProfileDto,
  ) {
    return this.service.upsertCompanyProfile(organizationId, user.userId, dto);
  }

  @Get('dossiers/:dossierId/fiscal-years')
  @RequirePermission(PermissionNames.FiscalYearsView)
  getFiscalYears(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getFiscalYears(organizationId, dossierId, user.userId);
  }

  @Post('dossiers/:dossierId/fiscal-years')
  @RequirePermission(PermissionNames.FiscalYearsManage)
  createFiscalYear(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateFiscalYearDto,
  ) {
    return this.service.createFiscalYear(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Post('dossiers/:dossierId/fiscal-years/:fiscalYearId/close')
  @RequirePermission(PermissionNames.FiscalYearsClose)
  closeFiscalYear(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('fiscalYearId', ParseUUIDPipe) fiscalYearId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.closeFiscalYear(
      organizationId,
      dossierId,
      fiscalYearId,
      user.userId,
    );
  }

  @Get('dossiers/:dossierId/ledger-accounts')
  @RequirePermission(PermissionNames.ChartOfAccountsView)
  getLedgerAccounts(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: LedgerAccountsQueryDto,
  ) {
    return this.service.getLedgerAccounts(
      organizationId,
      dossierId,
      user.userId,
      query.includeInactive,
    );
  }

  @Post('dossiers/:dossierId/ledger-accounts')
  @RequirePermission(PermissionNames.ChartOfAccountsManage)
  createLedgerAccount(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateLedgerAccountDto,
  ) {
    return this.service.createLedgerAccount(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Post('dossiers/:dossierId/ledger-accounts/apply-tunisian-chart')
  @RequirePermission(PermissionNames.ChartOfAccountsManage)
  applyStarterChart(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.applyTunisianChart(
      organizationId,
      dossierId,
      user.userId,
    );
  }

  @Put('dossiers/:dossierId/ledger-accounts/:accountId')
  @RequirePermission(PermissionNames.ChartOfAccountsManage)
  updateLedgerAccount(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateLedgerAccountDto,
  ) {
    return this.service.updateLedgerAccount(
      organizationId,
      dossierId,
      accountId,
      user.userId,
      dto,
    );
  }
}
