import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminGuard } from '../common/platform-admin.guard';
import { PermissionGuard } from '../common/permission.guard';
import { OrganizationMembership } from '../database/entities';
import { DossiersModule } from '../dossiers/dossiers.module';
import { documentObjectStorageProvider } from '../documents/object-storage/object-storage.provider';
import { AzureBlobObjectStorage } from '../documents/object-storage/azure-blob-object-storage';
import { MinioObjectStorage } from '../documents/object-storage/minio-object-storage';
import { GoogleWifTokenService } from '../documents/extraction/google-wif-token.service';
import { PaddleOcrClientService } from '../documents/extraction/paddle-ocr-client.service';
import {
  TrainingDatasetsService,
  TRAINING_OBJECT_STORAGE,
} from './training-datasets.service';
import {
  TrainingConsentController,
  TrainingDatasetsController,
} from './training-datasets.controller';

@Module({
  imports: [
    AuthModule,
    DossiersModule,
    TypeOrmModule.forFeature([OrganizationMembership]),
  ],
  controllers: [TrainingConsentController, TrainingDatasetsController],
  providers: [
    TrainingDatasetsService,
    PlatformAdminGuard,
    PermissionGuard,
    documentObjectStorageProvider,
    GoogleWifTokenService,
    PaddleOcrClientService,
    {
      provide: TRAINING_OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config
          .get<string>('OBJECT_STORAGE_PROVIDER', 'minio')
          .trim()
          .toLowerCase();
        if (provider === 'azure')
          return new AzureBlobObjectStorage(config, 'training-datasets');
        if (provider === 'minio')
          return new MinioObjectStorage(config, 'training-datasets');
        throw new Error('Unsupported training object storage provider.');
      },
    },
  ],
})
export class TrainingDatasetsModule {}
