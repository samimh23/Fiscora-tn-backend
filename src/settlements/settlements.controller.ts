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
import { CreateThirdPartyDto, CreateThirdPartyPaymentDto } from './dto';
import { SettlementsService } from './settlements.service';

@ApiTags('Clients, fournisseurs et règlements')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/dossiers/:dossierId')
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get('third-parties')
  @RequirePermission(PermissionNames.ThirdPartiesView)
  thirdParties(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listThirdParties(
      organizationId,
      dossierId,
      user.userId,
    );
  }

  @Post('third-parties')
  @RequirePermission(PermissionNames.ThirdPartiesManage)
  createThirdParty(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateThirdPartyDto,
  ) {
    return this.service.createThirdParty(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Put('third-parties/:thirdPartyId')
  @RequirePermission(PermissionNames.ThirdPartiesManage)
  updateThirdParty(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('thirdPartyId', ParseUUIDPipe) thirdPartyId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateThirdPartyDto,
  ) {
    return this.service.updateThirdParty(
      organizationId,
      dossierId,
      thirdPartyId,
      user.userId,
      dto,
    );
  }

  @Get('payments')
  @RequirePermission(PermissionNames.PaymentsView)
  payments(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listPayments(organizationId, dossierId, user.userId);
  }

  @Post('payments')
  @RequirePermission(PermissionNames.PaymentsManage)
  createPayment(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateThirdPartyPaymentDto,
  ) {
    return this.service.createPayment(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Post('payments/:paymentId/post')
  @RequirePermission(PermissionNames.AccountingPost)
  postPayment(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.postPayment(
      organizationId,
      dossierId,
      paymentId,
      user.userId,
    );
  }
}
