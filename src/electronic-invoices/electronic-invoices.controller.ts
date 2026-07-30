import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { PrepareTtnInvoiceDto, SaveTtnConfigurationDto } from './dto';
import { ElectronicInvoicesService } from './electronic-invoices.service';

@ApiTags('Facturation Ã©lectronique TTN')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/electronic-invoices',
)
export class ElectronicInvoicesController {
  constructor(private readonly service: ElectronicInvoicesService) {}

  @Get('configuration')
  @RequirePermission(PermissionNames.ElectronicInvoicesView)
  configuration(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getConfiguration(
      organizationId,
      dossierId,
      user.userId,
    );
  }

  @Put('configuration')
  @RequirePermission(PermissionNames.ElectronicInvoicesConfigure)
  saveConfiguration(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveTtnConfigurationDto,
  ) {
    return this.service.saveConfiguration(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Get()
  @RequirePermission(PermissionNames.ElectronicInvoicesView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.list(organizationId, dossierId, user.userId);
  }

  @Get('eligible-invoices')
  @RequirePermission(PermissionNames.ElectronicInvoicesView)
  eligibleInvoices(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.eligibleInvoices(
      organizationId,
      dossierId,
      user.userId,
    );
  }

  @Post('prepare')
  @RequirePermission(PermissionNames.ElectronicInvoicesManage)
  prepare(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareTtnInvoiceDto,
  ) {
    return this.service.prepare(organizationId, dossierId, user.userId, dto);
  }

  @Post(':submissionId/submit')
  @RequirePermission(PermissionNames.ElectronicInvoicesSubmit)
  submit(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.submit(
      organizationId,
      dossierId,
      submissionId,
      user.userId,
    );
  }

  @Get(':submissionId/payload')
  @RequirePermission(PermissionNames.ElectronicInvoicesView)
  async payload(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() user: JwtUser,
    @Res() response: Response,
  ) {
    const item = await this.service.payload(
      organizationId,
      dossierId,
      submissionId,
      user.userId,
    );
    response
      .type('application/xml')
      .attachment(`${item.invoice.number.replace(/[^a-z0-9_-]/gi, '_')}.xml`)
      .send(item.payloadXml);
  }
}
