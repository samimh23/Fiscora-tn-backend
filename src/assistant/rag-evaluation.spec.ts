import { evaluateRagCase, summarizeRagEvaluation } from './rag-evaluation';

describe('RAG evaluation', () => {
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
