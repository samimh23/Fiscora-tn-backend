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
      {} as never,
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
    expect(result.items[0].scope).toBe('PRODUCT_HELP');
    expect(result.nextCursor).toEqual({
      beforeCreatedAt: new Date('2026-09-27T12:02:00.000Z'),
      beforeId: '00000000-0000-4000-8000-000000000002',
    });
  });
});

describe('AssistantService source-aware follow-ups', () => {
  const docId = '00000000-0000-4000-8000-000000000001';
  const documentCitation = {
    sourceId: docId,
    sourceName: 'approved-scan.png',
    chunkId: docId,
    kind: 'DOCUMENT',
  };
  const invoiceCitation = {
    sourceId: 'invoice',
    sourceName: 'Facture A-001',
    chunkId: 'live:invoice',
    kind: 'BUSINESS_INVOICE',
  };
  function setup() {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
    const embed = jest.fn().mockResolvedValue([0, 1]);
    const answer = jest
      .fn()
      .mockResolvedValue({ text: 'Tunis [S1]', model: 'gemini', usage: null });
    const routeLiveFinancialQuestion = jest.fn().mockResolvedValue({
      operation: 'INVOICE_DETAILS',
      invoiceNumber: 'A-001',
    });
    const liveAnswer = jest.fn().mockResolvedValue({
      answer: 'Solde actuel : 60.000 TND [S1]',
      citations: [invoiceCitation],
    });
    const service = new AssistantService(
      {
        get: jest.fn((name: string) =>
          name === 'AI_ASSISTANT_ENABLED'
            ? 'true'
            : name === 'VERTEX_AI_EMBEDDING_DIMENSIONS'
              ? '2'
              : undefined,
        ),
      } as never,
      { query } as never,
      { getAccessibleEntity: jest.fn().mockResolvedValue({}) } as never,
      { embed, answer, routeLiveFinancialQuestion } as never,
      {} as never,
      { answer: liveAnswer } as never,
    );
    return {
      service,
      query,
      embed,
      answer,
      routeLiveFinancialQuestion,
      liveAnswer,
    };
  }
  it('pins retrieval to the cited document and exposes a real page/excerpt/source target', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([
        { question: 'Describe the scan', citations: [documentCitation] },
      ])
      .mockResolvedValueOnce([
        {
          id: 'chunk',
          source_id: docId,
          source_name: 'approved-scan.png',
          page_number: null,
          content: 'Client: Test; Adresse: Tunis',
          metadata: { kind: 'PARTIES' },
          evidence: { 'customer.address': { status: 'MATCHED', page: 2 } },
          distance: 0.1,
          text_score: 1,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'What about its delivery address?',
      '2026-09-01T00:00:00Z',
    );
    expect(t.query.mock.calls[0][1]).toEqual([
      'org',
      'dossier',
      'user',
      '2026-09-01T00:00:00Z',
    ]);
    expect(t.query.mock.calls[1][1][4]).toBe(docId);
    expect(t.query.mock.calls[1][0]).toContain(
      'document.deleted_at_utc IS NULL',
    );
    expect(t.query.mock.calls[1][0]).toContain("job.status = 'VALIDEE'");
    expect(result).toMatchObject({
      scope: 'DOCUMENT',
      citations: [
        {
          sourceId: docId,
          pageNumber: 2,
          pages: [2],
          kind: 'DOCUMENT',
          excerpt: 'Client: Test; Adresse: Tunis',
        },
      ],
    });
    expect(result.citations[0].path).toContain(`documentId=${docId}`);
    const insert = t.query.mock.calls.at(-1)!;
    expect(insert[1][3]).toBe('What about its delivery address?');
    expect(insert[1][8]).toBeInstanceOf(Date);
    expect(t.routeLiveFinancialQuestion).not.toHaveBeenCalled();
  });
  it('resolves a live invoice follow-up then re-reads facts instead of recycling the previous amount', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([
        { question: 'And its VAT?', citations: [invoiceCitation] },
      ])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'And its remaining balance?',
    );
    expect(t.routeLiveFinancialQuestion).toHaveBeenCalledWith(
      expect.stringContaining('facture A-001'),
      undefined,
    );
    expect(t.liveAnswer).toHaveBeenCalledWith(
      'org',
      'dossier',
      'user',
      expect.objectContaining({ invoiceNumber: 'A-001' }),
    );
    expect(result.scope).toBe('LIVE_FINANCIAL');
    expect(result.answer).toContain('60.000');
    expect(t.embed).not.toHaveBeenCalled();
    expect(
      t.query.mock.calls.every(
        ([sql]) =>
          !/INSERT|UPDATE|DELETE/.test(sql) ||
          sql.includes('INSERT INTO accounting.ai_chat_turns'),
      ),
    ).toBe(true);
  });
  it('does not present an extracted amount as current settlement when no converted invoice exists', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([
        { question: 'Describe scan', citations: [documentCitation] },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'And its remaining balance?',
    );
    expect(result.scope).toBe('CLARIFICATION');
    expect(t.embed).not.toHaveBeenCalled();
    expect(t.query.mock.calls[1][1]).toEqual(['org', 'dossier', docId]);
  });
  it('re-checks live permissions after resolving a converted document and never falls back to RAG', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([
        { question: 'Describe scan', citations: [documentCitation] },
      ])
      .mockResolvedValueOnce([{ number: 'A-001' }]);
    t.liveAnswer.mockRejectedValue(new Error('permissions denied'));
    await expect(
      t.service.ask('org', 'dossier', 'user', 'And its payments?'),
    ).rejects.toThrow('permissions denied');
    expect(t.embed).not.toHaveBeenCalled();
    expect(t.query).toHaveBeenCalledTimes(2);
  });
  it('asks a clarification without retrieval when the conversation has no unique source', async () => {
    const t = setup();
    t.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'And its VAT?',
    );
    expect(result.scope).toBe('CLARIFICATION');
    expect(t.embed).not.toHaveBeenCalled();
    expect(t.liveAnswer).not.toHaveBeenCalled();
  });
  it('does not let an uncertain invoice follow-up become a global total or a document guess', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([
        { question: 'invoice A-001', citations: [invoiceCitation] },
      ])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    t.routeLiveFinancialQuestion.mockResolvedValueOnce({
      operation: 'NONE',
      invoiceNumber: null,
    });
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'And its VAT?',
    );
    expect(result.scope).toBe('CLARIFICATION');
    expect(t.embed).not.toHaveBeenCalled();
    expect(t.liveAnswer).not.toHaveBeenCalled();
    expect(t.query).toHaveBeenCalledTimes(2);
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
            supplier: { name: 'Supplier SARL', tax_id: 'MF 123/A' },
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

