import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingJournal,
  AssetDepreciationPeriod,
  AssetDepreciationYear,
  BusinessInvoice,
  FixedAsset,
  FixedAssetCategory,
  LedgerAccount,
  OrganizationMembership,
  ThirdParty,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';
import { PeriodClosingModule } from '../period-closing/period-closing.module';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    PeriodClosingModule,
    TypeOrmModule.forFeature([
      FixedAssetCategory,
      FixedAsset,
      AssetDepreciationPeriod,
      AssetDepreciationYear,
      LedgerAccount,
      AccountingJournal,
      BusinessInvoice,
      ThirdParty,
      OrganizationMembership,
    ]),
  ],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService, PermissionGuard],
})
export class FixedAssetsModule {}
