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
import {
  CreateVatSuspensionCertificateDto,
  SaveExchangeRateDto,
  SaveForeignTradeOperationDto,
  SettleForeignTradeOperationDto,
} from './dto';
import { ForeignTradeService } from './foreign-trade.service';

@ApiTags('Multi-devise et commerce extÃ©rieur')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/foreign-trade')
export class ForeignTradeController {
  constructor(private readonly service: ForeignTradeService) {}

  @Get('exchange-rates')
  @RequirePermission(PermissionNames.ForeignTradeView)
  listRates(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.listRates(organizationId);
  }

  @Post('exchange-rates')
  @RequirePermission(PermissionNames.ForeignTradeManage)
  saveRate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveExchangeRateDto,
  ) {
    return this.service.saveRate(organizationId, user.userId, dto);
  }

  @Get('dossiers/:dossierId/certificates')
  @RequirePermission(PermissionNames.ForeignTradeView)
  listCertificates(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listCertificates(
      organizationId,
      dossierId,
      user.userId,
    );
  }

  @Post('dossiers/:dossierId/certificates')
  @RequirePermission(PermissionNames.ForeignTradeManage)
  createCertificate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateVatSuspensionCertificateDto,
  ) {
    return this.service.createCertificate(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Get('dossiers/:dossierId/operations')
  @RequirePermission(PermissionNames.ForeignTradeView)
  listOperations(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listOperations(organizationId, dossierId, user.userId);
  }

  @Post('dossiers/:dossierId/operations')
  @RequirePermission(PermissionNames.ForeignTradeManage)
  createOperation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveForeignTradeOperationDto,
  ) {
    return this.service.saveOperation(
      organizationId,
      dossierId,
      null,
      user.userId,
      dto,
    );
  }

  @Put('dossiers/:dossierId/operations/:operationId')
  @RequirePermission(PermissionNames.ForeignTradeManage)
  updateOperation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveForeignTradeOperationDto,
  ) {
    return this.service.saveOperation(
      organizationId,
      dossierId,
      operationId,
      user.userId,
      dto,
    );
  }

  @Post('dossiers/:dossierId/operations/:operationId/post')
  @RequirePermission(PermissionNames.ForeignTradePost)
  postOperation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.postOperation(
      organizationId,
      dossierId,
      operationId,
      user.userId,
    );
  }

  @Post('dossiers/:dossierId/operations/:operationId/settle')
  @RequirePermission(PermissionNames.ForeignTradePost)
  settleOperation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SettleForeignTradeOperationDto,
  ) {
    return this.service.settleOperation(
      organizationId,
      dossierId,
      operationId,
      user.userId,
      dto,
    );
  }
}
