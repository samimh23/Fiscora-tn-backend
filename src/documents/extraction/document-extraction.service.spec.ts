import { IsNull } from 'typeorm';
import {
  DocumentExtractionJobStatus,
  ExtractionStatus,
} from '../../database/entities';
import {
  DocumentExtractionService,
  postgresUpdateRows,
} from './document-extraction.service';
import { ExtractionReviewDecision } from './extraction.dto';
import type { DocumentExtractionClient } from './document-extraction-client';

const legacyBankData = {
  document_type: ['bank_statement'],
  currency: 'TND',
  bank_statement: {
    period_start: '01/09/2026',
    period_end: '30/09/2026',
    opening_balance: '5000,000',
    closing_balance: '5224,800',
    transactions: [
      {
        transaction_date: '15/09/2026',
        description: 'ATLAS',
        credit: '1000,000',
      },
      {
        transaction_date: '18/09/2026',
        description: 'CARTHAGE',
        debit: '700,000',
      },
      { transaction_date: '24/09/2026', description: 'SAHEL', debit: '65,200' },
      { transaction_date: '30/09/2026', description: 'Frais', debit: '10,000' },
    ],
  },
};

describe('DocumentExtractionService image-first extraction', () => {
  const file = Buffer.from('original document');
  const ocr = {
    width: 100,
    height: 200,
    tokens: [
      {
        id: 'p1_t1',
        page: 1,
        text: 'wrong OCR amount',
        confidence: 1,
        bbox: [0, 0, 50, 10],
      },
    ],
  };
  function setup() {
    const client = {
      provider: 'nuextract',
      modelName: 'numind/NuExtract3',
      extract: jest.fn().mockResolvedValue({
        data: { total_incl_tax: '600,000' },
        provider: 'nuextract',
        modelName: 'numind/NuExtract3',
        rawResponse: {},
      }),
      extractFromOcr: jest.fn(),
      extractImages: jest.fn().mockResolvedValue({
        data: { document_type: 'invoice', line_items: [] },
        rawResponse: {},
      }),
    };
    const paddle = {
      extract: jest.fn().mockResolvedValue(ocr),
      renderPdf: jest.fn(),
    };
    const config = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };
    const service = new DocumentExtractionService(
      config as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      paddle as never,
      {} as never,
    );
    return { service, client, paddle };
  }

  it('sends the original image even when OCR succeeds, without waiting for OCR', async () => {
    const { service, client, paddle } = setup();
    let resolveOcr!: (value: typeof ocr) => void;
    paddle.extract.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOcr = resolve;
        }),
    );
    const pending = service['extractImage'](
      file,
      'image/png',
      'doc',
      client as DocumentExtractionClient,
      'invoice',
      [],
    );
    expect(client.extract).toHaveBeenCalledWith(
      file,
      'image/png',
      [],
      'invoice',
    );
    expect(client.extractFromOcr).not.toHaveBeenCalled();
    resolveOcr(ocr);
    const [result, mapping] = await pending;
    expect(result.data.total_incl_tax).toBe('600,000');
    expect(result.rawResponse.inputMode).toBe('image');
    expect(mapping).toBe(ocr);
  });

  it('keeps image extraction available when OCR mapping fails', async () => {
    const { service, client, paddle } = setup();
    paddle.extract.mockRejectedValue(new Error('OCR unavailable'));
    const [result, mapping] = await service['extractImage'](
      file,
      'image/png',
      'doc',
      client as DocumentExtractionClient,
      'invoice',
      [],
    );
    expect(result.data.total_incl_tax).toBe('600,000');
    expect(mapping).toBeNull();
    expect(client.extractFromOcr).not.toHaveBeenCalled();
  });

  it('sends every PDF page as an image in bounded batches, not OCR tokens', async () => {
    const { service, client, paddle } = setup();
    const image = (page: number) => ({
      content: Buffer.from([255, 216, 255]),
      mimeType: 'image/jpeg',
      page,
    });
    paddle.renderPdf
      .mockResolvedValueOnce({ pageCount: 3, images: [image(1), image(2)] })
      .mockResolvedValueOnce({ pageCount: 3, images: [image(3)] });
    const [result, mapping] = await service['extractPdf'](
      { documentId: 'doc', rawResponse: null } as never,
      file,
      client as DocumentExtractionClient,
      'invoice',
      [],
    );
    expect(paddle.renderPdf.mock.calls).toEqual([
      [file, 1, 2],
      [file, 3, 2],
    ]);
    expect(client.extractImages.mock.calls).toEqual([
      [[image(1), image(2)], [], 'invoice'],
      [[image(3)], [], 'invoice'],
    ]);
    expect(client.extractFromOcr).not.toHaveBeenCalled();
    expect(result.rawResponse).toMatchObject({
      inputMode: 'page_images',
      pageCount: 3,
    });
    expect(mapping).toBe(ocr);
  });

  it('fails clearly if PDF rendering is unavailable instead of silently using OCR text', async () => {
    const { service, client, paddle } = setup();
    paddle.renderPdf.mockRejectedValue(new Error('PDF rendering failed (404)'));
    await expect(
      service['extractPdf'](
        { documentId: 'doc', rawResponse: null } as never,
        file,
        client as DocumentExtractionClient,
        'invoice',
        [],
      ),
    ).rejects.toThrow('PDF rendering failed');
    expect(client.extractFromOcr).not.toHaveBeenCalled();
  });
});

