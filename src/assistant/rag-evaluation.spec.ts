import { evaluateRagCase, summarizeRagEvaluation } from './rag-evaluation';

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
});
