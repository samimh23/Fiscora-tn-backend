import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AccountingModule } from './accounting/accounting.module';
import { HealthController } from './health.controller';
import { ENTITIES } from './database/entities';
import { GeneratedInitial1784191623982 } from './database/migrations/1784191623982-generated-initial';
import { ClientDossiers1784200000000 } from './database/migrations/1784200000000-client-dossiers';
import { DossiersModule } from './dossiers/dossiers.module';
import { ObligationsEngine1784210000000 } from './database/migrations/1784210000000-obligations-engine';
import { ObligationsModule } from './obligations/obligations.module';
import { TaskManagement1784220000000 } from './database/migrations/1784220000000-task-management';
import { TasksModule } from './tasks/tasks.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BusinessModules1784230000000 } from './database/migrations/1784230000000-business-modules';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DeclarationsModule } from './declarations/declarations.module';
import { BookkeepingModule } from './bookkeeping/bookkeeping.module';
import { BillingModule } from './billing/billing.module';
import { PayrollModule } from './payroll/payroll.module';
import { FiscalSettings1784240000000 } from './database/migrations/1784240000000-fiscal-settings';
import { FiscalSettingsModule } from './fiscal-settings/fiscal-settings.module';
import { BusinessInvoices1784250000000 } from './database/migrations/1784250000000-business-invoices';
import { BusinessInvoicesModule } from './business-invoices/business-invoices.module';
import { Settlements1784260000000 } from './database/migrations/1784260000000-settlements';
import { SettlementsModule } from './settlements/settlements.module';
import { BankReconciliation1784270000000 } from './database/migrations/1784270000000-bank-reconciliation';
import { BankReconciliationModule } from './bank-reconciliation/bank-reconciliation.module';
import { FixedAssets1784280000000 } from './database/migrations/1784280000000-fixed-assets';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';
import { PeriodClosing1784290000000 } from './database/migrations/1784290000000-period-closing';
import { PeriodClosingModule } from './period-closing/period-closing.module';
import { PeriodLockTrigger1784300000000 } from './database/migrations/1784300000000-period-lock-trigger';
import { FinancialStatements1784310000000 } from './database/migrations/1784310000000-financial-statements';
import { FinancialStatementNotes1784320000000 } from './database/migrations/1784320000000-financial-statement-notes';
import { TeamProductivity1784330000000 } from './database/migrations/1784330000000-team-productivity';
import { MonthlyDeclarationWorkflow1784340000000 } from './database/migrations/1784340000000-monthly-declaration-workflow';
import { FinancialStatementsModule } from './financial-statements/financial-statements.module';
import { ProductivityModule } from './productivity/productivity.module';
import { ForeignTradeAndTtn1784350000000 } from './database/migrations/1784350000000-foreign-trade-and-ttn';
import { ForeignTradeModule } from './foreign-trade/foreign-trade.module';
import { ElectronicInvoicesModule } from './electronic-invoices/electronic-invoices.module';
import { FixForeignTradePermissions1784351000000 } from './database/migrations/1784351000000-fix-foreign-trade-permissions';
import { InvitationEmailDelivery1784352000000 } from './database/migrations/1784352000000-invitation-email-delivery';
import { ClientPortal1784353000000 } from './database/migrations/1784353000000-client-portal';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { ClientDocumentSharing1784353100000 } from './database/migrations/1784353100000-client-document-sharing';
import { DossierAccountingCore1784354000000 } from './database/migrations/1784354000000-dossier-accounting-core';
import { FinanceLaw20261784355000000 } from './database/migrations/1784355000000-finance-law-2026';
import { PlatformAdministration1784356000000 } from './database/migrations/1784356000000-platform-administration';
import { PlatformAdminControls1784357000000 } from './database/migrations/1784357000000-platform-admin-controls';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UniversalAuditInterceptor } from './common/universal-audit.interceptor';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { SaasSubscriptions1784358000000 } from './database/migrations/1784358000000-saas-subscriptions';
import { SaasSubscriptionsModule } from './saas-subscriptions/saas-subscriptions.module';
import { DocumentMalwareScanning1784359000000 } from './database/migrations/1784359000000-document-malware-scanning';
import { CommercialDocuments1784360000000 } from './database/migrations/1784360000000-commercial-documents';
import { CommercialDocumentsModule } from './commercial-documents/commercial-documents.module';
import { ClientPortalWorkspace1784361000000 } from './database/migrations/1784361000000-client-portal-workspace';
import { EmailDeliveryLogs1784362000000 } from './database/migrations/1784362000000-email-delivery-logs';
import { MetricsModule } from './metrics/metrics.module';
import { AnnualTaxModule } from './annual-tax/annual-tax.module';
import { InAppWorkTracking1784363000000 } from './database/migrations/1784363000000-in-app-work-tracking';
import { PasswordResetTokens1784364000000 } from './database/migrations/1784364000000-password-reset-tokens';
import { QualityAssurancePermission1784365000000 } from './database/migrations/1784365000000-quality-assurance-permission';
import { QualityAssuranceModule } from './quality-assurance/quality-assurance.module';
import { BankReconciliationRules1784366000000 } from './database/migrations/1784366000000-bank-reconciliation-rules';
import { MigrationAssistantModule } from './migration-assistant/migration-assistant.module';
import { DocumentRequestsWorkflow1784367000000 } from './database/migrations/1784367000000-document-requests-workflow';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: Number(config.get('DB_PORT', 5435)),
        username: config.get('DB_USER', 'accounting'),
        password: config.get('DB_PASSWORD', 'accounting_dev'),
        database: config.get('DB_NAME', 'accounting_nest'),
        schema: 'public',
        entities: ENTITIES,
        migrations: [
          GeneratedInitial1784191623982,
          ClientDossiers1784200000000,
          ObligationsEngine1784210000000,
          TaskManagement1784220000000,
          BusinessModules1784230000000,
          FiscalSettings1784240000000,
          BusinessInvoices1784250000000,
          Settlements1784260000000,
          BankReconciliation1784270000000,
          FixedAssets1784280000000,
          PeriodClosing1784290000000,
          PeriodLockTrigger1784300000000,
          FinancialStatements1784310000000,
          FinancialStatementNotes1784320000000,
          TeamProductivity1784330000000,
          MonthlyDeclarationWorkflow1784340000000,
          ForeignTradeAndTtn1784350000000,
          FixForeignTradePermissions1784351000000,
          InvitationEmailDelivery1784352000000,
          ClientPortal1784353000000,
          ClientDocumentSharing1784353100000,
          DossierAccountingCore1784354000000,
          FinanceLaw20261784355000000,
          PlatformAdministration1784356000000,
          PlatformAdminControls1784357000000,
          SaasSubscriptions1784358000000,
          DocumentMalwareScanning1784359000000,
          CommercialDocuments1784360000000,
          ClientPortalWorkspace1784361000000,
          EmailDeliveryLogs1784362000000,
          InAppWorkTracking1784363000000,
          PasswordResetTokens1784364000000,
          QualityAssurancePermission1784365000000,
          BankReconciliationRules1784366000000,
          DocumentRequestsWorkflow1784367000000,
        ],
        migrationsRun: config.get('DB_MIGRATIONS_RUN', 'false') === 'true',
        synchronize: false,
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/{*path}', '/health', '/docs/{*path}'],
    }),
    ScheduleModule.forRoot(),
    MetricsModule,
    AuthModule,
    OrganizationsModule,
    AccountingModule,
    DossiersModule,
    ObligationsModule,
    TasksModule,
    DocumentsModule,
    NotificationsModule,
    DeclarationsModule,
    BookkeepingModule,
    BillingModule,
    PayrollModule,
    FiscalSettingsModule,
    BusinessInvoicesModule,
    SettlementsModule,
    BankReconciliationModule,
    FixedAssetsModule,
    PeriodClosingModule,
    FinancialStatementsModule,
    ProductivityModule,
    ForeignTradeModule,
    ElectronicInvoicesModule,
    ClientPortalModule,
    PlatformAdminModule,
    SaasSubscriptionsModule,
    CommercialDocumentsModule,
    AnnualTaxModule,
    QualityAssuranceModule,
    MigrationAssistantModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: UniversalAuditInterceptor },
  ],
})
export class AppModule {}
