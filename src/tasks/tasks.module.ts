import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AuditLog,
  DossierAssignment,
  ObligationInstance,
  OrganizationMembership,
  TaskChecklistItem,
  TaskComment,
  WorkTask,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      WorkTask,
      TaskChecklistItem,
      TaskComment,
      DossierAssignment,
      ObligationInstance,
      OrganizationMembership,
      AuditLog,
    ]),
  ],
  controllers: [TasksController],
  providers: [TasksService, PermissionGuard],
})
export class TasksModule {}
