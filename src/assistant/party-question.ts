import type { ApprovedExtractionForIndex } from './accounting-rag';
import { fromMillimes, toMillimes } from '../common/money';
import { type AnswerLanguage, MESSAGES } from './assistant-language';
import {
  analyzeQuestion,
  namesDocumentReference,
  type RetrievalFilters,
} from './query-filters';

/**
 * "How many suppliers?", "Liste des clients", "Liste les achats de janvier",
 * "Quels documents avons-nous ?": a document search returns 8 passages, so it
 * cannot count or list reliably. These are answered exactly from every
 * approved document instead.
 */
export interface ListingQuestion {
  /** PARTIES lists suppliers or customers; DOCUMENTS lists the pieces. */
  kind: 'PARTIES' | 'DOCUMENTS' | 'RANKING';
  party: 'SUPPLIER' | 'CUSTOMER' | null;
  operation: 'COUNT' | 'LIST';
  filters: RetrievalFilters;
}

function plain(value: string) {
  // Only Latin accents are removed: Arabic letters such as "ئ" would split.
  return value
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase();
}

// Tolerates the usual typos: "suplier", "fournisseur", "fourniseurs".
const SUPPLIER = /\b(su+p+l+i?e+rs?|vendors?|fourn?is+eurs?)\b|مزود|مورد/;
const CUSTOMER = /\b(clients?|customers?|acheteurs?)\b|حريف|حرفاء|عملاء|زبائن/;
const DOCUMENTS =
  /\b(documents?|pieces?|factures?|invoices?|achats?|ventes?|avoirs?|releves?|fichiers?|files?)\b|وثائق|وثيقة|فواتير|فاتورة/;
/** Plural nouns that make "which documents do we have" a full listing. */
const ALL_DOCUMENTS =
  /\b(documents|pieces|factures|invoices|fichiers|files)\b|وثائق|فواتير/;
const AVAILABLE =
  /\b(have|got|available|availble|disponibles?|avons|a-t-on|existe|existent|dossier|validees?|validated|all|tous|toutes|list|liste)\b|لدينا|عندنا|المتوفرة|كل/;
const BALANCE =
  /\b(owe|owes|owed|owing|balances?|outstanding|unpaid|paid|solde|soldes|doit|doivent|devons|dois|dettes?|creances?|impayee?s?|reste|regle|reglements?|paiements?|payments?)\b|رصيد|ديون/;
const COUNT = /\b(how many|combien|nombre|number of|count)\b|كم|عدد/;
const LIST =
  /\b(list|liste|lister|listez|quels|quelles|which|what|who are|qui sont|show|affiche|donne|cite|enumere)\b|قائمة|ما هي|ماهي|أعطني|اعطني/;

export function detectListingQuestion(
  question: string,
): ListingQuestion | null {
  const text = plain(question);
  // Amounts owed are live ledger questions; a named document is read directly.
  if (BALANCE.test(text) || namesDocumentReference(question)) return null;
  // "Quel est le fournisseur le plus cher ?" ranks parties by amount.
  if (RANKING.test(text)) {
    const rankedParty = SUPPLIER.test(text)
      ? 'SUPPLIER'
      : CUSTOMER.test(text)
        ? 'CUSTOMER'
        : null;
    if (rankedParty) {
      return {
        kind: 'RANKING',
        party: rankedParty,
        operation: 'LIST',
        filters: analyzeQuestion(question).filters,
      };
    }
  }
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
  const filtered = Boolean(filters.category || filters.month || filters.year);
  if (DOCUMENTS.test(text) && operation === 'LIST') {
    // "Quelles ventes en janvier et à quels clients ?" lists the documents.
    if (filtered) return { kind: 'DOCUMENTS', party, operation, filters };
    // "What documents do we have?" lists everything validated.
    if (!party && ALL_DOCUMENTS.test(text) && AVAILABLE.test(text)) {
      return { kind: 'DOCUMENTS', party, operation, filters };
    }
    if (!party) return null;
  }
  if (!party) return null;
  // "Which supplier sold us the phone?" is about one document, not a list.
  if (operation === 'LIST' && !PLURAL_PARTIES.test(text)) return null;
  return { kind: 'PARTIES', party, operation, filters };
}

const PLURAL_PARTIES =
  /\b(su+p+l+i?e+rs|vendors|fourn?is+eurs|clients|customers|acheteurs)\b|مزودين|موردين|حرفاء|عملاء|زبائن/;

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

