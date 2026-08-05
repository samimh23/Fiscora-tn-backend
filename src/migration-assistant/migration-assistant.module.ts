import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import {
  AccountingJournal,
  JournalEntry,
  JournalEntryLine,
  LedgerAccount,
  OrganizationMembership,
  ThirdParty,
} from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { MigrationAssistantController } from './migration-assistant.controller';
import { MigrationAssistantService } from './migration-assistant.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      LedgerAccount,
      AccountingJournal,
      ThirdParty,
      JournalEntry,
      JournalEntryLine,
      OrganizationMembership,
    ]),
    DossiersModule,
  ],
  controllers: [MigrationAssistantController],
  providers: [MigrationAssistantService, PermissionGuard],
})
export class MigrationAssistantModule {}
