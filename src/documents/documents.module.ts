import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingDocument,
  AuditLog,
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

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    EmailModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      AccountingDocument,
      MissingDocumentExpectation,
      AuditLog,
      OrganizationMembership,
      DossierAssignment,
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, MalwareScannerService, PermissionGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
