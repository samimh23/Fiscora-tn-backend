import {
  evaluateRagCase,
  looksLikeRefusal,
  summarizeRagEvaluation,
} from './rag-evaluation';

describe('RAG evaluation', () => {
  it('fails a correct-looking amount with the wrong source, route or citation label', () => {
    const result = evaluateRagCase(
      {
        id: 'wrong-source',
        question: 'What is its balance?',
        expectedNumbers: ['60.000'],
        expectedSourceIds: ['invoice-A'],
        allowedSourceIds: ['invoice-A'],
        expectedScope: 'LIVE_FINANCIAL',
        requireInlineCitations: true,
      },
      {
        answer: '60.000 TND [S9]',
        scope: 'DOCUMENT',
        citations: [{ sourceId: 'invoice-B', label: 'S1' }],
      },
    );
    expect(result.passed).toBe(false);
    expect(result.numberRecall).toBe(1);
    expect(result.sourceRecall).toBe(0);
    expect(result.validInlineCitations).toBe(false);
    expect(result.scopeCorrect).toBe(false);
    expect(result.failures).toHaveLength(4);
  });
  it('rejects forbidden claims/amounts and does not accept a number as a substring', () => {
    const result = evaluateRagCase(
      {
        id: 'wrong-number',
        question: 'Amount?',
        expectedNumbers: ['100.000'],
        forbiddenNumbers: ['1100.000'],
        forbiddenTerms: ['automatically posted'],
      },
      { answer: 'Automatically posted 1100.000 TND.', citations: [] },
    );
    expect(result.numberRecall).toBe(0);
    expect(result.failures).toHaveLength(3);
  });
  it('passes an explicitly scoped and source-constrained answer', () => {
    expect(
      evaluateRagCase(
        {
          id: 'followup',
          question: 'And its balance?',
          expectedNumbers: ['60.000'],
          expectedSourceIds: ['invoice-A'],
          allowedSourceIds: ['invoice-A'],
          expectedScope: 'LIVE_FINANCIAL',
          requireInlineCitations: true,
        },
        {
          answer: '60.000 TND [S1]',
          scope: 'LIVE_FINANCIAL',
          citations: [{ sourceId: 'invoice-A', label: 'S1' }],
        },
      ).passed,
    ).toBe(true);
  });
  it('accepts sentence punctuation after a complete expected number', () => {
    expect(
      evaluateRagCase(
        {
          id: 'punctuation',
          question: 'Amount?',
          expectedNumbers: ['100.000'],
        },
        { answer: '100.000.', citations: [] },
      ).passed,
    ).toBe(true);
  });
  it('measures required terms, exact numbers and citations', () => {
    const result = evaluateRagCase(
      {
        id: 'ttc-1',
        question: 'Total TTC ?',
        expectedTerms: ['total TTC'],
        expectedNumbers: ['120.000'],
        requireCitations: true,
      },
      {
        answer: 'Le total TTC est de 120.000 TND [S1].',
        citations: [{ sourceId: 'doc-1' }],
      },
    );
    expect(result.passed).toBe(true);
    expect(summarizeRagEvaluation([result])).toMatchObject({ passRate: 1 });
  });
  it('reads French number formatting without accepting other amounts', () => {
    const check = (answer: string) =>
      evaluateRagCase(
        { id: 'fr', question: 'Total?', expectedNumbers: ['1190.500'] },
        { answer, citations: [] },
      ).numberRecall;
    expect(check('Le total est de 1 190,500 TND.')).toBe(1);
    expect(check('Le total est de 1 190,5 TND.')).toBe(1);
    expect(check('Le total est de 1190.50 TND.')).toBe(0);
    expect(check('Le total est de 11190.500 TND.')).toBe(0);
  });
  it('accepts any variant of an expected term', () => {
    expect(
      evaluateRagCase(
        {
          id: 'date',
          question: 'Date?',
          expectedTerms: [['2026-03-11', '11 mars 2026']],
        },
        { answer: 'Émis le 11 mars 2026 [S1].', citations: [] },
      ).termRecall,
    ).toBe(1);
  });
  it('scores retrieval by document name, all-of and any-of', () => {
    const result = evaluateRagCase(
      {
        id: 'names',
        question: 'Quels documents ?',
        expectedSourceNames: ['a.pdf', 'b.pdf'],
        anyOfSourceNames: ['c.pdf', 'd.pdf'],
      },
      {
        answer: 'Voir [S1] [S2].',
        citations: [
          { sourceId: '1', label: 'S1', sourceName: 'A.pdf' },
          { sourceId: '2', label: 'S2', sourceName: 'd.pdf' },
        ],
      },
    );
    expect(result.sourceNameRecall).toBeCloseTo(2 / 3);
    expect(result.failures).toContain('Expected document not retrieved');
  });
  it('checks refusal cases both ways', () => {
    const refusal = { id: 'r', question: 'Loyer ?', expectRefusal: true };
    expect(
      evaluateRagCase(refusal, { answer: '', citations: [], refused: true })
        .passed,
    ).toBe(true);
    expect(
      evaluateRagCase(refusal, {
        answer: 'Le loyer est 900 TND.',
        citations: [],
      }).failures,
    ).toEqual(['Answered a question that has no grounded answer']);
    expect(
      evaluateRagCase(
        { id: 'g', question: 'Date ?', expectedTerms: ['2026'] },
        { answer: '', citations: [], refused: true },
      ).failures,
    ).toEqual(['Refused a question that has a grounded answer']);
  });
  it('recognises the usual French ways of declining', () => {
    expect(
      looksLikeRefusal(
        'Les sources validées ne permettent pas de répondre à cette question.',
      ),
    ).toBe(true);
    expect(
      looksLikeRefusal(
        'Cette information n’est pas mentionnée dans les sources.',
      ),
    ).toBe(true);
    expect(looksLikeRefusal('Le total TTC est de 120.000 TND [S1].')).toBe(
      false,
    );
  });
  it('summarises retrieval, refusal, latency and categories', () => {
    const answered = evaluateRagCase(
      {
        id: 'a',
        question: 'Date ?',
        category: 'exact_reference',
        expectedSourceNames: ['a.pdf'],
      },
      {
        answer: 'Le 1er mars [S1].',
        citations: [{ sourceId: '1', label: 'S1', sourceName: 'a.pdf' }],
        latencyMs: 100,
      },
    );
    const refused = evaluateRagCase(
      {
        id: 'b',
        question: 'Loyer ?',
        category: 'refusal',
        expectRefusal: true,
      },
      { answer: 'Le loyer est 900.', citations: [], latencyMs: 300 },
    );
    expect(summarizeRagEvaluation([answered, refused])).toMatchObject({
      cases: 2,
      passRate: 0.5,
      retrievalRecall: 1,
      refusalAccuracy: 0,
      latencyP50Ms: 100,
      latencyP95Ms: 300,
      byCategory: {
        exact_reference: { cases: 1, passRate: 1 },
        refusal: { cases: 1, passRate: 0 },
      },
    });
  });
});
