/**
 * Reads the hints an accountant puts in a question (a month, a year, a kind
 * of document, a document reference) so retrieval can look in the right place
 * first. Filters are soft: the caller retries without them when they match
 * nothing, so a wrong guess never hides an answer.
 */

export interface RetrievalFilters {
  year: number | null;
  month: number | null;
  category: 'FACTURES_ACHATS' | 'FACTURES_VENTES' | 'RELEVES_BANCAIRES' | null;
}

export interface QueryAnalysis {
  filters: RetrievalFilters;
  /** Codes such as STEG-2026-01-4471, FV-2026-013 or 205/55R16. */
  codes: string[];
  /** Significant words, accents removed, for the fuzzy (trigram) match. */
  terms: string[];
}

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** Words too common in accounting questions to help a fuzzy match. */
const STOP_WORDS = new Set(
  `a au aux avec ce ces cet cette dans de des du elle en est et il ils la le les leur
  leurs mais ne ni nous on ou par pas pour qu que quel quelle quelles quels qui sa se
  ses son sont sur ta te tes ton tu un une vos votre vous y the of and what which is
  are was for to in on from how much many combien comment quoi quand dont lui moi
  ete etait avait avoir faire fait document documents piece pieces facture factures
  montant total prix date quelle quel liste donne donner indique indiquer chez`.split(
    /\s+/,
  ),
);

function plain(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function category(text: string): RetrievalFilters['category'] {
  const purchase =
    /\b(achats?|achete(?:e|es|s)?|fournisseurs?|purchases?|suppliers?)\b/.test(
      text,
    );
  const sale = /\b(ventes?|vendu(?:e|es|s)?|sales?|customers?)\b/.test(text);
  const bank =
    /\b(releves?|bancaires?|banque|virements?|prelev\w*|bank|statements?)\b/.test(
      text,
    );
  // Only filter when the question clearly points at one kind of document.
  const matches = [purchase, sale, bank].filter(Boolean).length;
  if (matches !== 1) return null;
  if (purchase) return 'FACTURES_ACHATS';
  if (sale) return 'FACTURES_VENTES';
  return 'RELEVES_BANCAIRES';
}

/**
 * A reference has letters and digits joined by - / _ or . (STEG-2026-01-4471,
 * FV-2026-013), or mixes digits and letters inside one token (205/55R16).
 */
export function documentCodes(question: string) {
  const tokens = question.match(/[\p{L}\p{N}][\p{L}\p{N}\-/_.]*[\p{L}\p{N}]/gu);
  return [
    ...new Set(
      (tokens ?? []).filter(
        (token) =>
          /\d/.test(token) &&
          (/[\p{L}]/u.test(token) || /[-/_.]/.test(token)) &&
          !/^\d{4}$/.test(token) &&
          !/^\d+[.,]\d+$/.test(token),
      ),
    ),
  ];
}

/** True when the question names one specific document by its reference. */
export function namesDocumentReference(question: string) {
  return documentCodes(question).some(isReference);
}

function isReference(code: string) {
  return /^\p{L}{1,10}[-/_.]?\d/u.test(code) && /[-/_.]/.test(code);
}

export function analyzeQuestion(question: string): QueryAnalysis {
  const text = plain(question);
  const codes = documentCodes(question);
  // "FV-2026-013" names a document, not the year 2026.
  const periodText = codes
    .filter(isReference)
    .reduce((value, code) => value.split(plain(code)).join(' '), text);
  const yearMatch = periodText.match(/\b(20\d{2})\b/);
  const monthsNamed = Object.entries(MONTHS).filter(([name]) =>
    new RegExp(`\\b${name}\\b`).test(periodText),
  );
  // "Compare January and April": filtering on one month would hide the other.
  const monthEntry =
    new Set(monthsNamed.map(([, month]) => month)).size === 1
      ? monthsNamed[0]
      : undefined;
  const numericMonth = periodText.match(/\b(0?[1-9]|1[0-2])\/(20\d{2})\b/);
  const codeWords = new Set(codes.map(plain));
  const terms = [
    ...new Set(
      (text.match(/[a-z0-9]+/g) ?? []).filter(
        (word) =>
          word.length >= 4 &&
          !STOP_WORDS.has(word) &&
          !MONTHS[word] &&
          !/^\d+$/.test(word) &&
          !codeWords.has(word),
      ),
    ),
  ].slice(0, 8);
  return {
    filters: {
      year: yearMatch
        ? Number(yearMatch[1])
        : numericMonth
          ? Number(numericMonth[2])
          : null,
      month: monthEntry
        ? monthEntry[1]
        : numericMonth
          ? Number(numericMonth[1])
          : null,
      category: category(text),
    },
    codes,
    terms,
  };
}

export function hasFilters(filters: RetrievalFilters) {
  return (
    filters.year !== null || filters.month !== null || filters.category !== null
  );
}

export const NO_FILTERS: RetrievalFilters = {
  year: null,
  month: null,
  category: null,
};
