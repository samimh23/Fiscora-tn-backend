import { IsNull } from 'typeorm';
import {
  DocumentExtractionJobStatus,
  ExtractionStatus,
} from '../../database/entities';
import {
  DocumentExtractionService,
  postgresUpdateRows,
} from './document-extraction.service';

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
