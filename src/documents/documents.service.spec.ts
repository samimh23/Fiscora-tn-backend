import {
  AccountingDocument,
  DocumentExtractionJob,
  DocumentExtractionJobStatus,
} from '../database/entities';
import { DocumentsService } from './documents.service';

describe('DocumentsService.remove', () => {
  it('closes an active extraction job when its document is deleted', async () => {
    const document = {
      id: 'document-1',
      organizationId: 'organization-1',
      dossierId: 'dossier-1',
      uploadedByUserId: 'user-1',
      deletedAtUtc: null,
    };
    const documentRepository = {
      findOneBy: jest.fn().mockResolvedValue(document),
      save: jest.fn().mockResolvedValue(document),
    };
    const extractionRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown): unknown =>
        entity === AccountingDocument
          ? documentRepository
          : entity === DocumentExtractionJob
            ? extractionRepository
            : undefined,
      ),
    };
    const documents = {
      ...documentRepository,
      manager: {
        transaction: jest.fn(
          (work: (transactionManager: typeof manager) => Promise<unknown>) =>
            work(manager),
        ),
      },
    };
    const audits = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn((value: Record<string, unknown>) => Promise.resolve(value)),
    };
    const memberships = {
      findOne: jest.fn().mockResolvedValue({
        role: { normalizedName: 'PROPRIETAIRE' },
      }),
    };
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue({ id: 'dossier-1' }),
    };
    const service = new DocumentsService(
      {} as never,
      documents as never,
      {} as never,
      audits as never,
      memberships as never,
      {} as never,
      dossiers as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.remove('organization-1', 'dossier-1', 'document-1', 'user-1'),
    ).resolves.toEqual({ deleted: true });

    expect(document.deletedAtUtc).toBeInstanceOf(Date);
    expect(extractionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'document-1' }),
      expect.objectContaining({
        status: DocumentExtractionJobStatus.Rejected,
        reviewedByUserId: 'user-1',
      }),
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document.deleted',
        detailsJson: {
          dossierId: 'dossier-1',
          closedExtractionJobs: 1,
        },
      }),
    );
  });
});
