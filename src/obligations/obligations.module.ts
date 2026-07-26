import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AuditLog,
  DossierAssignment,
  ObligationInstance,
  ObligationTemplate,
  OrganizationMembership,
  TaskChecklistItem,
  WorkTask,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { ObligationsController } from './obligations.controller';
import { ObligationsService } from './obligations.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      ObligationTemplate,
      ObligationInstance,
      DossierAssignment,
      OrganizationMembership,
      AuditLog,
      WorkTask,
      TaskChecklistItem,
    ]),
  ],
  controllers: [ObligationsController],
  providers: [ObligationsService, PermissionGuard],
})
export class ObligationsModule {}
