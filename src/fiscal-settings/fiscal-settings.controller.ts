import {
  Body,
  Controller,
  Get,
  Param,
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
  CreateFiscalParameterDto,
  CreateIncomeTaxScaleDto,
  CreateVatRateDto,
  CreateWithholdingRateDto,
} from './dto';
import { FiscalSettingsService } from './fiscal-settings.service';

@ApiTags('Paramètres fiscaux et sociaux')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/fiscal-settings')
export class FiscalSettingsController {
  constructor(private readonly service: FiscalSettingsService) {}

  @Get('regulatory-updates')
  @RequirePermission(PermissionNames.FiscalSettingsView)
  regulatoryUpdates(@Query('date') date?: string) {
    return this.service.listRegulatoryUpdates(date);
  }

  @Get('applicable')
  @RequirePermission(PermissionNames.FiscalSettingsView)
  snapshot(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('date') date?: string,
  ) {
    return this.service.snapshot(
      organizationId,
      date ?? new Date().toISOString().slice(0, 10),
    );
  }

  @Get('parameters')
  @RequirePermission(PermissionNames.FiscalSettingsView)
  parameters(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.listParameters(organizationId);
  }

  @Post('parameters')
  @RequirePermission(PermissionNames.FiscalSettingsManage)
  createParameter(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateFiscalParameterDto,
  ) {
    return this.service.createParameter(organizationId, user.userId, dto);
  }

  @Get('vat-rates')
  @RequirePermission(PermissionNames.FiscalSettingsView)
  vatRates(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.listVatRates(organizationId);
  }

  @Post('vat-rates')
  @RequirePermission(PermissionNames.FiscalSettingsManage)
  createVatRate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateVatRateDto,
  ) {
    return this.service.createVatRate(organizationId, dto);
  }

  @Get('withholding-rates')
  @RequirePermission(PermissionNames.FiscalSettingsView)
  withholdingRates(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.service.listWithholdingRates(organizationId);
  }

  @Post('withholding-rates')
  @RequirePermission(PermissionNames.FiscalSettingsManage)
  createWithholdingRate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateWithholdingRateDto,
  ) {
    return this.service.createWithholdingRate(organizationId, dto);
  }

  @Get('income-tax-brackets')
  @RequirePermission(PermissionNames.FiscalSettingsView)
  incomeTaxBrackets(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.service.listIncomeTaxBrackets(organizationId);
  }

  @Post('income-tax-scales')
  @RequirePermission(PermissionNames.FiscalSettingsManage)
  createIncomeTaxScale(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateIncomeTaxScaleDto,
  ) {
    return this.service.createIncomeTaxScale(organizationId, dto);
  }
}
