import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import { OrganizationMembership } from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { AnnualTaxController } from './annual-tax.controller';
import { AnnualTaxService } from './annual-tax.service';

@Module({
  imports: [AuthModule, DossiersModule, TypeOrmModule.forFeature([OrganizationMembership])],
  controllers: [AnnualTaxController],
  providers: [AnnualTaxService, PermissionGuard],
})
export class AnnualTaxModule {}
