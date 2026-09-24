import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { JwtUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import {
  RequireAllPermissions,
  RequirePermission,
} from '../common/permission.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { PermissionNames } from '../database/permissions';
import { BankReconciliationService } from './bank-reconciliation.service';
import {
  CreateBankRuleDto,
  CreateBankAccountDto,
  CreateBankDto,
  GenerateBankEntryDto,
  ImportBankStatementDto,
  MatchJournalEntryDto,
  MatchPaymentDto,
  UpdateBankAccountDto,
  UpdateBankRuleDto,
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

  @Put('accounts/:accountId')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  updateAccount(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.service.updateBankAccount(
      organizationId,
      dossierId,
      accountId,
      user.userId,
      dto,
    );
  }

  @Delete('accounts/:accountId')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  deactivateAccount(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.deactivateBankAccount(
      organizationId,
      dossierId,
      accountId,
      user.userId,
    );
  }

  // Les établissements sont partagés par tout le cabinet : pas de dossierId.
  @Get('banks')
  @RequirePermission(PermissionNames.BankReconciliationView)
  listBanks(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.service.listBanks(organizationId);
  }

  @Post('banks')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  createBank(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateBankDto,
  ) {
    return this.service.createBank(organizationId, dto);
  }

  @Get('rules')
  @RequirePermission(PermissionNames.BankReconciliationView)
  listRules(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listRules(organizationId, dossierId, user.userId);
  }

  @Post('rules')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  createRule(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateBankRuleDto,
  ) {
    return this.service.createRule(organizationId, dossierId, user.userId, dto);
  }

  @Put('rules/:ruleId')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  updateRule(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateBankRuleDto,
  ) {
    return this.service.updateRule(
      organizationId,
      dossierId,
      ruleId,
      user.userId,
      dto,
    );
  }

  @Delete('rules/:ruleId')
  @RequirePermission(PermissionNames.BankReconciliationManage)
  deactivateRule(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.deactivateRule(
      organizationId,
      dossierId,
      ruleId,
      user.userId,
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

  @Get('transactions/:transactionId/suggestions')
  @RequirePermission(PermissionNames.BankReconciliationView)
  matchSuggestions(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.matchSuggestions(
      organizationId,
      dossierId,
      transactionId,
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

  @Post('transactions/:transactionId/post-generated-entry')
  @RequireAllPermissions(
    PermissionNames.BankReconciliationManage,
    PermissionNames.AccountingPost,
  )
  postGeneratedEntry(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.postGeneratedEntryAndMatch(
      organizationId,
      dossierId,
      transactionId,
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
