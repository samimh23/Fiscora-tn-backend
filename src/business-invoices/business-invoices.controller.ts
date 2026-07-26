import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { BusinessInvoicesService } from './business-invoices.service';
import { SaveBusinessInvoiceDto } from './dto';

@ApiTags('Factures d’achat et de vente')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/business-invoices',
)
export class BusinessInvoicesController {
  constructor(private readonly service: BusinessInvoicesService) {}

  @Get()
  @RequirePermission(PermissionNames.BusinessInvoicesView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.list(organizationId, dossierId, user.userId);
  }

  @Get(':invoiceId')
  @RequirePermission(PermissionNames.BusinessInvoicesView)
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.get(organizationId, dossierId, invoiceId, user.userId);
  }

  @Post()
  @RequirePermission(PermissionNames.BusinessInvoicesManage)
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveBusinessInvoiceDto,
  ) {
    return this.service.save(organizationId, dossierId, null, user.userId, dto);
  }

  @Put(':invoiceId')
  @RequirePermission(PermissionNames.BusinessInvoicesManage)
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveBusinessInvoiceDto,
  ) {
    return this.service.save(
      organizationId,
      dossierId,
      invoiceId,
      user.userId,
      dto,
    );
  }

  @Post(':invoiceId/validate')
  @RequirePermission(PermissionNames.BusinessInvoicesValidate)
  validate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.validate(
      organizationId,
      dossierId,
      invoiceId,
      user.userId,
    );
  }

  @Post(':invoiceId/post')
  @RequirePermission(PermissionNames.AccountingPost)
  post(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.post(organizationId, dossierId, invoiceId, user.userId);
  }
}
