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
import { CommercialDocumentsService } from './commercial-documents.service';
import { ConvertCommercialDocumentDto, SaveCommercialDocumentDto } from './dto';

@ApiTags('Cycle commercial')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/commercial-documents',
)
export class CommercialDocumentsController {
  constructor(private readonly service: CommercialDocumentsService) {}

  @Get()
  @RequirePermission(PermissionNames.BusinessInvoicesView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.list(organizationId, dossierId, user.userId);
  }

  @Get(':documentId')
  @RequirePermission(PermissionNames.BusinessInvoicesView)
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.get(organizationId, dossierId, documentId, user.userId);
  }

  @Post()
  @RequirePermission(PermissionNames.BusinessInvoicesManage)
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveCommercialDocumentDto,
  ) {
    return this.service.save(organizationId, dossierId, null, user.userId, dto);
  }

  @Put(':documentId')
  @RequirePermission(PermissionNames.BusinessInvoicesManage)
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveCommercialDocumentDto,
  ) {
    return this.service.save(
      organizationId,
      dossierId,
      documentId,
      user.userId,
      dto,
    );
  }

  @Post(':documentId/confirm')
  @RequirePermission(PermissionNames.BusinessInvoicesManage)
  confirm(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.confirm(
      organizationId,
      dossierId,
      documentId,
      user.userId,
    );
  }

  @Post(':documentId/convert')
  @RequirePermission(PermissionNames.BusinessInvoicesManage)
  convert(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: ConvertCommercialDocumentDto,
  ) {
    return this.service.convert(
      organizationId,
      dossierId,
      documentId,
      user.userId,
      dto,
    );
  }

  @Post(':documentId/cancel')
  @RequirePermission(PermissionNames.BusinessInvoicesManage)
  cancel(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.cancel(
      organizationId,
      dossierId,
      documentId,
      user.userId,
    );
  }
}
