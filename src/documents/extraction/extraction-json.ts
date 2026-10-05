import type { OcrToken } from './ocr-evidence-matcher';

export function ocrTokenBatches(
  tokens: OcrToken[],
  pagesPerBatch: number,
  maximumCharacters = 28_000,
) {
  const batchSize = Number.isFinite(pagesPerBatch)
    ? Math.max(1, Math.floor(pagesPerBatch))
    : 1;
  const characterLimit = Number.isFinite(maximumCharacters)
    ? Math.max(1_000, Math.floor(maximumCharacters))
    : 28_000;
  const pageNumbers = [...new Set(tokens.map((token) => token.page))].sort(
    (left, right) => left - right,
  );
  const batches: OcrToken[][] = [];
  let current: OcrToken[] = [];
  let currentPages = 0;
  let currentCharacters = 0;
  for (const page of pageNumbers) {
    const pageTokens = tokens.filter((token) => token.page === page);
    const pageCharacters = pageTokens.reduce(
      (total, token) => total + compactOcrToken(token).length,
      0,
    );
    if (
      current.length &&
      (currentPages >= batchSize ||
        currentCharacters + pageCharacters > characterLimit)
    ) {
      batches.push(current);
      current = [];
      currentPages = 0;
      currentCharacters = 0;
    }
    for (const token of pageTokens) {
      const tokenCharacters = compactOcrToken(token).length;
      if (
        current.length &&
        currentCharacters + tokenCharacters > characterLimit
      ) {
        batches.push(current);
        current = [];
        currentPages = 0;
        currentCharacters = 0;
      }
      current.push(token);
      currentCharacters += tokenCharacters;
    }
    currentPages += 1;
  }
  if (current.length) batches.push(current);
  return batches.filter((batch) => batch.length > 0);
}

function compactOcrToken(token: OcrToken) {
  return JSON.stringify([
    token.id,
    token.page,
    token.text,
    token.confidence,
    token.bbox,
  ]);
}

const COLLECTED_ARRAY_PATHS = new Set([
  'line_items',
  'additional_fields',
  'other_taxes',
  'bank_statement.transactions',
]);

const PREFER_LATER_PATHS = new Set([
  'gross_subtotal_excl_tax',
  'global_discount_amount',
  'global_discount_rate',
  'subtotal_excl_tax',
  'tax_amount',
  'fodec_amount',
  'stamp_tax',
  'total_incl_tax',
  'amount_due',
  'bank_statement.period_end',
  'bank_statement.closing_balance',
]);

export function mergeExtractionBatches(
  batches: Array<Record<string, unknown>>,
): Record<string, unknown> {
  if (!batches.length)
    throw new Error('Extraction returned no extraction batches.');
  const result: Record<string, unknown> = {};
  for (const batch of batches) mergeRecord(result, batch, '');

  const types = batches
    .map((batch) => batch.document_type)
    .filter((value): value is string => typeof value === 'string');
  result.document_type =
    types.find((value) => value !== 'other') ?? types[0] ?? 'other';
  return result;
}

function mergeRecord(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  parentPath: string,
) {
  for (const [key, sourceValue] of Object.entries(source)) {
    if (key === '_evidence') continue;
    const path = parentPath ? `${parentPath}.${key}` : key;
    const targetValue = target[key];
    if (Array.isArray(sourceValue)) {
      const sourceArray = sourceValue as unknown[];
      const usefulValues = sourceArray.filter(hasUsefulValue);
      if (!COLLECTED_ARRAY_PATHS.has(path)) {
        if (targetValue === undefined && usefulValues.length)
          target[key] = structuredClone(usefulValues);
        continue;
      }
      const existing: unknown[] = Array.isArray(targetValue)
        ? (targetValue as unknown[])
        : [];
      target[key] = [...existing, ...structuredClone(usefulValues)];
      continue;
    }
    if (isRecord(sourceValue)) {
      const nested = isRecord(targetValue) ? targetValue : {};
      mergeRecord(nested, sourceValue, path);
      target[key] = nested;
      continue;
    }
    if (!hasUsefulValue(sourceValue)) {
      if (!(key in target)) target[key] = null;
      continue;
    }
    if (
      !hasUsefulValue(targetValue) ||
      PREFER_LATER_PATHS.has(path) ||
      (path === 'document_type' && targetValue === 'other')
    ) {
      target[key] = sourceValue;
    }
  }
}

function hasUsefulValue(value: unknown): boolean {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.some(hasUsefulValue);
  if (isRecord(value)) return Object.values(value).some(hasUsefulValue);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseExtractionJson(
  contentText: string,
  finishReason?: string | null,
): Record<string, unknown> {
  let candidate = contentText
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace)
    candidate = candidate.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    if (finishReason === 'length')
      throw new Error(
        'Extraction response was truncated before completing the structured JSON.',
      );
    throw new Error('Extraction returned invalid structured JSON.');
  }
}
