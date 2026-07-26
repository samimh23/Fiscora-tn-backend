import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  CabinetInvoice,
  CabinetPayment,
  OrganizationMembership,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      CabinetInvoice,
      CabinetPayment,
      OrganizationMembership,
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService, PermissionGuard],
})
export class BillingModule {}