describe('postgresUpdateRows', () => {
  it('unwraps TypeORM PostgreSQL UPDATE RETURNING results', () => {
    expect(postgresUpdateRows<{ id: string }>([[{ id: 'job-1' }], 1])).toEqual([
      { id: 'job-1' },
    ]);
  });

  it('does not mistake the affected count for a returned row', () => {
    expect(postgresUpdateRows([[], 0])).toEqual([]);
  });
});

describe('DocumentExtractionService.reviewQueue', () => {
  it('repairs a pending legacy bank response on read without rewriting the job or source', () => {
    const service = new DocumentExtractionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const job = {
      status: DocumentExtractionJobStatus.ReviewRequired,
      normalizedData: structuredClone(legacyBankData),
      rawResponse: { extractedData: structuredClone(legacyBankData) },
      validationIssues: [
        {
          code: 'SUPPLIER_MISSING',
          field: 'supplier.name',
          severity: 'ERROR',
          message: 'Old invoice-only error',
        },
      ],
    };
    const original = structuredClone(job);
    const response = service['response'](job as never);
    expect(response.normalizedData).toMatchObject({
      document_type: 'bank_statement',
      bank_statement: { closing_balance: 5224.8 },
    });
    expect(response.validationIssues).toEqual([]);
    expect(response.sourceData).toEqual(legacyBankData);
    expect(job).toEqual(original);
  });

  it.each([
    DocumentExtractionJobStatus.Approved,
    DocumentExtractionJobStatus.Rejected,
  ])('preserves historical %s responses', (status) => {
    const service = new DocumentExtractionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const response = service['response']({
      status,
      normalizedData: legacyBankData,
      validationIssues: [],
    } as never);
    expect(response.normalizedData).toEqual(legacyBankData);
  });

  it('only returns active documents that are still awaiting review', async () => {
    const jobs = {
      find: jest.fn().mockResolvedValue([]),
    };
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue({ id: 'dossier-1' }),
    };
    const service = new DocumentExtractionService(
      {} as never,
      {} as never,
      jobs as never,
      {} as never,
      {} as never,
      dossiers as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.reviewQueue('organization-1', 'dossier-1', 'user-1');

    expect(dossiers.getAccessibleEntity).toHaveBeenCalledWith(
      'organization-1',
      'dossier-1',
      'user-1',
    );
    expect(jobs.find).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        dossierId: 'dossier-1',
        status: DocumentExtractionJobStatus.ReviewRequired,
        document: {
          deletedAtUtc: IsNull(),
          extractionStatus: ExtractionStatus.ReviewRequired,
        },
      },
      relations: { document: true },
      order: { processedAtUtc: 'ASC' },
      take: 100,
    });
  });
});

