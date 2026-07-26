import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  ClientPortalMessage,
  DossierAssignment,
  OrganizationMembership,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      ClientPortalMessage,
      DossierAssignment,
      OrganizationMembership,
    ]),
  ],
  controllers: [ClientPortalController],
  providers: [ClientPortalService, PermissionGuard],
})
export class ClientPortalModule {}
