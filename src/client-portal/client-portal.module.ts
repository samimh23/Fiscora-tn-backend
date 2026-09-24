import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  ClientPortalMessage,
  ClientPortalApproval,
  ClientNotificationPreference,
  DossierAssignment,
  OrganizationMembership,
  User,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  ClientPortalController,
  ClientPortalPreferencesController,
} from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalGateway } from './client-portal.gateway';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      ClientPortalMessage,
      ClientPortalApproval,
      ClientNotificationPreference,
      DossierAssignment,
      OrganizationMembership,
      User,
    ]),
  ],
  controllers: [ClientPortalController, ClientPortalPreferencesController],
  providers: [ClientPortalService, ClientPortalGateway, PermissionGuard],
})
export class ClientPortalModule {}
