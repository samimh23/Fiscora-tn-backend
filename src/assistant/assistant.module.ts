import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/permission.guard';
import { OrganizationMembership } from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { DocumentsModule } from '../documents/documents.module';
import {
  AssistantController,
  ContextualAssistantController,
} from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantIndexingService } from './assistant-indexing.service';
import { VertexAiClient } from './vertex-ai.client';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    DocumentsModule,
    TypeOrmModule.forFeature([OrganizationMembership]),
  ],
  controllers: [AssistantController, ContextualAssistantController],
  providers: [
    AssistantService,
    AssistantIndexingService,
    VertexAiClient,
    PermissionGuard,
  ],
})
export class AssistantModule {}
