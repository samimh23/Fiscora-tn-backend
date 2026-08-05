import {
  Body,
  Controller,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { MigrationImportKind, MigrationImportOptionsDto } from './dto';
import { MigrationAssistantService } from './migration-assistant.service';

@ApiTags('Assistant de migration')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/dossiers/:dossierId/migration-assistant')
export class MigrationAssistantController {
  constructor(private readonly service: MigrationAssistantService) {}

  @Post('preview/:kind')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_000_000 } }))
  @RequirePermission(PermissionNames.AccountingView)
  preview(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('kind', new ParseEnumPipe(MigrationImportKind))
    kind: MigrationImportKind,
    @CurrentUser() user: JwtUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.preview(organizationId, dossierId, user.userId, kind, file);
  }

  @Post('import/:kind')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_000_000 } }))
  @RequirePermission(PermissionNames.AccountingManage)
  import(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('kind', new ParseEnumPipe(MigrationImportKind))
    kind: MigrationImportKind,
    @CurrentUser() user: JwtUser,
    @Body() options: MigrationImportOptionsDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.import(
      organizationId,
      dossierId,
      user.userId,
      kind,
      options,
      file,
    );
  }
}
