import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  CreateObligationTemplateDto,
  FileObligationDto,
  GenerateObligationsDto,
  ObligationQueryDto,
  PayObligationDto,
  RejectObligationDto,
  UpdateObligationProgressDto,
} from './dto';
import { ObligationsService } from './obligations.service';

@ApiTags('Obligations fiscales')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId')
export class ObligationsController {
  constructor(private readonly service: ObligationsService) {}

  @Get('obligation-templates')
  @RequirePermission(PermissionNames.ObligationsView)
  getTemplates(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.getTemplates(organizationId);
  }

  @Post('obligation-templates')
  @RequirePermission(PermissionNames.ObligationTemplatesManage)
  createTemplate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateObligationTemplateDto,
  ) {
    return this.service.createTemplate(organizationId, user.userId, dto);
  }

  @Get('dossiers/:dossierId/obligations')
  @RequirePermission(PermissionNames.ObligationsView)
  getInstances(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ObligationQueryDto,
  ) {
    return this.service.getInstances(
      organizationId,
      dossierId,
      user.userId,
      query,
    );
  }

  @Post('dossiers/:dossierId/obligations/generate')
  @RequirePermission(PermissionNames.ObligationsManage)
  generate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: GenerateObligationsDto,
  ) {
    return this.service.generate(
      organizationId,
      dossierId,
      user.userId,
      dto.year,
    );
  }

  @Patch('dossiers/:dossierId/obligations/:obligationId/progress')
  @RequirePermission(PermissionNames.ObligationsManage)
  updateProgress(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateObligationProgressDto,
  ) {
    return this.service.updateProgress(
      organizationId,
      dossierId,
      obligationId,
      user.userId,
      dto,
    );
  }

  @Post('dossiers/:dossierId/obligations/:obligationId/validate')
  @RequirePermission(PermissionNames.ObligationsValidate)
  validate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.validate(
      organizationId,
      dossierId,
      obligationId,
      user.userId,
    );
  }

  @Post('dossiers/:dossierId/obligations/:obligationId/reject')
  @RequirePermission(PermissionNames.ObligationsValidate)
  reject(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RejectObligationDto,
  ) {
    return this.service.reject(
      organizationId,
      dossierId,
      obligationId,
      user.userId,
      dto.comment,
    );
  }

  @Post('dossiers/:dossierId/obligations/:obligationId/file')
  @RequirePermission(PermissionNames.ObligationsFile)
  file(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: FileObligationDto,
  ) {
    return this.service.file(
      organizationId,
      dossierId,
      obligationId,
      user.userId,
      dto,
    );
  }

  @Post('dossiers/:dossierId/obligations/:obligationId/pay')
  @RequirePermission(PermissionNames.ObligationsFile)
  pay(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: PayObligationDto,
  ) {
    return this.service.pay(
      organizationId,
      dossierId,
      obligationId,
      user.userId,
      dto,
    );
  }
}
