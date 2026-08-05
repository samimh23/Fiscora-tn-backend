import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingDocument,
  BankTransaction,
  BusinessInvoice,
  ClientDossier,
  Employee,
  FiscalParameter,
  JournalEntry,
  MissingDocumentExpectation,
  MonthlyTaxDeclaration,
  ObligationInstance,
  OrganizationMembership,
  PayrollRun,
  WorkTask,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { QualityAssuranceController } from './quality-assurance.controller';
import { QualityAssuranceService } from './quality-assurance.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      ClientDossier,
      AccountingDocument,
      MissingDocumentExpectation,
      WorkTask,
      ObligationInstance,
      JournalEntry,
      BankTransaction,
      FiscalParameter,
      MonthlyTaxDeclaration,
      BusinessInvoice,
      Employee,
      PayrollRun,
      OrganizationMembership,
    ]),
  ],
  controllers: [QualityAssuranceController],
  providers: [QualityAssuranceService, PermissionGuard],
})
export class QualityAssuranceModule {}
