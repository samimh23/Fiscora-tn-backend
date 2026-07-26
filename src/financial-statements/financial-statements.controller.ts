import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
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
  AttachFinancialStatementNoteDocumentDto,
  FinancialStatementExportQueryDto,
  FinancialStatementNoteReviewDto,
  UpdateFinancialStatementNoteSectionDto,
  UpsertFinancialStatementMappingDto,
} from './dto';
import { FinancialStatementExportService } from './financial-statement-export.service';
import { FinancialStatementNotesService } from './financial-statement-notes.service';
import { FinancialStatementsService } from './financial-statements.service';

@ApiTags('États financiers tunisiens')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/financial-statements',
)
export class FinancialStatementsController {
  constructor(
    private readonly service: FinancialStatementsService,
    private readonly notes: FinancialStatementNotesService,
    private readonly exports: FinancialStatementExportService,
  ) {}

  @Get('mappings')
  @RequirePermission(PermissionNames.FinancialStatementsView)
  mappings(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listMappings(organizationId, dossierId, user.userId);
  }

  @Post('notes/:year/generate')
  @RequirePermission(PermissionNames.FinancialStatementsManage)
  generateNotes(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.generate(organizationId, dossierId, year, user.userId);
  }

  @Get('notes/:year')
  @RequirePermission(PermissionNames.FinancialStatementsView)
  notesForYear(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.get(organizationId, dossierId, year, user.userId);
  }

  @Put('notes/:year/sections/:sectionId')
  @RequirePermission(PermissionNames.FinancialStatementsManage)
  updateNoteSection(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: UpdateFinancialStatementNoteSectionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.updateSection(
      organizationId,
      dossierId,
      year,
      sectionId,
      user.userId,
      dto,
    );
  }

  @Post('notes/:year/submit')
  @RequirePermission(PermissionNames.FinancialStatementsManage)
  submitNotes(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.submit(organizationId, dossierId, year, user.userId);
  }

  @Post('notes/:year/reject')
  @RequirePermission(PermissionNames.FinancialStatementsValidate)
  rejectNotes(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: FinancialStatementNoteReviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.reject(organizationId, dossierId, year, user.userId, dto);
  }

  @Post('notes/:year/validate')
  @RequirePermission(PermissionNames.FinancialStatementsValidate)
  validateNotes(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.validate(organizationId, dossierId, year, user.userId);
  }

  @Post('notes/:year/reopen')
  @RequirePermission(PermissionNames.FinancialStatementsValidate)
  reopenNotes(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: FinancialStatementNoteReviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.reopen(organizationId, dossierId, year, user.userId, dto);
  }

  @Post('notes/:year/sections/:sectionId/documents')
  @RequirePermission(PermissionNames.FinancialStatementsManage)
  attachNoteDocument(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: AttachFinancialStatementNoteDocumentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.attachDocument(
      organizationId,
      dossierId,
      year,
      sectionId,
      user.userId,
      dto,
    );
  }

  @Delete('notes/:year/sections/:sectionId/documents/:documentId')
  @RequirePermission(PermissionNames.FinancialStatementsManage)
  detachNoteDocument(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notes.detachDocument(
      organizationId,
      dossierId,
      year,
      sectionId,
      documentId,
      user.userId,
    );
  }

  @Post('mappings/apply-defaults')
  @RequirePermission(PermissionNames.FinancialStatementsManage)
  applyDefaults(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.applyDefaults(organizationId, dossierId, user.userId);
  }

  @Put('mappings/:accountId')
  @RequirePermission(PermissionNames.FinancialStatementsManage)
  updateMapping(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: UpsertFinancialStatementMappingDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.upsertMapping(
      organizationId,
      dossierId,
      accountId,
      user.userId,
      dto,
    );
  }

  @Get('statements/:year')
  @RequirePermission(PermissionNames.FinancialStatementsView)
  statement(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getReport(organizationId, dossierId, year, user.userId);
  }

  @Get('statements/:year/preview')
  @RequirePermission(PermissionNames.FinancialStatementsView)
  preview(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.previewReport(
      organizationId,
      dossierId,
      year,
      user.userId,
    );
  }

  @Post('statements/:year/finalize')
  @RequirePermission(PermissionNames.FinancialStatementsValidate)
  finalize(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.finalize(organizationId, dossierId, year, user.userId);
  }

  @Get('statements/:year/export')
  @RequirePermission(PermissionNames.FinancialStatementsView)
  async export(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('year', ParseIntPipe) year: number,
    @Query() query: FinancialStatementExportQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    const report = await this.service.getReport(
      organizationId,
      dossierId,
      year,
      user.userId,
    );
    const isPdf = query.format === 'pdf';
    const buffer = isPdf
      ? await this.exports.toPdf(report)
      : await this.exports.toXlsx(report);
    return new StreamableFile(buffer, {
      type: isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="etats-financiers-${year}.${query.format}"`,
      length: buffer.length,
    });
  }

  @Get('snapshots')
  @RequirePermission(PermissionNames.FinancialStatementsView)
  snapshots(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listSnapshots(organizationId, dossierId, user.userId);
  }
}
