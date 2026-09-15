export const DOCUMENT_OBJECT_STORAGE = Symbol('DOCUMENT_OBJECT_STORAGE');

export interface DocumentObjectStorage {
  ensureReady(): Promise<void>;
  putObject(
    objectKey: string,
    content: Buffer,
    contentType: string,
  ): Promise<void>;
  readObject(objectKey: string): Promise<Buffer>;
  removeObject(objectKey: string): Promise<void>;
  signedReadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}
