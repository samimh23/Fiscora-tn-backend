import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  FiscalParameter,
  IncomeTaxBracket,
  OrganizationMembership,
  RegulatoryRule,
  VatRate,
  WithholdingTaxRate,
} from '../database/entities';
import { FiscalSettingsController } from './fiscal-settings.controller';
import { FiscalSettingsService } from './fiscal-settings.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      FiscalParameter,
      VatRate,
      WithholdingTaxRate,
      IncomeTaxBracket,
      OrganizationMembership,
      RegulatoryRule,
    ]),
  ],
  controllers: [FiscalSettingsController],
  providers: [FiscalSettingsService, PermissionGuard],
  exports: [FiscalSettingsService],
})
export class FiscalSettingsModule {}
