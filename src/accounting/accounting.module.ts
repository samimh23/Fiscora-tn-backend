import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AuditLog,
  CompanyProfile,
  FiscalYear,
  LedgerAccount,
  Organization,
  OrganizationMembership,
} from '../database/entities';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { DossiersModule } from '../dossiers/dossiers.module';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      Organization,
      OrganizationMembership,
      CompanyProfile,
      FiscalYear,
      LedgerAccount,
      AuditLog,
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, PermissionGuard],
})
export class AccountingModule {}
