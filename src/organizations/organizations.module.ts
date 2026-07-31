import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AuditLog,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  Permission,
  Role,
  User,
} from '../database/entities';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    AuthModule,
    EmailModule,
    TypeOrmModule.forFeature([
      Organization,
      OrganizationMembership,
      Role,
      Permission,
      OrganizationInvitation,
      AuditLog,
      User,
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, PermissionGuard],
})
export class OrganizationsModule {}
