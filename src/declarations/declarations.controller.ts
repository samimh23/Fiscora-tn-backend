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
  DeclarationCommentDto,
  DeclarationPeriodDto,
  FileMonthlyDeclarationDto,
  RejectMonthlyDeclarationDto,
  UpsertMonthlyDeclarationDto,
} from './dto';
import { DeclarationsService } from './declarations.service';

@ApiTags('Déclarations mensuelles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/monthly-declarations',
)
export class DeclarationsController {
  constructor(private readonly service: DeclarationsService) {}

  @Get()
  @RequirePermission(PermissionNames.DeclarationsView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query('year') year?: string,
  ) {
    return this.service.list(
      organizationId,
      dossierId,
      user.userId,
      year ? Number(year) : undefined,
    );
  }

  @Put()
  @RequirePermission(PermissionNames.DeclarationsManage)
  upsert(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpsertMonthlyDeclarationDto,
  ) {
    return this.service.upsert(organizationId, dossierId, user.userId, dto);
  }

  @Post('calculate')
  @RequirePermission(PermissionNames.DeclarationsView)
  calculate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: DeclarationPeriodDto,
  ) {
    return this.service.previewCalculation(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Post('prepare')
  @RequirePermission(PermissionNames.DeclarationsManage)
  prepare(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: DeclarationPeriodDto,
  ) {
    return this.service.prepareAutomatic(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Post(':declarationId/review')
  @RequirePermission(PermissionNames.DeclarationsManage)
  review(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('declarationId', ParseUUIDPipe) declarationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: DeclarationCommentDto,
  ) {
    return this.service.review(
      organizationId,
      dossierId,
      declarationId,
      user.userId,
      dto.comment,
    );
  }

  @Post(':declarationId/reject')
  @RequirePermission(PermissionNames.DeclarationsValidate)
  reject(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('declarationId', ParseUUIDPipe) declarationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RejectMonthlyDeclarationDto,
  ) {
    return this.service.reject(
      organizationId,
      dossierId,
      declarationId,
      user.userId,
      dto.comment,
    );
  }

  @Post(':declarationId/validate')
  @RequirePermission(PermissionNames.DeclarationsValidate)
  validate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('declarationId', ParseUUIDPipe) declarationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.validate(
      organizationId,
      dossierId,
      declarationId,
      user.userId,
    );
  }

  @Post(':declarationId/file')
  @RequirePermission(PermissionNames.DeclarationsValidate)
  file(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('declarationId', ParseUUIDPipe) declarationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: FileMonthlyDeclarationDto,
  ) {
    return this.service.file(
      organizationId,
      dossierId,
      declarationId,
      user.userId,
      dto,
    );
  }
}
