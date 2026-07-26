import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingDocument,
  AccountingJournal,
  BusinessInvoice,
  BusinessInvoiceLine,
  JournalEntry,
  JournalEntryLine,
  LedgerAccount,
  OrganizationMembership,
  ThirdParty,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { FiscalSettingsModule } from '../fiscal-settings/fiscal-settings.module';
import { BusinessInvoicesController } from './business-invoices.controller';
import { BusinessInvoicesService } from './business-invoices.service';
import { PeriodClosingModule } from '../period-closing/period-closing.module';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    FiscalSettingsModule,
    PeriodClosingModule,
    TypeOrmModule.forFeature([
      BusinessInvoice,
      BusinessInvoiceLine,
      AccountingJournal,
      JournalEntry,
      JournalEntryLine,
      LedgerAccount,
      AccountingDocument,
      ThirdParty,
      OrganizationMembership,
    ]),
  ],
  controllers: [BusinessInvoicesController],
  providers: [BusinessInvoicesService, PermissionGuard],
})
export class BusinessInvoicesModule {}