describe('DocumentExtractionService.review', () => {
  const inconsistentInvoice = {
    document_type: 'invoice',
    supplier: { name: 'Supplier' },
    document_number: 'F-1',
    issue_date: '2026-09-22',
    subtotal_excl_tax: 100,
    tax_amount: 19,
    stamp_tax: 1,
    total_incl_tax: 150,
    amount_due: 150,
  };

  function setupReview() {
    const document = {
      id: 'document-1',
      organizationId: 'organization-1',
      dossierId: 'dossier-1',
      originalName: 'invoice.jpg',
      extractionStatus: ExtractionStatus.ReviewRequired,
      extractedData: null,
    };
    const job = {
      id: 'job-1',
      organizationId: 'organization-1',
      dossierId: 'dossier-1',
      documentId: 'document-1',
      status: DocumentExtractionJobStatus.ReviewRequired,
      normalizedData: inconsistentInvoice as Record<string, unknown>,
      validationIssues: [],
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({ save: jest.fn() }),
    };
    const documents = { findOneBy: jest.fn().mockResolvedValue(document) };
    const jobs = {
      findOneBy: jest.fn().mockResolvedValue(job),
      manager: {
        transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
          Promise.resolve(callback(manager)),
        ),
      },
    };
    type AuditEntry = {
      action: string;
      detailsJson: Record<string, unknown>;
      [key: string]: unknown;
    };
    const audits = {
      create: jest.fn((value: AuditEntry) => value),
      save: jest.fn(),
    };
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue({ id: 'dossier-1' }),
    };
    const bank = {
      importExtractedStatement: jest
        .fn()
        .mockResolvedValue({ id: 'statement-1' }),
    };
    const service = new DocumentExtractionService(
      {} as never,
      documents as never,
      jobs as never,
      audits as never,
      {} as never,
      dossiers as never,
      {} as never,
      {} as never,
      bank as never,
    );
    return { service, document, job, audits, bank };
  }

  it('approves a legacy bank response into the chosen account only after review', async () => {
    const { service, job, bank } = setupReview();
    job.normalizedData = structuredClone(legacyBankData);
    await service.review(
      'organization-1',
      'dossier-1',
      'document-1',
      'user-1',
      {
        decision: ExtractionReviewDecision.Approve,
        bankAccountId: 'bank-1',
      },
    );
    expect(bank.importExtractedStatement).toHaveBeenCalledTimes(1);
    expect(bank.importExtractedStatement).toHaveBeenCalledWith(
      'organization-1',
      'dossier-1',
      'user-1',
      'bank-1',
      'invoice.jpg',
      expect.objectContaining({ document_type: 'bank_statement' }),
    );
    expect(job.normalizedData.document_type).toBe('bank_statement');
    expect(job.status).toBe(DocumentExtractionJobStatus.Approved);
  });

  it('still requires a destination bank account for a repaired legacy response', async () => {
    const { service, job, bank } = setupReview();
    job.normalizedData = structuredClone(legacyBankData);
    await expect(
      service.review('organization-1', 'dossier-1', 'document-1', 'user-1', {
        decision: ExtractionReviewDecision.Approve,
      }),
    ).rejects.toThrow('Sélectionnez le compte bancaire');
    expect(bank.importExtractedStatement).not.toHaveBeenCalled();
  });

  it.each([
    { documentType: ['bank_statement', 'invoice'] },
    { documentType: 'unknown' },
    { documentType: null },
  ])(
    'cannot force-approve an ambiguous, unknown or missing document type %j',
    async ({ documentType }) => {
      const { service, bank } = setupReview();
      await expect(
        service.review('organization-1', 'dossier-1', 'document-1', 'user-1', {
          decision: ExtractionReviewDecision.Approve,
          correctedData: { ...legacyBankData, document_type: documentType },
          bankAccountId: 'bank-1',
          forceApprove: true,
        }),
      ).rejects.toThrow('Choisissez un seul type');
      expect(bank.importExtractedStatement).not.toHaveBeenCalled();
    },
  );

  it('keeps blocking validation errors blocked without an override', async () => {
    const { service } = setupReview();

    await expect(
      service.review('organization-1', 'dossier-1', 'document-1', 'user-1', {
        decision: ExtractionReviewDecision.Approve,
        correctedData: inconsistentInvoice,
      }),
    ).rejects.toThrow('Corrigez les incohérences bloquantes');
  });

  it('approves acknowledged errors and records the override in the audit log', async () => {
    const { service, document, job, audits } = setupReview();

    await service.review(
      'organization-1',
      'dossier-1',
      'document-1',
      'user-1',
      {
        decision: ExtractionReviewDecision.Approve,
        correctedData: inconsistentInvoice,
        forceApprove: true,
      },
    );

    expect(job.status).toBe(DocumentExtractionJobStatus.Approved);
    expect(document.extractionStatus).toBe(ExtractionStatus.Validated);
    const auditEntry = audits.create.mock.calls[0]?.[0];
    expect(auditEntry?.action).toBe('document.extraction.approved');
    expect(auditEntry?.detailsJson).toMatchObject({
      forcedApproval: true,
      remainingErrorCount: 1,
    });
  });
});
