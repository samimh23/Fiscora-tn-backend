export type OcrToken = {
  id: string;
  page: number;
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
};

export type OcrDocument = {
  width: number;
  height: number;
  pages?: Array<{
    page: number;
    width: number;
    height: number;
    source?: 'text' | 'ocr';
  }>;
  tokens: OcrToken[];
};

type ExtractionEvidence = {
  status: 'MATCHED';
  page: number;
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
  tokenIds: string[];
};

export function attachOcrEvidence(
  input: Record<string, unknown>,
  document: OcrDocument | null,
  minimumConfidence = 0.85,
): Record<string, unknown> {
  const result = structuredClone(input);
  delete result._evidence;
  if (!document || document.width <= 0 || document.height <= 0) return result;

  const evidence: Record<string, ExtractionEvidence> = {};
  for (const [path, value] of scalarValues(result)) {
    const token = uniqueMatch(value, document.tokens, minimumConfidence);
    if (!token) continue;
    const dimensions = document.pages?.find(
      (page) => page.page === token.page,
    ) ?? { width: document.width, height: document.height };
    evidence[path] = {
      status: 'MATCHED',
      page: token.page,
      text: token.text,
      bbox: normalizeBox(token.bbox, dimensions.width, dimensions.height),
      confidence: token.confidence,
      tokenIds: [token.id],
    };
  }
  result._evidence = evidence;
  return result;
}

function scalarValues(
  input: Record<string, unknown>,
): Array<[string, string | number]> {
  const values: Array<[string, string | number]> = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 8 || value == null) return;
    if (typeof value === 'string' || typeof value === 'number') {
      if (path && value !== '') values.push([path, value]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        visit(item, path ? `${path}.${index}` : String(index), depth + 1),
      );
      return;
    }
    if (typeof value !== 'object') return;
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (key === '_evidence') continue;
      visit(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  visit(input, '', 0);
  return values;
}

function uniqueMatch(
  value: string | number,
  tokens: OcrToken[],
  minimumConfidence: number,
) {
  const keys = comparisonKeys(String(value));
  if (!keys.size) return null;
  const eligible = tokens.filter(
    (token) =>
      token.confidence >= minimumConfidence && normalize(token.text).length > 0,
  );
  const exact = eligible.filter((token) =>
    [...keys].some((key) => comparisonKeys(token.text).has(key)),
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const contained = eligible.filter((token) => {
    const tokenKey = normalize(token.text);
    return [...keys].some((key) => key.length >= 3 && tokenKey.includes(key));
  });
  return contained.length === 1 ? contained[0] : null;
}

function comparisonKeys(value: string) {
  const keys = new Set<string>();
  const normalized = normalize(value);
  if (normalized) keys.add(normalized);
  const date = canonicalDate(value);
  if (date) keys.add(`date${date}`);
  return keys;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function canonicalDate(value: string) {
  const iso = value.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso)
    return `${iso[1]}${iso[2].padStart(2, '0')}${iso[3].padStart(2, '0')}`;
  const local = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (local)
    return `${local[3]}${local[2].padStart(2, '0')}${local[1].padStart(2, '0')}`;
  return null;
}

function normalizeBox(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const [x1, y1, x2, y2] = bbox;
  return [
    coordinate(x1, width),
    coordinate(y1, height),
    coordinate(x2, width),
    coordinate(y2, height),
  ];
}

function coordinate(value: number, extent: number) {
  return Math.min(1000, Math.max(0, Math.round((value / extent) * 1000)));
}
