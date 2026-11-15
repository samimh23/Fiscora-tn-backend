import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import { DossiersModule } from '../dossiers/dossiers.module';
import {
  Notification,
  ObligationInstance,
  OrganizationMembership,
} from '../database/entities';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      Notification,
      ObligationInstance,
      OrganizationMembership,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, PermissionGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
