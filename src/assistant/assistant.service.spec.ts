import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { OrganizationMembership } from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { AssistantService } from './assistant.service';
import { VertexAiClient } from './vertex-ai.client';
import { aggregateFinancialQuestion } from './financial-question';

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

describe('AssistantService financial source deduplication', () => {
  it('produces a single invoice total and keeps both queries dossier-scoped', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([
        {
          document_id: 'pdf',
          original_name: 'invoice.pdf',
          category: 'Facture',
          period_year: 2026,
          period_month: 9,
          normalized_data: {
            document_type: 'invoice',
            document_number: 'INV-001',
            issue_date: '2026-09-01',
            currency: 'TND',
            total_incl_tax: '119.000',
            supplier: { name: 'Supplier SARL', tax_id: '123/A' },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'invoice',
          number: 'INV-001',
          invoice_date: '2026-09-01',
          kind: 'FACTURE',
          type: 'ACHAT',
          third_party_name: 'Supplier SARL',
          third_party_tax_identifier: '123/A',
          currency_code: 'TND',
          net_amount: '100.000',
          vat_amount: '19.000',
          stamp_duty: '0.000',
          gross_amount: '119.000',
          net_payable: '119.000',
          source_document_id: null,
        },
      ]);
    const service = new AssistantService(
      { get: jest.fn() } as never,
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const sources = await service['financialSources']('org', 'dossier');
    expect(sources).toHaveLength(1);
    expect(sources[0].source_kind).toBe('BUSINESS_INVOICE');
    expect(
      aggregateFinancialQuestion(sources, {
        operation: 'SUM',
        field: 'total_incl_tax',
        label: 'total TTC',
        year: 2026,
        month: 9,
      })?.answer,
    ).toContain('119.000 TND');
    expect(query.mock.calls[0][1]).toEqual(['org', 'dossier', null]);
    expect(query.mock.calls[1][1]).toEqual(['org', 'dossier']);
    expect(query.mock.calls[1][0]).toContain(
      'invoice_date::text AS invoice_date',
    );
    expect(query.mock.calls[1][0]).toContain(
      "status IN ('VALIDEE', 'COMPTABILISEE')",
    );
  });
});
