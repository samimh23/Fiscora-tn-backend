import type { ApprovedExtractionForIndex } from './accounting-rag';
import { analyzeQuestion, type RetrievalFilters } from './query-filters';

/**
 * "How many suppliers?", "Liste des clients", "Liste les achats de janvier":
 * a document search returns 8 passages, so it cannot count or list reliably.
 * These questions are answered exactly from every approved document instead.
 */
export interface ListingQuestion {
  /** PARTIES lists suppliers or customers; DOCUMENTS lists the pieces. */
  kind: 'PARTIES' | 'DOCUMENTS';
  party: 'SUPPLIER' | 'CUSTOMER' | null;
  operation: 'COUNT' | 'LIST';
  filters: RetrievalFilters;
}

function plain(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Tolerates the usual typos: "suplier", "fournisseur", "fourniseurs".
const SUPPLIER = /\b(su+p+l+i?e+rs?|vendors?|fourn?is+eurs?)\b/;
const CUSTOMER = /\b(clients?|customers?|acheteurs?)\b/;
const DOCUMENTS =
  /\b(documents?|pieces?|factures?|invoices?|achats?|ventes?|avoirs?|releves?)\b/;
const BALANCE =
  /\b(owe|owes|owed|owing|balances?|outstanding|unpaid|paid|solde|soldes|doit|doivent|devons|dois|dettes?|creances?|impayee?s?|reste|regle|reglements?|paiements?|payments?)\b/;
const COUNT = /\b(how many|combien|nombre|number of|count)\b/;
const LIST =
  /\b(list|liste|lister|listez|quels|quelles|which|who are|qui sont|show|affiche|donne|cite|enumere)\b/;

export function detectListingQuestion(
  question: string,
): ListingQuestion | null {
  const text = plain(question);
  // Amounts owed are live ledger questions, handled elsewhere.
  if (BALANCE.test(text)) return null;
  const operation = COUNT.test(text)
    ? 'COUNT'
    : LIST.test(text)
      ? 'LIST'
      : null;
  if (!operation) return null;
  const supplier = SUPPLIER.test(text);
  const customer = CUSTOMER.test(text);
  const party =
    supplier === customer ? null : supplier ? 'SUPPLIER' : 'CUSTOMER';
  const { filters } = analyzeQuestion(question);
  const mentionsDocuments = DOCUMENTS.test(text);
  // "Quelles ventes en janvier et à quels clients ?" lists the documents.
  if (
    mentionsDocuments &&
    operation === 'LIST' &&
    (filters.category || filters.month || filters.year || !party)
  ) {
    if (!filters.category && !filters.month && !filters.year) return null;
    return { kind: 'DOCUMENTS', party, operation, filters };
  }
  if (!party) return null;
  return { kind: 'PARTIES', party, operation, filters };
}

const LEGAL_FORMS =
  /\b(sarl|suarl|sa|sas|sasu|ste|societe|ets|etablissements?|group|groupe)\b/g;

/** "TUNISIANET S.A.R.L." and "Tunisianet SARL" are the same party. */
export function partyKey(name: string) {
  return plain(name)
    .replace(/\./g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(LEGAL_FORMS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nested(row: ApprovedExtractionForIndex, field: string) {
  const value = row.normalized_data[field];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

function partyName(row: ApprovedExtractionForIndex, field: string) {
  return text(nested(row, field)?.name) || null;
}

const MONTHS = [
  '',
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** The issue date decides the period; the dossier period is the fallback. */
function period(row: ApprovedExtractionForIndex) {
  const date =
    text(row.normalized_data.issue_date) ||
    text(nested(row, 'bank_statement')?.period_start);
  const parsed = /^(\d{4})-(\d{2})/.exec(date);
  return parsed
    ? { year: Number(parsed[1]), month: Number(parsed[2]) }
    : { year: row.period_year, month: row.period_month };
}

function inPeriod(row: ApprovedExtractionForIndex, filters: RetrievalFilters) {
  const { year, month } = period(row);
  return (
    (filters.year === null || year === filters.year) &&
    (filters.month === null || month === filters.month)
  );
}

function periodLabel(filters: RetrievalFilters) {
  if (filters.month && filters.year)
    return ` en ${MONTHS[filters.month]} ${filters.year}`;
  if (filters.month) return ` en ${MONTHS[filters.month]}`;
  if (filters.year) return ` en ${filters.year}`;
  return '';
}

export interface ListingAnswer {
  answer: string;
  rows: ApprovedExtractionForIndex[];
}

function counterpart(row: ApprovedExtractionForIndex) {
  if (row.category === 'FACTURES_VENTES') return partyName(row, 'customer');
  if (row.category === 'RELEVES_BANCAIRES')
    return text(nested(row, 'bank_statement')?.bank_name) || null;
  return partyName(row, 'supplier');
}

const CATEGORY_LABEL: Record<string, string> = {
  FACTURES_ACHATS: 'pièce(s) d’achat',
  FACTURES_VENTES: 'pièce(s) de vente',
  RELEVES_BANCAIRES: 'relevé(s) bancaire(s)',
};

function listDocuments(
  rows: ApprovedExtractionForIndex[],
  intent: ListingQuestion,
): ListingAnswer | null {
  const selected = rows
    .filter(
      (row) =>
        (!intent.filters.category ||
          row.category === intent.filters.category) &&
        inPeriod(row, intent.filters),
    )
    .sort((left, right) => {
      const a = `${period(left).year}-${String(period(left).month).padStart(2, '0')} ${text(left.normalized_data.issue_date)}`;
      const b = `${period(right).year}-${String(period(right).month).padStart(2, '0')} ${text(right.normalized_data.issue_date)}`;
      return (
        a.localeCompare(b) ||
        left.original_name.localeCompare(right.original_name)
      );
    });
  if (!selected.length) return null;
  const shown = selected.slice(0, 40);
  const lines = shown.map((row, index) => {
    const data = row.normalized_data;
    const parts = [
      text(data.document_number) || row.original_name,
      counterpart(row),
      text(data.issue_date),
      text(data.total_incl_tax)
        ? `${text(data.total_incl_tax)} ${text(data.currency) || 'TND'} TTC`
        : '',
    ].filter(Boolean);
    return `- ${parts.join(' — ')} [S${index + 1}]`;
  });
  const what = intent.filters.category
    ? CATEGORY_LABEL[intent.filters.category]
    : 'pièce(s)';
  const more =
    selected.length > shown.length
      ? `\n… et ${selected.length - shown.length} autre(s).`
      : '';
  return {
    answer: `${selected.length} ${what} validée(s)${periodLabel(intent.filters)} :\n${lines.join('\n')}${more}`,
    rows: shown,
  };
}

function listParties(
  rows: ApprovedExtractionForIndex[],
  intent: ListingQuestion,
): ListingAnswer | null {
  // Suppliers are read from purchases, customers from sales: on a sale the
  // "supplier" field is the dossier's own company.
  const category =
    intent.party === 'SUPPLIER' ? 'FACTURES_ACHATS' : 'FACTURES_VENTES';
  const field = intent.party === 'SUPPLIER' ? 'supplier' : 'customer';
  const parties = new Map<
    string,
    { name: string; count: number; first: ApprovedExtractionForIndex }
  >();
  for (const row of rows) {
    if (row.category !== category || !inPeriod(row, intent.filters)) continue;
    const name = partyName(row, field);
    if (!name) continue;
    const key = partyKey(name) || plain(name);
    const existing = parties.get(key);
    if (existing) existing.count += 1;
    else parties.set(key, { name, count: 1, first: row });
  }
  if (!parties.size) return null;
  const sorted = [...parties.values()].sort(
    (left, right) =>
      right.count - left.count || left.name.localeCompare(right.name, 'fr'),
  );
  const label = intent.party === 'SUPPLIER' ? 'fournisseur' : 'client';
  const plural = sorted.length > 1 ? 's' : '';
  const kind = intent.party === 'SUPPLIER' ? 'd’achat' : 'de vente';
  const lines = sorted
    .slice(0, 30)
    .map(
      (party, index) =>
        `- ${party.name} : ${party.count} pièce${party.count > 1 ? 's' : ''} [S${index + 1}]`,
    );
  const more =
    sorted.length > 30 ? `\n… et ${sorted.length - 30} autre(s).` : '';
  return {
    answer: `Les pièces ${kind} validées du dossier${periodLabel(intent.filters)} mentionnent ${sorted.length} ${label}${plural} distinct${plural} :\n${lines.join('\n')}${more}\n\nCe décompte porte sur les pièces validées, pas sur le fichier des tiers.`,
    rows: sorted.slice(0, 30).map((party) => party.first),
  };
}

export function answerListing(
  rows: ApprovedExtractionForIndex[],
  intent: ListingQuestion,
): ListingAnswer | null {
  return intent.kind === 'DOCUMENTS'
    ? listDocuments(rows, intent)
    : listParties(rows, intent);
}
