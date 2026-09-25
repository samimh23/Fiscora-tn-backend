import { ConfigService } from '@nestjs/config';
import { DocumentCategory } from '../../database/entities';
import type { DocumentExtractionClient } from './document-extraction-client';
import { DocumentExtractionProviderService } from './document-extraction-provider.service';
import type { NuExtractExtractionClientService } from './nuextract-extraction-client.service';
import type { QwenExtractionClientService } from './qwen-extraction-client.service';

function client(
  provider: 'qwen' | 'nuextract',
  modelName: string,
): DocumentExtractionClient {
  return {
    provider,
    modelName,
    extract: jest.fn(),
    extractFromOcr: jest.fn(),
  };
}

function selector(provider = 'qwen') {
  const qwen = client('qwen', 'Qwen/Qwen3.5-4B');
  const nuextract = client('nuextract', 'numind/NuExtract-2.0-8B');
  const service = new DocumentExtractionProviderService(
    new ConfigService({ DOCUMENT_EXTRACTION_PROVIDER: provider }),
    qwen as QwenExtractionClientService,
    nuextract as NuExtractExtractionClientService,
  );
  return { service, qwen, nuextract };
}

describe('DocumentExtractionProviderService', () => {
  it('routes fixed invoice and bank categories to NuExtract', () => {
    const { service, nuextract } = selector('nuextract');

    expect(service.select(DocumentCategory.Purchases)).toEqual({
      client: nuextract,
      documentKind: 'invoice',
    });
    expect(service.select(DocumentCategory.Bank)).toEqual({
      client: nuextract,
      documentKind: 'bank_statement',
    });
  });

  it('keeps generic categories on Qwen', () => {
    const { service, qwen } = selector('nuextract');

    expect(service.select(DocumentCategory.Other)).toEqual({
      client: qwen,
      documentKind: 'auto',
    });
  });

  it('pins retries to the model that originally started the job', () => {
    const { service, qwen } = selector('nuextract');

    expect(
      service.select(DocumentCategory.Purchases, 'Qwen/Qwen3.5-4B').client,
    ).toBe(qwen);
  });

  it('rejects an unknown provider instead of silently changing behavior', () => {
    const { service } = selector('unknown');

    expect(() => service.select(DocumentCategory.Purchases)).toThrow(
      'Unsupported DOCUMENT_EXTRACTION_PROVIDER',
    );
  });
});
