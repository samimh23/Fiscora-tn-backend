import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
} from '@azure/storage-blob';
import { ConfigService } from '@nestjs/config';
import type { DocumentObjectStorage } from './object-storage';

export class AzureBlobObjectStorage implements DocumentObjectStorage {
  private readonly serviceClient: BlobServiceClient;
  private readonly accountName: string;
  private readonly containerName: string;
  private readonly credential: DefaultAzureCredential;

  constructor(config: ConfigService) {
    const accountUrl = config.get<string>('AZURE_STORAGE_ACCOUNT_URL');
    if (!accountUrl) {
      throw new Error(
        'AZURE_STORAGE_ACCOUNT_URL is required when OBJECT_STORAGE_PROVIDER=azure.',
      );
    }
    const parsedUrl = new URL(accountUrl);
    this.accountName = parsedUrl.hostname.split('.')[0];
    this.containerName = config.get(
      'AZURE_STORAGE_CONTAINER',
      'accounting-documents',
    );
    this.credential = new DefaultAzureCredential();
    this.serviceClient = new BlobServiceClient(accountUrl, this.credential);
  }

  async ensureReady() {
    await this.serviceClient
      .getContainerClient(this.containerName)
      .createIfNotExists();
  }

  async putObject(objectKey: string, content: Buffer, contentType: string) {
    await this.blockBlob(objectKey).uploadData(content, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  async readObject(objectKey: string) {
    const response = await this.blockBlob(objectKey).download();
    const stream = response.readableStreamBody;
    if (!stream) throw new Error('Azure Blob Storage returned no content.');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  async removeObject(objectKey: string) {
    await this.blockBlob(objectKey).deleteIfExists({
      deleteSnapshots: 'include',
    });
  }

  async signedReadUrl(objectKey: string, expiresInSeconds: number) {
    const now = new Date();
    const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
    const expiresOn = new Date(now.getTime() + expiresInSeconds * 1000);
    const delegationKey = await this.serviceClient.getUserDelegationKey(
      startsOn,
      expiresOn,
    );
    const query = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: objectKey,
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        startsOn,
        expiresOn,
      },
      delegationKey,
      this.accountName,
    );
    return `${this.blockBlob(objectKey).url}?${query.toString()}`;
  }

  private blockBlob(objectKey: string) {
    return this.serviceClient
      .getContainerClient(this.containerName)
      .getBlockBlobClient(objectKey);
  }
}
