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
import { PermissionGuard } from '../common/permission.guard';
import { PlatformAdminGuard } from '../common/platform-admin.guard';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionNames } from '../database/permissions';
import {
  CreateSaasInvoiceDto,
  CreateSaasPlanDto,
  RecordSaasPaymentDto,
  UpdateOrganizationSubscriptionDto,
  UpdateSaasPlanDto,
} from './dto';
import { SaasSubscriptionsService } from './saas-subscriptions.service';

@ApiTags('Abonnements Fiscora - administration')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PlatformAdminGuard)
@Controller('api/platform-admin')
export class PlatformSaasSubscriptionsController {
  constructor(private readonly service: SaasSubscriptionsService) {}

  @Get('subscription-plans')
  plans() {
    return this.service.plans();
  }

  @Post('subscription-plans')
  createPlan(@CurrentUser() user: JwtUser, @Body() dto: CreateSaasPlanDto) {
    return this.service.createPlan(user, dto);
  }

  @Patch('subscription-plans/:planId')
  updatePlan(
    @CurrentUser() user: JwtUser,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdateSaasPlanDto,
  ) {
    return this.service.updatePlan(user, planId, dto);
  }

  @Get('subscriptions')
  subscriptions() {
    return this.service.subscriptions();
  }

  @Patch('subscriptions/:organizationId')
  updateSubscription(
    @CurrentUser() user: JwtUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateOrganizationSubscriptionDto,
  ) {
    return this.service.updateSubscription(user, organizationId, dto);
  }

  @Get('subscription-invoices')
  invoices() {
    return this.service.invoices();
  }

  @Post('subscriptions/:organizationId/invoices')
  createInvoice(
    @CurrentUser() user: JwtUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateSaasInvoiceDto,
  ) {
    return this.service.createInvoice(user, organizationId, dto);
  }

  @Post('subscription-invoices/:invoiceId/payments')
  recordPayment(
    @CurrentUser() user: JwtUser,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: RecordSaasPaymentDto,
  ) {
    return this.service.recordPayment(user, invoiceId, dto);
  }

  @Get('saas-analytics')
  analytics() {
    return this.service.analytics();
  }
}

@ApiTags('Mon abonnement Fiscora')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/subscription')
export class OrganizationSubscriptionController {
  constructor(private readonly service: SaasSubscriptionsService) {}

  @Get()
  @RequirePermission(PermissionNames.OrganizationManage)
  subscription(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.organizationSubscription(organizationId);
  }

  @Get('usage')
  @RequirePermission(PermissionNames.OrganizationManage)
  usage(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.organizationUsage(organizationId);
  }

  @Get('invoices')
  @RequirePermission(PermissionNames.OrganizationManage)
  invoices(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.invoices(organizationId);
  }

  @Get('plans')
  @RequirePermission(PermissionNames.OrganizationManage)
  plans() {
    return this.service.plans(true);
  }
}
