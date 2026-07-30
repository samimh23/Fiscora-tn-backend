import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  CommercialDocument,
  CommercialDocumentLine,
  LedgerAccount,
  OrganizationMembership,
  ThirdParty,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { FiscalSettingsModule } from '../fiscal-settings/fiscal-settings.module';
import { CommercialDocumentsController } from './commercial-documents.controller';
import { CommercialDocumentsService } from './commercial-documents.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    FiscalSettingsModule,
    TypeOrmModule.forFeature([
      CommercialDocument,
      CommercialDocumentLine,
      ThirdParty,
      LedgerAccount,
      OrganizationMembership,
    ]),
  ],
  controllers: [CommercialDocumentsController],
  providers: [CommercialDocumentsService, PermissionGuard],
})
export class CommercialDocumentsModule {}
