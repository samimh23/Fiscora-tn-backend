import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  BusinessInvoice,
  OrganizationMembership,
  TtnEInvoiceConfiguration,
  TtnEInvoiceSubmission,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { ElectronicInvoicesController } from './electronic-invoices.controller';
import { ElectronicInvoicesService } from './electronic-invoices.service';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([
      TtnEInvoiceConfiguration,
      TtnEInvoiceSubmission,
      BusinessInvoice,
      OrganizationMembership,
    ]),
  ],
  controllers: [ElectronicInvoicesController],
  providers: [ElectronicInvoicesService, PermissionGuard],
})
export class ElectronicInvoicesModule {}
