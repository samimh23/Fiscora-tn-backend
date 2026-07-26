import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  Employee,
  OrganizationMembership,
  PayrollLine,
  PayrollRun,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { FiscalSettingsModule } from '../fiscal-settings/fiscal-settings.module';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    FiscalSettingsModule,
    TypeOrmModule.forFeature([
      Employee,
      PayrollRun,
      PayrollLine,
      OrganizationMembership,
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollService, PermissionGuard],
})
export class PayrollModule {}
