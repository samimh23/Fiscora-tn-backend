import { AssistantService } from './assistant.service';
import type { AssistantReranker } from './reranker';

describe('AssistantService document retrieval', () => {
  const chunk = (id: string, sourceId: string, extra = {}) => ({
    id,
    source_id: sourceId,
    source_name: `${sourceId}.pdf`,
    page_number: null,
    content: `Contenu ${id}`,
    metadata: {},
    distance: 0.2,
    text_score: 0.1,
    code_score: 0,
    fuzzy_score: 0,
    relevance_score: 0.03,
    ...extra,
  });

  function setup(reranker?: Partial<AssistantReranker>) {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
    const embed = jest.fn().mockResolvedValue([0, 1]);
    const answer = jest.fn().mockResolvedValue({
      text: 'Réponse [S1]',
      model: 'gemini',
      usage: null,
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
      { embed, answer, routeLiveFinancialQuestion: jest.fn() } as never,
      {} as never,
      { answer: jest.fn() } as never,
      reranker as AssistantReranker | undefined,
    );
    return { service, query, embed, answer };
  }

  it('reads a named document instead of summing the whole dossier', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([chunk('c1', 'doc-a')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'Quel est le total TTC du document FV-2026-013 ?',
    );
    expect(result.scope).toBe('DOCUMENT');
    const [sql, params] = t.query.mock.calls[0];
    expect(sql).toContain('search_vector_fr');
    expect(sql).toContain('word_similarity');
    expect(params[5]).toEqual(['FV-2026-013']);
    // No period or category filter is read from the reference itself.
    expect(params.slice(7, 10)).toEqual([null, null, null]);
  });

  it('searches with soft filters, then the whole dossier when they match nothing', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunk('c1', 'doc-a')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    await t.service.ask(
      'org',
      'dossier',
      'user',
      'Quelle remise sur les ventes de février 2026 ?',
    );
    expect(t.query.mock.calls[0][1].slice(7, 10)).toEqual([
      2026,
      2,
      'FACTURES_VENTES',
    ]);
    expect(t.query.mock.calls[1][1].slice(7, 10)).toEqual([null, null, null]);
  });

  it('declines when nothing is close in meaning or in words', async () => {
    const t = setup();
    t.query.mockResolvedValueOnce([
      chunk('c1', 'doc-a', { distance: 0.95, text_score: 0 }),
    ]);
    await expect(
      t.service.ask('org', 'dossier', 'user', 'Qui a gagné le match ?'),
    ).rejects.toThrow('ne permettent pas de répondre');
  });

  it('uses the reranker order and keeps at most three chunks per document', async () => {
    const longDocument = Array.from({ length: 8 }, (_, index) =>
      chunk(`a${index + 1}`, 'doc-a'),
    );
    const rerank = jest.fn().mockResolvedValue([
      { id: 'b1', score: 0.9 },
      ...longDocument.map((item, index) => ({
        id: item.id,
        score: 0.8 - index / 100,
      })),
      { id: 'c1', score: 0.1 },
    ]);
    const t = setup({ rerank });
    t.query
      .mockResolvedValueOnce([
        ...longDocument,
        chunk('b1', 'doc-b'),
        chunk('c1', 'doc-c'),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'Quel est le prix unitaire des pneus ?',
    );
    expect(rerank).toHaveBeenCalledWith(
      'Quel est le prix unitaire des pneus ?',
      expect.arrayContaining([
        { id: 'a1', title: 'doc-a.pdf', content: 'Contenu a1' },
      ]),
      10,
    );
    // Without the cap, doc-a would fill every slot after b1 and push c1 out.
    expect(result.citations.map((citation) => citation.chunkId)).toEqual([
      'b1',
      'a1',
      'a2',
      'a3',
      'a4',
      'a5',
      'a6',
      'c1',
    ]);
    const [, context] = t.answer.mock.calls[0] as [string, string];
    expect(context).toMatch(/^\[S1\] doc-b\.pdf/);
  });

  it('keeps the hybrid order when the reranker gives up', async () => {
    const t = setup({ rerank: jest.fn().mockResolvedValue(null) });
    t.query
      .mockResolvedValueOnce([chunk('a1', 'doc-a'), chunk('b1', 'doc-b')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'Quel est le prix unitaire des pneus ?',
    );
    expect(result.citations.map((citation) => citation.chunkId)).toEqual([
      'a1',
      'b1',
    ]);
  });

  it('reads the whole document when it dominates the top results', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([
        chunk('a1', 'doc-a'),
        chunk('a2', 'doc-a'),
        chunk('b1', 'doc-b'),
        chunk('c1', 'doc-c'),
      ])
      .mockResolvedValueOnce([
        chunk('a1', 'doc-a'),
        chunk('a2', 'doc-a'),
        chunk('a3', 'doc-a'),
        chunk('a4', 'doc-a'),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'Pourquoi cet avoir a-t-il été émis ?',
    );
    expect(t.query.mock.calls[1][0]).toContain('ORDER BY chunk.chunk_index');
    expect(t.query.mock.calls[1][1]).toEqual(['org', 'dossier', 'doc-a', 6]);
    expect(result.citations.map((citation) => citation.chunkId)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
      'b1',
      'c1',
    ]);
  });

  it('reads the file the user names and answers in their language', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([
        { id: 'doc-5', original_name: 'test5.png' },
        { id: 'doc-2', original_name: 'test2.jpg' },
      ])
      .mockResolvedValueOnce([chunk('c1', 'doc-5')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    await t.service.ask('org', 'dossier', 'user', 'how much vat for test 5');
    // The search is pinned to that document.
    expect(t.query.mock.calls[1][1][4]).toBe('doc-5');
    expect(t.answer).toHaveBeenCalledWith(
      expect.stringContaining('Document concerné : test5.png'),
      expect.any(String),
      undefined,
      'en',
    );
  });

  it('says so when the named file does not exist instead of guessing', async () => {
    const t = setup();
    t.query
      .mockResolvedValueOnce([
        { id: 'doc-5', original_name: 'test5.png' },
        { id: 'doc-2', original_name: 'test2.jpg' },
      ])
      .mockResolvedValueOnce([{ id: 'turn' }]);
    const result = await t.service.ask(
      'org',
      'dossier',
      'user',
      'how much vat for test 1',
    );
    expect(result).toMatchObject({ scope: 'CLARIFICATION' });
    expect(result.answer).toContain('No validated document named "test 1"');
    expect(result.answer).toContain('test5.png');
    expect(t.embed).not.toHaveBeenCalled();
  });

  it('stores feedback only on the user’s own answer', async () => {
    const t = setup();
    t.query.mockResolvedValueOnce([{ id: 'turn-1' }]);
    await expect(
      t.service.rateTurn('org', 'user', 'turn-1', -1, ' wrong VAT '),
    ).resolves.toEqual({
      id: 'turn-1',
      feedback: { rating: -1, comment: 'wrong VAT' },
    });
    expect(t.query.mock.calls[0][0]).toContain('AND user_id = $3');
    expect(t.query.mock.calls[0][1]).toEqual([
      'turn-1',
      'org',
      'user',
      -1,
      'wrong VAT',
    ]);
    t.query.mockResolvedValueOnce([]);
    await expect(
      t.service.rateTurn('org', 'other-user', 'turn-1', 1),
    ).rejects.toThrow('Réponse introuvable');
  });
});
