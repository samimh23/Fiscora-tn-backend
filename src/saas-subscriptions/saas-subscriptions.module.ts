import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import { PlatformAdminGuard } from '../common/platform-admin.guard';
import { OrganizationMembership } from '../database/entities';
import {
  OrganizationSubscriptionController,
  PlatformSaasSubscriptionsController,
} from './saas-subscriptions.controller';
import { SaasSubscriptionsService } from './saas-subscriptions.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([OrganizationMembership])],
  controllers: [
    PlatformSaasSubscriptionsController,
    OrganizationSubscriptionController,
  ],
  providers: [SaasSubscriptionsService, PlatformAdminGuard, PermissionGuard],
})
export class SaasSubscriptionsModule {}
