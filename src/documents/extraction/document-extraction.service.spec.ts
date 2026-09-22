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
      normalizedData: inconsistentInvoice,
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
    const service = new DocumentExtractionService(
      {} as never,
      documents as never,
      jobs as never,
      audits as never,
      {} as never,
      dossiers as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, document, job, audits };
  }

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
