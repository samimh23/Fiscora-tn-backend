export interface RagEvaluationCase {
  id: string;
  question: string;
  expectedTerms?: string[];
  expectedNumbers?: string[];
  requireCitations?: boolean;
}

export interface RagEvaluationAnswer {
  answer: string;
  citations: Array<{ sourceId: string }>;
}

export interface RagCaseResult {
  id: string;
  passed: boolean;
  termRecall: number;
  numberRecall: number;
  hasRequiredCitations: boolean;
}

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, ' ');
}

function recall(expected: string[], answer: string) {
  if (!expected.length) return 1;
  const haystack = normalized(answer);
  const matches = expected.filter((value) =>
    haystack.includes(normalized(value)),
  );
  return matches.length / expected.length;
}

export function evaluateRagCase(
  testCase: RagEvaluationCase,
  result: RagEvaluationAnswer,
): RagCaseResult {
  const termRecall = recall(testCase.expectedTerms ?? [], result.answer);
  const numberRecall = recall(testCase.expectedNumbers ?? [], result.answer);
  const hasRequiredCitations =
    !testCase.requireCitations || result.citations.length > 0;
  return {
    id: testCase.id,
    passed: termRecall === 1 && numberRecall === 1 && hasRequiredCitations,
    termRecall,
    numberRecall,
    hasRequiredCitations,
  };
}

export function summarizeRagEvaluation(results: RagCaseResult[]) {
  const count = results.length;
  const sum = (values: number[]) =>
    count ? values.reduce((total, value) => total + value, 0) / count : 0;
  return {
    cases: count,
    passRate: sum(results.map((result) => (result.passed ? 1 : 0))),
    averageTermRecall: sum(results.map((result) => result.termRecall)),
    averageNumberRecall: sum(results.map((result) => result.numberRecall)),
    citationCoverage: sum(
      results.map((result) => (result.hasRequiredCitations ? 1 : 0)),
    ),
  };
}
