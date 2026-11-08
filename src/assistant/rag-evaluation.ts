export interface RagEvaluationCase {
  id: string;
  question: string;
  expectedTerms?: string[];
  expectedNumbers?: string[];
  requireCitations?: boolean;
  requireInlineCitations?: boolean;
  expectedSourceIds?: string[];
  allowedSourceIds?: string[];
  forbiddenTerms?: string[];
  forbiddenNumbers?: string[];
  expectedScope?: string;
  setupQuestions?: string[];
}

export interface RagEvaluationAnswer {
  answer: string;
  citations: Array<{ sourceId: string; label?: string }>;
  scope?: string;
}

export interface RagCaseResult {
  id: string;
  passed: boolean;
  termRecall: number;
  numberRecall: number;
  hasRequiredCitations: boolean;
  sourceRecall: number;
  validInlineCitations: boolean;
  scopeCorrect: boolean;
  failures: string[];
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

function containsNumber(answer: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.,])${escaped}(?!\\d|[.,]\\d)`).test(answer);
}

export function evaluateRagCase(
  testCase: RagEvaluationCase,
  result: RagEvaluationAnswer,
): RagCaseResult {
  const termRecall = recall(testCase.expectedTerms ?? [], result.answer);
  const numbers = testCase.expectedNumbers ?? [];
  const numberRecall = numbers.length
    ? numbers.filter((value) => containsNumber(result.answer, value)).length /
      numbers.length
    : 1;
  const hasRequiredCitations =
    !testCase.requireCitations || result.citations.length > 0;
  const sourceIds = new Set(
    result.citations.map((citation) => citation.sourceId),
  );
  const expectedSources = testCase.expectedSourceIds ?? [];
  const sourceRecall = expectedSources.length
    ? expectedSources.filter((id) => sourceIds.has(id)).length /
      expectedSources.length
    : 1;
  const inlineLabels = [...result.answer.matchAll(/\[(S\d+)\]/g)].map(
    (match) => match[1],
  );
  const suppliedLabels = new Set(
    result.citations.map((citation) => citation.label),
  );
  const validInlineCitations =
    !testCase.requireInlineCitations ||
    (inlineLabels.length > 0 &&
      inlineLabels.every((label) => suppliedLabels.has(label)));
  const scopeCorrect =
    !testCase.expectedScope || result.scope === testCase.expectedScope;
  const failures: string[] = [];
  if (termRecall !== 1) failures.push('Missing expected terms');
  if (numberRecall !== 1) failures.push('Missing exact expected numbers');
  if (!hasRequiredCitations) failures.push('Missing citations');
  if (sourceRecall !== 1) failures.push('Missing expected source IDs');
  if (!validInlineCitations)
    failures.push('Missing or unknown inline citation labels');
  if (!scopeCorrect)
    failures.push(`Wrong answer scope: ${result.scope ?? 'absent'}`);
  if (
    testCase.allowedSourceIds &&
    [...sourceIds].some((id) => !testCase.allowedSourceIds!.includes(id))
  )
    failures.push('Unexpected source IDs');
  if (
    (testCase.forbiddenTerms ?? []).some((term) =>
      normalized(result.answer).includes(normalized(term)),
    )
  )
    failures.push('Forbidden claim present');
  if (
    (testCase.forbiddenNumbers ?? []).some((number) =>
      containsNumber(result.answer, number),
    )
  )
    failures.push('Forbidden number present');
  return {
    id: testCase.id,
    passed: failures.length === 0,
    termRecall,
    numberRecall,
    hasRequiredCitations,
    sourceRecall,
    validInlineCitations,
    scopeCorrect,
    failures,
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
    averageSourceRecall: sum(results.map((result) => result.sourceRecall)),
    scopeAccuracy: sum(results.map((result) => (result.scopeCorrect ? 1 : 0))),
    citationCoverage: sum(
      results.map((result) => (result.hasRequiredCitations ? 1 : 0)),
    ),
  };
}
