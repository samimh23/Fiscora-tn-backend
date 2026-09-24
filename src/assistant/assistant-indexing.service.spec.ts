import { AssistantIndexingService } from './assistant-indexing.service';

describe('AssistantIndexingService', () => {
  const job = {
    id: 'index-job-1',
    organizationId: 'organization-1',
    dossierId: 'dossier-1',
    documentId: 'document-1',
    operation: 'INDEX' as const,
    attemptCount: 1,
  };

  function setup(indexDocument: jest.Mock = jest.fn().mockResolvedValue({})) {
    const config = {
      get: jest.fn((key: string, fallback: unknown) =>
        key === 'AI_ASSISTANT_ENABLED' ? 'true' : fallback,
      ),
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([job])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const assistant = {
      indexDocument,
      removeDocumentFromIndex: jest.fn().mockResolvedValue({}),
    };
    const service = new AssistantIndexingService(
      config as never,
      dataSource as never,
      assistant as never,
    );
    return { service, dataSource, assistant };
  }

  it('indexes a claimed job and records successful completion', async () => {
    const { service, dataSource, assistant } = setup();

    await service.work();

    expect(assistant.indexDocument).toHaveBeenCalledWith(
      job.organizationId,
      job.dossierId,
      job.documentId,
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'INDEXED'"),
      expect.arrayContaining([job.id]),
    );
  });

  it('schedules a retry without throwing when embedding fails', async () => {
    const indexDocument = jest
      .fn()
      .mockRejectedValue(new Error('Vertex unavailable'));
    const { service, dataSource } = setup(indexDocument);

    await expect(service.work()).resolves.toBeUndefined();

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('available_at_utc'),
      expect.arrayContaining([
        job.id,
        expect.any(String),
        'PENDING',
        1,
        'Vertex unavailable',
      ]),
    );
  });
});
