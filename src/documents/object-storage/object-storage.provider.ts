import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AzureBlobObjectStorage } from './azure-blob-object-storage';
import { MinioObjectStorage } from './minio-object-storage';
import { DOCUMENT_OBJECT_STORAGE } from './object-storage';

export const documentObjectStorageProvider: Provider = {
  provide: DOCUMENT_OBJECT_STORAGE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const provider = config
      .get<string>('OBJECT_STORAGE_PROVIDER', 'minio')
      .trim()
      .toLowerCase();
    if (provider === 'azure') return new AzureBlobObjectStorage(config);
    if (provider === 'minio') return new MinioObjectStorage(config);
    throw new Error(
      `Unsupported OBJECT_STORAGE_PROVIDER: ${provider}. Use minio or azure.`,
    );
  },
};
