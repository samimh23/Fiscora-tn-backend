import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingDocument,
  AccountReconciliation,
  AuditLog,
  AccountingJournal,
  JournalEntry,
  JournalEntryLine,
  LedgerAccount,
  OrganizationMembership,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { BookkeepingController } from './bookkeeping.controller';
import { BookkeepingService } from './bookkeeping.service';
import { PeriodClosingModule } from '../period-closing/period-closing.module';
import { BookkeepingExportService } from './bookkeeping-export.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    PeriodClosingModule,
    TypeOrmModule.forFeature([
      AccountingJournal,
      JournalEntry,
      JournalEntryLine,
      LedgerAccount,
      AccountingDocument,
      AccountReconciliation,
      AuditLog,
      OrganizationMembership,
    ]),
  ],
  controllers: [BookkeepingController],
  providers: [BookkeepingService, BookkeepingExportService, PermissionGuard],
})
export class BookkeepingModule {}
