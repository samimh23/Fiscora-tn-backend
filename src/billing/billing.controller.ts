import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { BillingService } from './billing.service';
import { CreateInvoiceDto, RecordPaymentDto } from './dto';

@ApiTags('Honoraires')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('billing/summary')
  @RequirePermission(PermissionNames.BillingView)
  summary(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.summary(organizationId, user.userId);
  }

  @Get('dossiers/:dossierId/invoices')
  @RequirePermission(PermissionNames.BillingView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.list(organizationId, dossierId, user.userId);
  }

  @Post('dossiers/:dossierId/invoices')
  @RequirePermission(PermissionNames.BillingManage)
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.service.create(organizationId, dossierId, user.userId, dto);
  }

  @Post('dossiers/:dossierId/invoices/:invoiceId/send')
  @RequirePermission(PermissionNames.BillingManage)
  send(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.send(organizationId, dossierId, invoiceId, user.userId);
  }

  @Post('dossiers/:dossierId/invoices/:invoiceId/payments')
  @RequirePermission(PermissionNames.BillingManage)
  payment(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.service.recordPayment(
      organizationId,
      dossierId,
      invoiceId,
      user.userId,
      dto,
    );
  }
}
