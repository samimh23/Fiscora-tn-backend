import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingJournal,
  AuditLog,
  ClientDossier,
  DossierAssignment,
  DossierContact,
  FiscalYear,
  LedgerAccount,
  OrganizationMembership,
  ThirdParty,
} from '../database/entities';
import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';
import { DossierDeletionService } from './dossier-deletion.service';
import { documentObjectStorageProvider } from '../documents/object-storage/object-storage.provider';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      ClientDossier,
      DossierContact,
      DossierAssignment,
      OrganizationMembership,
      AuditLog,
      AccountingJournal,
      FiscalYear,
      LedgerAccount,
      ThirdParty,
    ]),
  ],
  controllers: [DossiersController],
  providers: [
    DossiersService,
    DossierDeletionService,
    documentObjectStorageProvider,
    PermissionGuard,
  ],
  exports: [DossiersService],
})
export class DossiersModule {}
