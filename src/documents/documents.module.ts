import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingDocument,
  AuditLog,
  DocumentExtractionJob,
  DossierAssignment,
  MissingDocumentExpectation,
  OrganizationMembership,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { MalwareScannerService } from './malware-scanner.service';
import { documentObjectStorageProvider } from './object-storage/object-storage.provider';
import { DOCUMENT_OBJECT_STORAGE } from './object-storage/object-storage';
import { DocumentExtractionService } from './extraction/document-extraction.service';
import { GoogleWifTokenService } from './extraction/google-wif-token.service';
import { NuExtractClientService } from './extraction/nuextract-client.service';
import { BankReconciliationModule } from '../bank-reconciliation/bank-reconciliation.module';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    EmailModule,
    NotificationsModule,
    BankReconciliationModule,
    TypeOrmModule.forFeature([
      AccountingDocument,
      DocumentExtractionJob,
      MissingDocumentExpectation,
      AuditLog,
      OrganizationMembership,
      DossierAssignment,
    ]),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    MalwareScannerService,
    PermissionGuard,
    documentObjectStorageProvider,
    GoogleWifTokenService,
    NuExtractClientService,
    DocumentExtractionService,
  ],
  exports: [
    DocumentsService,
    MalwareScannerService,
    DOCUMENT_OBJECT_STORAGE,
    GoogleWifTokenService,
  ],
})
export class DocumentsModule {}
