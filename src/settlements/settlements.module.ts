import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingJournal,
  BusinessInvoice,
  JournalEntry,
  JournalEntryLine,
  LedgerAccount,
  OrganizationMembership,
  PaymentAllocation,
  ThirdParty,
  ThirdPartyPayment,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { PeriodClosingModule } from '../period-closing/period-closing.module';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    PeriodClosingModule,
    TypeOrmModule.forFeature([
      ThirdParty,
      ThirdPartyPayment,
      PaymentAllocation,
      BusinessInvoice,
      AccountingJournal,
      JournalEntry,
      JournalEntryLine,
      LedgerAccount,
      OrganizationMembership,
    ]),
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService, PermissionGuard],
})
export class SettlementsModule {}
