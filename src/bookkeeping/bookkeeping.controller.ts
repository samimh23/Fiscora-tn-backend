import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { BookkeepingService } from './bookkeeping.service';
import {
  CreateEntryDto,
  CreateJournalDto,
  CreateReconciliationDto,
  ExportReportQueryDto,
  ReconciliationQueryDto,
  RejectEntryDto,
  ReportQueryDto,
} from './dto';

@ApiTags('Tenue comptable et rapports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('api/organizations/:organizationId/dossiers/:dossierId')
export class BookkeepingController {
  constructor(private readonly service: BookkeepingService) {}

  @Get('journals')
  @RequirePermission(PermissionNames.AccountingView)
  journals(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listJournals(organizationId, dossierId, user.userId);
  }

  @Post('journals')
  @RequirePermission(PermissionNames.AccountingManage)
  createJournal(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateJournalDto,
  ) {
    return this.service.createJournal(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Get('entries')
  @RequirePermission(PermissionNames.AccountingView)
  entries(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listEntries(organizationId, dossierId, user.userId);
  }

  @Post('entries')
  @RequirePermission(PermissionNames.AccountingManage)
  createEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateEntryDto,
  ) {
    return this.service.createEntry(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Put('entries/:entryId')
  @RequirePermission(PermissionNames.AccountingManage)
  updateEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateEntryDto,
  ) {
    return this.service.updateEntry(
      organizationId,
      dossierId,
      entryId,
      user.userId,
      dto,
    );
  }

  @Get('entries/:entryId')
  @RequirePermission(PermissionNames.AccountingView)
  entry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getEntry(
      organizationId,
      dossierId,
      entryId,
      user.userId,
    );
  }

  @Post('entries/:entryId/submit')
  @RequirePermission(PermissionNames.AccountingManage)
  submit(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.submit(organizationId, dossierId, entryId, user.userId);
  }

  @Post('entries/:entryId/post')
  @RequirePermission(PermissionNames.AccountingPost)
  post(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.post(organizationId, dossierId, entryId, user.userId);
  }

  @Post('entries/:entryId/approve')
  @RequirePermission(PermissionNames.AccountingPost)
  approve(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.post(organizationId, dossierId, entryId, user.userId);
  }

  @Post('entries/:entryId/reject')
  @RequirePermission(PermissionNames.AccountingPost)
  reject(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RejectEntryDto,
  ) {
    return this.service.reject(
      organizationId,
      dossierId,
      entryId,
      user.userId,
      dto.comment,
    );
  }

  @Post('entries/:entryId/reverse')
  @RequirePermission(PermissionNames.AccountingPost)
  reverse(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reverse(
      organizationId,
      dossierId,
      entryId,
      user.userId,
    );
  }

  @Get('reports/trial-balance')
  @RequirePermission(PermissionNames.ReportsView)
  trialBalance(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ReportQueryDto,
  ) {
    return this.service.trialBalance(
      organizationId,
      dossierId,
      user.userId,
      query,
    );
  }

  @Get('reports/general-ledger')
  @RequirePermission(PermissionNames.ReportsView)
  generalLedger(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ReportQueryDto,
  ) {
    return this.service.generalLedger(
      organizationId,
      dossierId,
      user.userId,
      query,
    );
  }

  @Get('reports/financial-summary')
  @RequirePermission(PermissionNames.ReportsView)
  financialSummary(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ReportQueryDto,
  ) {
    return this.service.financialSummary(
      organizationId,
      dossierId,
      user.userId,
      query,
    );
  }

  @Get('reports/aged-balance')
  @RequirePermission(PermissionNames.ReportsView)
  agedBalance(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ReportQueryDto,
  ) {
    return this.service.agedBalance(
      organizationId,
      dossierId,
      user.userId,
      query,
    );
  }

  @Get('reconciliations')
  @RequirePermission(PermissionNames.AccountingView)
  reconciliations(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ReconciliationQueryDto,
  ) {
    return this.service.listReconciliations(
      organizationId,
      dossierId,
      user.userId,
      query.accountId,
    );
  }

  @Post('reconciliations')
  @RequirePermission(PermissionNames.AccountingPost)
  reconcile(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateReconciliationDto,
  ) {
    return this.service.reconcile(organizationId, dossierId, user.userId, dto);
  }

  @Delete('reconciliations/:reconciliationId')
  @RequirePermission(PermissionNames.AccountingPost)
  unreconcile(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('reconciliationId', ParseUUIDPipe) reconciliationId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.unreconcile(
      organizationId,
      dossierId,
      reconciliationId,
      user.userId,
    );
  }

  @Get('reports/:report/export')
  @RequirePermission(PermissionNames.ReportsView)
  async exportReport(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('report') report: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ExportReportQueryDto,
    @Res() response: Response,
  ) {
    const result = await this.service.exportReport(
      organizationId,
      dossierId,
      user.userId,
      report,
      query,
    );
    response.setHeader('Content-Type', result.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report}-${query.from}-${query.to}.${result.extension}"`,
    );
    response.send(result.buffer);
  }
}
