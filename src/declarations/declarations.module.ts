import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingDocument,
  AuditLog,
  BusinessInvoice,
  MonthlyTaxDeclaration,
  ObligationInstance,
  OrganizationMembership,
  PayrollRun,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { DeclarationsController } from './declarations.controller';
import { DeclarationsService } from './declarations.service';
import { FiscalSettingsModule } from '../fiscal-settings/fiscal-settings.module';
import { FiscalWorkflowModule } from '../workflow/fiscal-workflow.module';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    FiscalSettingsModule,
    FiscalWorkflowModule,
    TypeOrmModule.forFeature([
      MonthlyTaxDeclaration,
      ObligationInstance,
      OrganizationMembership,
      BusinessInvoice,
      PayrollRun,
      AccountingDocument,
      AuditLog,
    ]),
  ],
  controllers: [DeclarationsController],
  providers: [DeclarationsService, PermissionGuard],
})
export class DeclarationsModule {}