function periodLabel(filters: RetrievalFilters, language: AnswerLanguage) {
  const listing = MESSAGES[language].listing;
  return listing.inPeriod(
    filters.month ? listing.months[filters.month] : null,
    filters.year,
  );
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

function sortKey(row: ApprovedExtractionForIndex) {
  const { year, month } = period(row);
  return `${year ?? 9999}-${String(month ?? 99).padStart(2, '0')} ${text(row.normalized_data.issue_date)} ${row.original_name}`;
}

function listDocuments(
  rows: ApprovedExtractionForIndex[],
  intent: ListingQuestion,
  language: AnswerLanguage,
): ListingAnswer | null {
  const messages = MESSAGES[language].listing;
  const selected = rows
    .filter(
      (row) =>
        (!intent.filters.category ||
          row.category === intent.filters.category) &&
        inPeriod(row, intent.filters),
    )
    .sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
  if (!selected.length) return null;
  const shown = selected.slice(0, 40);
  const lines = shown.map((row, index) => {
    const data = row.normalized_data;
    const number = text(data.document_number);
    const parts = [
      number ? `${number} (${row.original_name})` : row.original_name,
      counterpart(row),
      text(data.issue_date),
      text(data.total_incl_tax)
        ? `${text(data.total_incl_tax)} ${text(data.currency) || 'TND'} TTC`
        : '',
    ].filter(Boolean);
    return `- ${parts.join(' — ')} [S${index + 1}]`;
  });
  const what = intent.filters.category
    ? messages.kinds[intent.filters.category]
    : messages.anyKind;
  const more =
    selected.length > shown.length
      ? `\n${messages.more(selected.length - shown.length)}`
      : '';
  return {
    answer: `${messages.documents(selected.length, what, periodLabel(intent.filters, language))}\n${lines.join('\n')}${more}`,
    rows: shown,
  };
}

function listParties(
  rows: ApprovedExtractionForIndex[],
  intent: ListingQuestion,
  language: AnswerLanguage,
): ListingAnswer | null {
  const messages = MESSAGES[language].listing;
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
  const lines = sorted
    .slice(0, 30)
    .map(
      (party, index) =>
        `- ${party.name} : ${messages.pieces(party.count)} [S${index + 1}]`,
    );
  const more =
    sorted.length > 30 ? `\n${messages.more(sorted.length - 30)}` : '';
  const header = messages.parties(
    sorted.length,
    intent.party!,
    intent.party === 'SUPPLIER' ? 'purchase' : 'sale',
    periodLabel(intent.filters, language),
  );
  return {
    answer: `${header}\n${lines.join('\n')}${more}\n\n${messages.partiesNote}`,
    rows: sorted.slice(0, 30).map((party) => party.first),
  };
}

export function answerListing(
  rows: ApprovedExtractionForIndex[],
  intent: ListingQuestion,
  language: AnswerLanguage = 'fr',
): ListingAnswer | null {
  if (intent.kind === 'RANKING') return rankParties(rows, intent, language);
  return intent.kind === 'DOCUMENTS'
    ? listDocuments(rows, intent, language)
    : listParties(rows, intent, language);
}

const RANKING =
  /\b(plus cher|plus chers|plus chere|plus gros|plus grosse|plus importants?|principaux|principal|top|biggest|largest|most expensive|highest|classement|ranking)\b|الأكبر|الأغلى|الأهم/;

function amount(row: ApprovedExtractionForIndex, field: string) {
  const value = row.normalized_data[field];
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  try {
    const millimes = toMillimes(String(value).trim(), field);
    return row.normalized_data.document_type === 'credit_note'
      ? -millimes
      : millimes;
  } catch {
    return null;
  }
}

interface PartyTotals {
  name: string;
  side: 'purchase' | 'sale';
  rows: ApprovedExtractionForIndex[];
  ttc: bigint;
  ht: bigint | null;
  tax: bigint | null;
}

/** Totals per supplier (purchases) or customer (sales), credit notes deducted. */
function totalsByParty(
  rows: ApprovedExtractionForIndex[],
  filters: RetrievalFilters,
  only?: 'SUPPLIER' | 'CUSTOMER',
) {
  const parties = new Map<string, PartyTotals>();
  for (const row of rows) {
    const side =
      row.category === 'FACTURES_ACHATS'
        ? 'purchase'
        : row.category === 'FACTURES_VENTES'
          ? 'sale'
          : null;
    if (!side || !inPeriod(row, filters)) continue;
    if (only && (only === 'SUPPLIER') !== (side === 'purchase')) continue;
    const name = partyName(row, side === 'purchase' ? 'supplier' : 'customer');
    const ttc = amount(row, 'total_incl_tax');
    if (!name || ttc === null) continue;
    const key = `${side}:${partyKey(name) || plain(name)}`;
    const ht = amount(row, 'subtotal_excl_tax');
    const tax = amount(row, 'tax_amount');
    const entry = parties.get(key) ?? {
      name,
      side,
      rows: [],
      ttc: 0n,
      ht: 0n,
      tax: 0n,
    };
    entry.rows.push(row);
    entry.ttc += ttc;
    entry.ht = entry.ht === null || ht === null ? null : entry.ht + ht;
    entry.tax = entry.tax === null || tax === null ? null : entry.tax + tax;
    parties.set(key, entry);
  }
  return [...parties.values()];
}

function currencyOf(rows: ApprovedExtractionForIndex[]) {
  const value = text(rows[0]?.normalized_data.currency);
  return value && !/^(tnd|dt|dnt|dinars?)$/i.test(value) ? value : 'TND';
}

function rankParties(
  rows: ApprovedExtractionForIndex[],
  intent: ListingQuestion,
  language: AnswerLanguage,
): ListingAnswer | null {
  const messages = MESSAGES[language];
  const ranked = totalsByParty(rows, intent.filters, intent.party!)
    .filter((party) => party.ttc > 0n)
    .sort((left, right) =>
      right.ttc > left.ttc ? 1 : right.ttc < left.ttc ? -1 : 0,
    );
  if (!ranked.length) return null;
  const shown = ranked.slice(0, 15);
  const lines = shown.map(
    (party, index) =>
      `${index + 1}. ${party.name} : ${fromMillimes(party.ttc)} ${currencyOf(party.rows)} TTC — ${messages.listing.pieces(party.rows.length)} [S${index + 1}]`,
  );
  return {
    answer: `${messages.ranking(intent.party!, ranked.length, periodLabel(intent.filters, language))}\n${lines.join('\n')}\n\n${messages.totalsNote}`,
    rows: shown.map((party) => party.rows[0]),
  };
}

const TOTAL_WORDS =
  /\b(total|totaux|montant|somme|combien|how much|spent|spend|depense|depenses|achete|bought|sold|vendu|purchases?|sales|achats|ventes)\b|مجموع|كم/;

/** The question points at a counterparty: "chez X", "from X", "fournisseur X". */
const PARTY_MARKER =
  /\b(chez|aupres|from|with|avec|fournisseurs?|suppliers?|vendors?|clients?|customers?)\b|من|لدى|مع/;

/** A product or line question ("quantité de « toner »", "unit price"). */
const ITEM =
  /\b(quantites?|quantity|quantities|lignes?|lines?|prix unitaires?|unit prices?|articles?|produits?|products?|items?|unites?|units?)\b/;

/** Cheap check before loading every document for a per-party total. */
export function mayAskPartyTotal(question: string) {
  const text = plain(question);
  return (
    TOTAL_WORDS.test(text) &&
    PARTY_MARKER.test(text) &&
    !ITEM.test(text) &&
    !/[«»"“”]/.test(question) &&
    !BALANCE.test(text) &&
    !namesDocumentReference(question)
  );
}

const GENERIC_NAME_WORDS = new Set([
  'tunisie',
  'tunis',
  'sfax',
  'sousse',
  'auto',
  'services',
  'service',
  'informatique',
  'trading',
  'international',
  'tunisia',
]);

/**
 * "Total des achats chez Garage Hamdi", "how much did we spend with MYTEK":
 * an exact total over the party's validated documents.
 */
export function answerPartyTotal(
  rows: ApprovedExtractionForIndex[],
  question: string,
  language: AnswerLanguage = 'fr',
): ListingAnswer | null {
  if (!mayAskPartyTotal(question)) return null;
  const words = new Set(
    partyKey(question)
      .split(' ')
      .filter((word) => word.length >= 3),
  );
  const { filters } = analyzeQuestion(question);
  const candidates = totalsByParty(rows, filters)
    .map((party) => {
      const keyWords = partyKey(party.name)
        .split(' ')
        .filter((word) => word.length >= 3 && !GENERIC_NAME_WORDS.has(word));
      const matched = keyWords.filter((word) => words.has(word)).length;
      const enough =
        matched >= 2 ||
        (matched === 1 &&
          (keyWords.length === 1 || matched / keyWords.length >= 0.5));
      return { party, matched: enough ? matched : 0 };
    })
    .filter((candidate) => candidate.matched > 0)
    .sort((left, right) => right.matched - left.matched);
  if (!candidates.length) return null;
  if (
    candidates.length > 1 &&
    candidates[1].matched === candidates[0].matched
  ) {
    return null;
  }
  const party = candidates[0].party;
  const messages = MESSAGES[language];
  const currency = currencyOf(party.rows);
  const documents = [...party.rows].sort((left, right) =>
    text(left.normalized_data.issue_date).localeCompare(
      text(right.normalized_data.issue_date),
    ),
  );
  const lines = documents.slice(0, 30).map((row, index) => {
    const data = row.normalized_data;
    const parts = [
      text(data.document_number) || row.original_name,
      text(data.issue_date),
      text(data.total_incl_tax)
        ? `${text(data.total_incl_tax)} ${currency} TTC`
        : '',
    ].filter(Boolean);
    return `- ${parts.join(' — ')} [S${index + 1}]`;
  });
  return {
    answer: `${messages.partyTotal(party.name, party.side, periodLabel(filters, language), documents.length)}\n${lines.join('\n')}\n\n${messages.totalsLine(
      `${fromMillimes(party.ttc)} ${currency}`,
      party.ht === null ? null : `${fromMillimes(party.ht)} ${currency}`,
      party.tax === null ? null : `${fromMillimes(party.tax)} ${currency}`,
    )}\n${messages.totalsNote}`,
    rows: documents.slice(0, 30),
  };
}
