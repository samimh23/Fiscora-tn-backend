import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminGuard } from '../common/platform-admin.guard';
import { EmailModule } from '../email/email.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformAdminGuard],
})
export class PlatformAdminModule {}