describe('AssistantService live financial integration', () => {
  function setup() {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValue([{ id: 'turn' }]);
    const getAccessibleEntity = jest.fn().mockResolvedValue({ id: 'dossier' });
    const routeLiveFinancialQuestion = jest.fn().mockResolvedValue({
      operation: 'BALANCES',
      partyName: 'MYTEK',
      partyType: 'SUPPLIER',
      invoiceNumber: null,
      paymentReference: null,
      year: null,
      unsupportedPeriod: false,
    });
    const embed = jest.fn();
    const answerProductHelp = jest.fn();
    const liveAnswer = jest.fn().mockResolvedValue({
      answer: 'À payer : 60.000 TND [S1]',
      citations: [
        {
          label: 'S1',
          chunkId: 'live:invoice',
          sourceId: 'invoice',
          sourceName: 'Facture A-001',
          pageNumber: null,
          kind: 'BUSINESS_INVOICE',
          path: '/factures?dossierId=dossier',
        },
      ],
    });
    const memberships = {
      findOne: jest.fn().mockResolvedValue({
        organization: { isActive: true },
        role: {
          rolePermissions: [{ permissionName: 'business_invoices.view' }],
        },
      }),
    };
    const service = new AssistantService(
      {
        get: jest.fn((name: string) =>
          name === 'AI_ASSISTANT_ENABLED' ? 'true' : undefined,
        ),
      } as never,
      { query } as never,
      { getAccessibleEntity } as never,
      { routeLiveFinancialQuestion, embed, answerProductHelp } as never,
      memberships as never,
      { answer: liveAnswer } as never,
    );
    return {
      service,
      query,
      routeLiveFinancialQuestion,
      embed,
      answerProductHelp,
      liveAnswer,
    };
  }
  it('routes how-much questions before app guides and saves source-linked history', async () => {
    const test = setup();
    const result = await test.service.askContextual(
      'org',
      'user',
      'How much do we owe MYTEK?',
      '/factures',
      'dossier',
    );
    expect(result).toMatchObject({
      id: 'turn',
      scope: 'LIVE_FINANCIAL',
      model: 'live-financial-readonly-v1',
    });
    expect(test.liveAnswer).toHaveBeenCalledWith(
      'org',
      'dossier',
      'user',
      expect.objectContaining({ operation: 'BALANCES' }),
    );
    expect(test.embed).not.toHaveBeenCalled();
    expect(test.answerProductHelp).not.toHaveBeenCalled();
    expect(test.query.mock.calls[0][0]).toContain(
      'INSERT INTO accounting.ai_chat_turns',
    );
    expect(test.query.mock.calls[0][1].slice(0, 3)).toEqual([
      'org',
      'dossier',
      'user',
    ]);
  });
  it('does not fall back to document guesses after a live-tool permission error', async () => {
    const test = setup();
    test.liveAnswer.mockRejectedValue(new Error('permissions denied'));
    await expect(
      test.service.ask('org', 'dossier', 'user', 'How much do we owe MYTEK?'),
    ).rejects.toThrow('permissions denied');
    expect(test.embed).not.toHaveBeenCalled();
    expect(test.query).not.toHaveBeenCalled();
  });
  it('interprets a short clarification using only this user/dossier conversation', async () => {
    const test = setup();
    test.query
      .mockResolvedValueOnce([
        { question: 'Financial summary', answer: 'Pour quel exercice ?' },
      ])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    test.routeLiveFinancialQuestion.mockResolvedValueOnce({
      operation: 'FINANCIAL_SUMMARY',
      partyName: null,
      partyType: 'ANY',
      invoiceNumber: null,
      paymentReference: null,
      year: 2026,
      unsupportedPeriod: false,
    });
    await test.service.ask(
      'org',
      'dossier',
      'user',
      '2026',
      '2026-09-30T00:00:00Z',
    );
    expect(test.query.mock.calls[0][1]).toEqual([
      'org',
      'dossier',
      'user',
      '2026-09-30T00:00:00Z',
    ]);
    expect(test.routeLiveFinancialQuestion).toHaveBeenCalledWith(
      '2026',
      expect.stringContaining('Pour quel exercice'),
    );
    expect(test.liveAnswer).toHaveBeenCalledWith(
      'org',
      'dossier',
      'user',
      expect.objectContaining({ year: 2026 }),
    );
  });
  it('does not answer a supplier-filtered total with an unfiltered dossier sum', async () => {
    const test = setup();
    test.routeLiveFinancialQuestion.mockResolvedValueOnce({
      operation: 'NONE',
      partyName: 'MYTEK',
      partyType: 'SUPPLIER',
      invoiceNumber: null,
      paymentReference: null,
      year: null,
      unsupportedPeriod: false,
    });
    const result = await test.service.ask(
      'org',
      'dossier',
      'user',
      'Quel est le total TTC du fournisseur MYTEK ?',
    );
    expect(result.answer).toContain('totaux filtrés par tiers');
    expect(test.embed).not.toHaveBeenCalled();
    expect(test.liveAnswer).not.toHaveBeenCalled();
    expect(test.query).toHaveBeenCalledTimes(1);
  });
  it('preserves the exact calculator without an AI-routing call for ordinary totals', async () => {
    const test = setup();
    test.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'i',
          number: 'I-1',
          invoice_date: '2026-09-01',
          kind: 'FACTURE',
          currency_code: 'TND',
          net_amount: '100.000',
          vat_amount: '19.000',
          fodec_amount: '0.000',
          stamp_duty: '1.000',
          gross_amount: '120.000',
          net_payable: '120.000',
          source_document_id: null,
        },
      ])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await test.service.ask(
      'org',
      'dossier',
      'user',
      'Quel est le total TTC pour 2026 ?',
    );
    expect(result.answer).toContain('120.000 TND');
    expect(test.routeLiveFinancialQuestion).not.toHaveBeenCalled();
    expect(test.liveAnswer).not.toHaveBeenCalled();
  });
});
