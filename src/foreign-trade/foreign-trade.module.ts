import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingJournal,
  CurrencyExchangeRate,
  ForeignTradeOperation,
  JournalEntry,
  JournalEntryLine,
  LedgerAccount,
  OrganizationMembership,
  VatSuspensionCertificate,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { PeriodClosingModule } from '../period-closing/period-closing.module';
import { ForeignTradeController } from './foreign-trade.controller';
import { ForeignTradeService } from './foreign-trade.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    PeriodClosingModule,
    TypeOrmModule.forFeature([
      CurrencyExchangeRate,
      VatSuspensionCertificate,
      ForeignTradeOperation,
      AccountingJournal,
      LedgerAccount,
      JournalEntry,
      JournalEntryLine,
      OrganizationMembership,
    ]),
  ],
  controllers: [ForeignTradeController],
  providers: [ForeignTradeService, PermissionGuard],
})
export class ForeignTradeModule {}
