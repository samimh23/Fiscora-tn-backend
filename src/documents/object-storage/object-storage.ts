export const DOCUMENT_OBJECT_STORAGE = Symbol('DOCUMENT_OBJECT_STORAGE');

export interface DocumentObjectStorage {
  ensureReady(): Promise<void>;
  putObject(
    objectKey: string,
    content: Buffer,
    contentType: string,
  ): Promise<void>;
  readObject(objectKey: string): Promise<Buffer>;
  putFile?(
    objectKey: string,
    filePath: string,
    contentType: string,
  ): Promise<void>;
  removeObject(objectKey: string): Promise<void>;
  signedReadUrl(
    objectKey: string,
    expiresInSeconds: number,
    downloadFilename?: string,
  ): Promise<string>;
}
