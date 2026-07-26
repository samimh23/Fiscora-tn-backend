import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingJournal,
  AccountingPeriod,
  AccountingYearClosing,
  AuditLog,
  ClosingAdjustment,
  JournalEntry,
  JournalEntryLine,
  LedgerAccount,
  OrganizationMembership,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { PeriodClosingController } from './period-closing.controller';
import { PeriodClosingService } from './period-closing.service';
import { PeriodLockService } from './period-lock.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      AccountingPeriod,
      ClosingAdjustment,
      AccountingYearClosing,
      AccountingJournal,
      JournalEntry,
      JournalEntryLine,
      LedgerAccount,
      AuditLog,
      OrganizationMembership,
    ]),
  ],
  controllers: [PeriodClosingController],
  providers: [PeriodClosingService, PeriodLockService, PermissionGuard],
  exports: [PeriodLockService],
})
export class PeriodClosingModule {}
