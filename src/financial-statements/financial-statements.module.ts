import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingYearClosing,
  AccountingDocument,
  AuditLog,
  CompanyProfile,
  FinancialStatementMapping,
  FinancialStatementNoteDocument,
  FinancialStatementNoteSection,
  FinancialStatementNoteSet,
  FinancialStatementSnapshot,
  LedgerAccount,
  OrganizationMembership,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { FinancialStatementExportService } from './financial-statement-export.service';
import { FinancialStatementNotesService } from './financial-statement-notes.service';
import { FinancialStatementsController } from './financial-statements.controller';
import { FinancialStatementsService } from './financial-statements.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      LedgerAccount,
      FinancialStatementMapping,
      FinancialStatementNoteSet,
      FinancialStatementNoteSection,
      FinancialStatementNoteDocument,
      FinancialStatementSnapshot,
      AccountingDocument,
      AccountingYearClosing,
      CompanyProfile,
      AuditLog,
      OrganizationMembership,
    ]),
  ],
  controllers: [FinancialStatementsController],
  providers: [
    FinancialStatementsService,
    FinancialStatementExportService,
    FinancialStatementNotesService,
    PermissionGuard,
  ],
})
export class FinancialStatementsModule {}
