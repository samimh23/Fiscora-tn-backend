import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AuditLog,
  ClientDossier,
  DossierAssignment,
  DossierContact,
  OrganizationMembership,
} from '../database/entities';
import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      ClientDossier,
      DossierContact,
      DossierAssignment,
      OrganizationMembership,
      AuditLog,
    ]),
  ],
  controllers: [DossiersController],
  providers: [DossiersService, PermissionGuard],
  exports: [DossiersService],
})
export class DossiersModule {}
