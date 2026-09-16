import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  ClientDossier,
  DossierAssignment,
  DossierContact,
  InboundEmailAttachment,
  InboundEmailMessage,
  Organization,
  OrganizationMembership,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  EmailIngestionController,
  EmailIngestionWebhookController,
} from './email-ingestion.controller';
import { EmailIngestionService } from './email-ingestion.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    DocumentsModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Organization,
      ClientDossier,
      DossierContact,
      DossierAssignment,
      OrganizationMembership,
      InboundEmailMessage,
      InboundEmailAttachment,
    ]),
  ],
  controllers: [EmailIngestionWebhookController, EmailIngestionController],
  providers: [EmailIngestionService, PermissionGuard],
})
export class EmailIngestionModule {}
