import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingDocument,
  AuditLog,
  MissingDocumentExpectation,
  OrganizationMembership,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { MalwareScannerService } from './malware-scanner.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      AccountingDocument,
      MissingDocumentExpectation,
      AuditLog,
      OrganizationMembership,
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, MalwareScannerService, PermissionGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
