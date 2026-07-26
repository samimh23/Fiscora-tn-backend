import {
  Body,
  Controller,
  Get,
  Param,
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
import { BankReconciliationService } from './bank-reconciliation.service';
import {
  CreateBankAccountDto,
  GenerateBankEntryDto,
  ImportBankStatementDto,
  MatchJournalEntryDto,
  MatchPaymentDto,
} from './dto';

@ApiTags('Rapprochement bancaire')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller(
  'api/organizations/:organizationId/dossiers/:dossierId/bank-reconciliation',
)
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  @Get('accounts')
  @RequirePermission(PermissionNames.BankReconciliationView)
  listAccounts(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listBankAccounts(
      organizationId,
      dossierId,
      user.userId,
    );
  }

  @Post('accounts')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  createAccount(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.service.createBankAccount(
      organizationId,
      dossierId,
      user.userId,
      dto,
    );
  }

  @Get('statements')
  @RequirePermission(PermissionNames.BankReconciliationView)
  listStatements(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listStatements(organizationId, dossierId, user.userId);
  }

  @Get('statements/:statementId')
  @RequirePermission(PermissionNames.BankReconciliationView)
  getStatement(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getStatement(
      organizationId,
      dossierId,
      statementId,
      user.userId,
    );
  }

  @Post('statements/import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10_000_000 } }),
  )
  @RequirePermission(PermissionNames.BankReconciliationManage)
  importStatement(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportBankStatementDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.importStatement(
      organizationId,
      dossierId,
      user.userId,
      dto,
      file,
    );
  }

  @Post('statements/:statementId/auto-match')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  autoMatch(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.autoMatch(
      organizationId,
      dossierId,
      statementId,
      user.userId,
    );
  }

  @Post('transactions/:transactionId/match-payment')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  matchPayment(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: MatchPaymentDto,
  ) {
    return this.service.matchPayment(
      organizationId,
      dossierId,
      transactionId,
      dto.paymentId,
      user.userId,
    );
  }

  @Post('transactions/:transactionId/match-entry')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  matchEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: MatchJournalEntryDto,
  ) {
    return this.service.matchEntry(
      organizationId,
      dossierId,
      transactionId,
      dto.journalEntryId,
      user.userId,
    );
  }

  @Post('transactions/:transactionId/generate-entry')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  generateEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: GenerateBankEntryDto,
  ) {
    return this.service.generateEntry(
      organizationId,
      dossierId,
      transactionId,
      user.userId,
      dto,
    );
  }

  @Post('statements/:statementId/reconcile')
  @RequirePermission(PermissionNames.BankReconciliationValidate)
  reconcile(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reconcile(
      organizationId,
      dossierId,
      statementId,
      user.userId,
    );
  }
}
