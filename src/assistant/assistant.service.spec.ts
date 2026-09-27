import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { OrganizationMembership } from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { AssistantService } from './assistant.service';
import { VertexAiClient } from './vertex-ai.client';

describe('AssistantService history', () => {
  it('returns a user-scoped chronological page with an older cursor', async () => {
    const rows = [
      {
        id: '00000000-0000-4000-8000-000000000003',
        created_at_utc: new Date('2026-09-27T12:03:00.000Z'),
        question: 'Newest question',
        answer: 'Newest answer',
        citations: [],
        model_name: 'model',
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        created_at_utc: new Date('2026-09-27T12:02:00.000Z'),
        question: 'Middle question',
        answer: 'Middle answer',
        citations: [
          {
            label: 'S1',
            chunkId: 'product-help:test',
            sourceId: 'test',
            sourceName: 'Test guide',
            pageNumber: null,
            kind: 'PRODUCT_HELP' as const,
            path: '/documents',
          },
        ],
        model_name: 'model',
      },
      {
        id: '00000000-0000-4000-8000-000000000001',
        created_at_utc: new Date('2026-09-27T12:01:00.000Z'),
        question: 'Oldest question',
        answer: 'Oldest answer',
        citations: [],
        model_name: 'model',
      },
    ];
    const query = jest.fn().mockResolvedValue(rows);
    const getAccessibleEntity = jest.fn().mockResolvedValue({ id: 'dossier' });
    const config = {
      get: jest.fn((name: string) =>
        name === 'AI_ASSISTANT_ENABLED' ? 'true' : undefined,
      ),
    } as unknown as ConfigService;
    const dataSource = { query } as unknown as DataSource;
    const dossiers = {
      getAccessibleEntity,
    } as unknown as DossiersService;
    const service = new AssistantService(
      config,
      dataSource,
      dossiers,
      {} as VertexAiClient,
      {} as Repository<OrganizationMembership>,
    );

    const result = await service.history('organization', 'dossier', 'user', {
      limit: 2,
      after: '2026-09-01T00:00:00.000Z',
    });

    expect(getAccessibleEntity).toHaveBeenCalledWith(
      'organization',
      'dossier',
      'user',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND user_id = $3'),
      [
        'organization',
        'dossier',
        'user',
        '2026-09-01T00:00:00.000Z',
        null,
        null,
        3,
      ],
    );
    expect(result.items.map((item) => item.question)).toEqual([
      'Middle question',
      'Newest question',
    ]);
    expect(result.items[0].actions).toEqual([
      { label: 'Ouvrir « Test guide »', path: '/documents' },
    ]);
    expect(result.nextCursor).toEqual({
      beforeCreatedAt: new Date('2026-09-27T12:02:00.000Z'),
      beforeId: '00000000-0000-4000-8000-000000000002',
    });
  });
});
