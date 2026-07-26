import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingJournal,
  BankAccount,
  BankStatement,
  BankTransaction,
  JournalEntry,
  LedgerAccount,
  OrganizationMembership,
  ThirdPartyPayment,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationService } from './bank-reconciliation.service';
import { PeriodClosingModule } from '../period-closing/period-closing.module';

@Module({
  imports: [
    AuthModule,
    PeriodClosingModule,
    TypeOrmModule.forFeature([
      BankAccount,
      BankStatement,
      BankTransaction,
      AccountingJournal,
      LedgerAccount,
      ThirdPartyPayment,
      JournalEntry,
      OrganizationMembership,
    ]),
    DossiersModule,
  ],
  controllers: [BankReconciliationController],
  providers: [BankReconciliationService, PermissionGuard],
})
export class BankReconciliationModule {}
