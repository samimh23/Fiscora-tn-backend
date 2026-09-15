import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { DocumentObjectStorage } from './object-storage';

export class MinioObjectStorage implements DocumentObjectStorage {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET', 'accounting-documents');
    const accessKeyId = config.get<string>('MINIO_ACCESS_KEY', 'minioadmin');
    const secretAccessKey = config.get<string>(
      'MINIO_SECRET_KEY',
      'minioadmin',
    );
    const credentials = { accessKeyId, secretAccessKey };
    const internalHost = config.get<string>('MINIO_ENDPOINT', 'localhost');
    const internalPort = config.get<string>('MINIO_PORT', '9000');
    const internalUseSsl = config.get<string>('MINIO_USE_SSL', 'false');
    const publicHost = config.get<string>(
      'MINIO_PUBLIC_ENDPOINT',
      internalHost,
    );
    const publicPort = config.get<string>('MINIO_PUBLIC_PORT', internalPort);
    const publicUseSsl = config.get<string>(
      'MINIO_PUBLIC_USE_SSL',
      internalUseSsl,
    );
    const region = config.get<string>('MINIO_REGION', 'us-east-1');
    this.client = new S3Client({
      endpoint: this.endpoint(
        internalHost,
        Number(internalPort),
        internalUseSsl === 'true',
      ),
      region,
      credentials,
      forcePathStyle: true,
    });
    this.publicClient = new S3Client({
      endpoint: this.endpoint(
        publicHost,
        Number(publicPort),
        publicUseSsl === 'true',
      ),
      region,
      credentials,
      forcePathStyle: true,
    });
  }

  async ensureReady() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const status = this.httpStatus(error);
      if (status !== 404) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async putObject(objectKey: string, content: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  async readObject(objectKey: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!response.Body) throw new Error('MinIO returned no object content.');
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async removeObject(objectKey: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  signedReadUrl(objectKey: string, expiresInSeconds: number) {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  private endpoint(host: string, port: number, useSsl: boolean) {
    return `${useSsl ? 'https' : 'http'}://${host}:${port}`;
  }

  private httpStatus(error: unknown) {
    if (!error || typeof error !== 'object') return undefined;
    const metadata = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata;
    return metadata?.httpStatusCode;
  }
}
