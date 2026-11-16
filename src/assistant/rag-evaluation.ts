export interface RagEvaluationCase {
  id: string;
  question: string;
  /** Each entry must appear; an array entry is satisfied by any of its variants. */
  expectedTerms?: Array<string | string[]>;
  expectedNumbers?: string[];
  requireCitations?: boolean;
  requireInlineCitations?: boolean;
  expectedSourceIds?: string[];
  allowedSourceIds?: string[];
  forbiddenTerms?: string[];
  forbiddenNumbers?: string[];
  expectedScope?: string;
  setupQuestions?: string[];
  /** Stable document names (`sourceName`) that must appear among the citations. */
  expectedSourceNames?: string[];
  /** At least one of these document names must appear among the citations. */
  anyOfSourceNames?: string[];
  /** The assistant must decline: no grounded answer exists in the dossier. */
  expectRefusal?: boolean;
  /** Free label used to break results down by question type. */
  category?: string;
}

export interface RagEvaluationAnswer {
  answer: string;
  citations: Array<{ sourceId: string; label?: string; sourceName?: string }>;
  scope?: string;
  /** Set by the runner when the API declined to answer (HTTP 400). */
  refused?: boolean;
  /** Round-trip time measured by the runner. */
  latencyMs?: number;
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
  /** Share of expected source names found in the citations (retrieval recall@k). */
  sourceNameRecall: number;
  /** null when the case does not test refusal behaviour. */
  refusalCorrect: boolean | null;
  category: string;
  latencyMs: number | null;
  failures: string[];
}

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ');
}

function recall(expected: Array<string | string[]>, answer: string) {
  if (!expected.length) return 1;
  const haystack = normalized(answer);
  const matches = expected.filter((value) =>
    (Array.isArray(value) ? value : [value]).some((variant) =>
      haystack.includes(normalized(variant)),
    ),
  );
  return matches.length / expected.length;
}

/**
 * French answers write 1190.5 as "1 190,500": drop thousands spaces and read a
 * decimal comma as a point before comparing digits.
 */
function canonicalNumbers(answer: string) {
  return answer
    .replace(/(\d)[^\S\n](?=\d{3}(?!\d))/g, '$1')
    .replace(/(\d),(\d{1,3})(?!\d)/g, '$1.$2');
}

/** "120.500" may also be written "120.5"; "120.000" may be written "120". */
function numberVariants(value: string) {
  const variants = new Set([value]);
  const decimal = /^(-?\d+)\.(\d+)$/.exec(value);
  if (decimal) {
    const trimmed = decimal[2].replace(/0+$/, '');
    variants.add(trimmed ? `${decimal[1]}.${trimmed}` : decimal[1]);
  }
  return [...variants];
}

function containsNumber(answer: string, value: string) {
  const text = canonicalNumbers(answer);
  return numberVariants(value).some((variant) => {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\d.,])${escaped}(?!\\d|[.,]\\d)`).test(text);
  });
}

const refusalPatterns = [
  /ne (?:permettent|couvrent) pas/,
  /ne (?:contiennent|mentionnent|precisent|fournissent|comportent) (?:pas|aucun)/,
  /aucune? (?:information|source|donnee|mention|document|piece|element)/,
  /pas d'(?:information|element|indication)/,
  /je ne (?:trouve|dispose|peux pas)/,
  /(?:ne|n') ?(?:figure|apparait) pas/,
  /n'(?:est|sont) pas (?:indique|mentionne|disponible|precise|renseigne)/,
  /impossible de (?:repondre|determiner|trouver)/,
];

/** True when a generated answer declines instead of stating a fact. */
export function looksLikeRefusal(answer: string) {
  const text = normalized(answer);
  return refusalPatterns.some((pattern) => pattern.test(text));
}

export function evaluateRagCase(
  testCase: RagEvaluationCase,
  result: RagEvaluationAnswer,
): RagCaseResult {
  const category = testCase.category ?? 'general';
  const latencyMs = result.latencyMs ?? null;
  if (testCase.expectRefusal) {
    // Declining can be an HTTP 400 or a generated "the sources do not say".
    const refusalCorrect =
      result.refused === true || looksLikeRefusal(result.answer);
    return {
      id: testCase.id,
      passed: refusalCorrect,
      termRecall: 1,
      numberRecall: 1,
      hasRequiredCitations: true,
      sourceRecall: 1,
      validInlineCitations: true,
      scopeCorrect: true,
      sourceNameRecall: 1,
      refusalCorrect,
      category,
      latencyMs,
      failures: refusalCorrect
        ? []
        : ['Answered a question that has no grounded answer'],
    };
  }
  if (result.refused) {
    return {
      id: testCase.id,
      passed: false,
      termRecall: 0,
      numberRecall: 0,
      hasRequiredCitations: false,
      sourceRecall: 0,
      validInlineCitations: false,
      scopeCorrect: false,
      sourceNameRecall: 0,
      refusalCorrect: false,
      category,
      latencyMs,
      failures: ['Refused a question that has a grounded answer'],
    };
  }
  const expectedNames = testCase.expectedSourceNames ?? [];
  const citedNames = new Set(
    result.citations.map((citation) => normalized(citation.sourceName ?? '')),
  );
  const anyOf = testCase.anyOfSourceNames ?? [];
  const nameScores = [
    ...expectedNames.map((name) => (citedNames.has(normalized(name)) ? 1 : 0)),
    ...(anyOf.length
      ? [anyOf.some((name) => citedNames.has(normalized(name))) ? 1 : 0]
      : []),
  ];
  const sourceNameRecall = nameScores.length
    ? nameScores.reduce((total, value) => total + value, 0) / nameScores.length
    : 1;
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
  if (sourceNameRecall !== 1) failures.push('Expected document not retrieved');
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
    sourceNameRecall,
    refusalCorrect: null,
    category,
    latencyMs,
    failures,
  };
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
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
    /** Retrieval recall@k over the cases that name an expected document. */
    retrievalRecall: mean(
      results
        .filter((result) => result.refusalCorrect === null)
        .map((result) => result.sourceNameRecall),
    ),
    /** Share of "no answer" cases correctly declined. */
    refusalAccuracy: mean(
      results
        .filter((result) => result.refusalCorrect !== null)
        .map((result) => (result.refusalCorrect ? 1 : 0)),
    ),
    latencyP50Ms: percentile(
      results.flatMap((result) =>
        result.latencyMs === null ? [] : [result.latencyMs],
      ),
      50,
    ),
    latencyP95Ms: percentile(
      results.flatMap((result) =>
        result.latencyMs === null ? [] : [result.latencyMs],
      ),
      95,
    ),
    byCategory: Object.fromEntries(
      [...new Set(results.map((result) => result.category))]
        .sort()
        .map((category) => {
          const group = results.filter(
            (result) => result.category === category,
          );
          return [
            category,
            {
              cases: group.length,
              passRate:
                group.filter((result) => result.passed).length / group.length,
            },
          ];
        }),
    ),
  };
}
