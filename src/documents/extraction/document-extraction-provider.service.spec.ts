import { DocumentCategory } from '../../database/entities';
import { DocumentExtractionProviderService } from './document-extraction-provider.service';
import type { NuExtractExtractionClientService } from './nuextract-extraction-client.service';

describe('NuExtract-only document routing', () => {
  const nuextract = { provider: 'nuextract', modelName: 'numind/NuExtract3' };
  const service = new DocumentExtractionProviderService(
    nuextract as NuExtractExtractionClientService,
  );

  it.each([DocumentCategory.Purchases, DocumentCategory.Sales])(
    'routes %s to the invoice template',
    (category) =>
      expect(service.select(category)).toEqual({
        client: nuextract,
        documentKind: 'invoice',
      }),
  );

  it('routes bank statements to the bank template', () => {
    expect(service.select(DocumentCategory.Bank)).toEqual({
      client: nuextract,
      documentKind: 'bank_statement',
    });
  });

  it.each([
    DocumentCategory.Inbox,
    DocumentCategory.Contracts,
    DocumentCategory.Declarations,
    DocumentCategory.Payroll,
    DocumentCategory.Legal,
    DocumentCategory.Other,
  ])('rejects upload-only category %s without an AI fallback', (category) => {
    expect(() => service.select(category)).toThrow('Classez le document');
  });
});
