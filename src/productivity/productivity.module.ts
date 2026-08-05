import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  CabinetMemberCostRate,
  ClientDossier,
  DossierAssignment,
  OrganizationMembership,
  TimeEntry,
  WorkSession,
  WorkTask,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { ProductivityController } from './productivity.controller';
import { ProductivityService } from './productivity.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      CabinetMemberCostRate,
      TimeEntry,
      WorkSession,
      OrganizationMembership,
      WorkTask,
      ClientDossier,
      DossierAssignment,
    ]),
  ],
  controllers: [ProductivityController],
  providers: [ProductivityService, PermissionGuard],
})
export class ProductivityModule {}
