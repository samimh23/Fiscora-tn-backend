import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import {
  CreateExpectationDto,
  DocumentQueryDto,
  RejectExpectationDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './dto';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/dossiers/:dossierId/documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  @RequirePermission(PermissionNames.DocumentsView)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: DocumentQueryDto,
  ) {
    return this.service.list(organizationId, dossierId, user.userId, query);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @RequirePermission(PermissionNames.DocumentsUpload)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.upload(
      organizationId,
      dossierId,
      user.userId,
      dto,
      file,
    );
  }

  @Patch(':documentId')
  @RequirePermission(PermissionNames.DocumentsUpload)
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.service.update(
      organizationId,
      dossierId,
      documentId,
      user.userId,
      dto,
    );
  }

  @Get(':documentId/download')
  @RequirePermission(PermissionNames.DocumentsView)
  download(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.downloadUrl(
      organizationId,
      dossierId,
      documentId,
      user.userId,
    );
  }

  @Get(':documentId/preview')
  @RequirePermission(PermissionNames.DocumentsView)
  preview(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.preview(
      organizationId,
      dossierId,
      documentId,
      user.userId,
    );
  }

  @Delete(':documentId')
  @RequirePermission(PermissionNames.DocumentsUpload)
  remove(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.remove(
      organizationId,
      dossierId,
      documentId,
      user.userId,
    );
  }

  @Get('missing/:year/:month')
  @RequirePermission(PermissionNames.DocumentsView)
  expectations(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listExpectations(
      organizationId,
      dossierId,
      user.userId,
      year,
      month,
    );
  }

  @Post('missing')
  @RequirePermission(PermissionNames.DocumentsUpload)
  createExpectation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateExpectationDto,
  ) {
    return this.service.createExpectation(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Patch('missing/:expectationId/receive/:documentId')
  @RequirePermission(PermissionNames.DocumentsUpload)
  receiveExpectation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('expectationId', ParseUUIDPipe) expectationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.receiveExpectation(
      organizationId,
      dossierId,
      expectationId,
      documentId,
      user.userId,
    );
  }

  @Patch('missing/:expectationId/validate')
  @RequirePermission(PermissionNames.DocumentsUpload)
  validateExpectation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('expectationId', ParseUUIDPipe) expectationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.validateExpectation(
      organizationId,
      dossierId,
      expectationId,
      user.userId,
    );
  }

  @Patch('missing/:expectationId/reject')
  @RequirePermission(PermissionNames.DocumentsUpload)
  rejectExpectation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('expectationId', ParseUUIDPipe) expectationId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RejectExpectationDto,
  ) {
    return this.service.rejectExpectation(
      organizationId,
      dossierId,
      expectationId,
      user.userId,
      dto,
    );
  }

  @Patch('missing/:expectationId/cancel')
  @RequirePermission(PermissionNames.DocumentsUpload)
  cancelExpectation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('expectationId', ParseUUIDPipe) expectationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.cancelExpectation(
      organizationId,
      dossierId,
      expectationId,
      user.userId,
    );
  }
}
