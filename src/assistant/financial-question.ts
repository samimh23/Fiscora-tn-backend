import { fromMillimes, toMillimes } from '../common/money';
import type { ApprovedExtractionForIndex } from './accounting-rag';

export interface FinancialQuestionIntent {
  operation: 'SUM' | 'COUNT';
  field: string | null;
  label: string;
  year: number | null;
  month: number | null;
}

export interface FinancialAggregation {
  answer: string;
  rows: ApprovedExtractionForIndex[];
}

const months: Record<string, number> = {
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
};

const fields: Array<{ field: string; label: string; patterns: RegExp[] }> = [
  {
    field: 'total_incl_tax',
    label: 'total TTC',
    patterns: [/\bttc\b/, /total.*factur/],
  },
  {
    field: 'subtotal_excl_tax',
    label: 'montant HT',
    patterns: [/\bht\b/, /hors taxe/],
  },
  { field: 'tax_amount', label: 'TVA', patterns: [/\btva\b/, /taxe.*valeur/] },
  { field: 'fodec_amount', label: 'FODEC', patterns: [/\bfodec\b/] },
  { field: 'stamp_tax', label: 'timbre fiscal', patterns: [/timbre/] },
  {
    field: 'amount_due',
    label: 'montant dû',
    patterns: [/montant.*du/, /reste.*payer/],
  },
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

export function detectFinancialQuestion(
  question: string,
): FinancialQuestionIntent | null {
  const normalized = normalize(question);
  const year = Number(normalized.match(/\b(20\d{2})\b/)?.[1] ?? 0) || null;
  const monthEntry = Object.entries(months).find(([name]) =>
    normalized.includes(name),
  );
  const month = monthEntry?.[1] ?? null;
  const count =
    /\b(combien|nombre)\b/.test(normalized) &&
    /factur|piece|document/.test(normalized);
  if (count) {
    return {
      operation: 'COUNT',
      field: null,
      label: 'nombre de pièces',
      year,
      month,
    };
  }
  if (!/\b(total|somme|cumul|montant)\b/.test(normalized)) return null;
  const match = fields.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (!match) return null;
  return {
    operation: 'SUM',
    field: match.field,
    label: match.label,
    year,
    month,
  };
}

function issuePeriod(data: Record<string, unknown>) {
  const issueDate = typeof data.issue_date === 'string' ? data.issue_date : '';
  const parsed = /^([0-9]{4})-([0-9]{2})/.exec(issueDate);
  return parsed
    ? { year: Number(parsed[1]), month: Number(parsed[2]) }
    : { year: null, month: null };
}

function matchesPeriod(
  row: ApprovedExtractionForIndex,
  intent: FinancialQuestionIntent,
) {
  const issue = issuePeriod(row.normalized_data);
  const year = issue.year ?? row.period_year;
  const month = issue.month ?? row.period_month;
  return (
    (intent.year === null || year === intent.year) &&
    (intent.month === null || month === intent.month)
  );
}

function currency(row: ApprovedExtractionForIndex) {
  const value = row.normalized_data.currency;
  return typeof value === 'string' && value.trim() ? value.trim() : 'TND';
}

function signedAmount(row: ApprovedExtractionForIndex, field: string) {
  const value = row.normalized_data[field];
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  try {
    const amount = toMillimes(String(value), field);
    return row.normalized_data.document_type === 'credit_note'
      ? -amount
      : amount;
  } catch {
    return null;
  }
}

function periodLabel(intent: FinancialQuestionIntent) {
  const monthName = Object.entries(months).find(
    ([, value]) => value === intent.month,
  )?.[0];
  if (monthName && intent.year) return ` pour ${monthName} ${intent.year}`;
  if (intent.year) return ` pour ${intent.year}`;
  if (monthName) return ` pour ${monthName}`;
  return '';
}

export function aggregateFinancialQuestion(
  rows: ApprovedExtractionForIndex[],
  intent: FinancialQuestionIntent,
): FinancialAggregation | null {
  const matching = rows.filter((row) => {
    const type = row.normalized_data.document_type;
    return (
      matchesPeriod(row, intent) &&
      (type === 'invoice' || type === 'credit_note' || type === undefined)
    );
  });
  if (intent.operation === 'COUNT') {
    if (!matching.length) return null;
    return {
      answer: `Le ${intent.label}${periodLabel(intent)} est de ${matching.length}.`,
      rows: matching,
    };
  }

  const totals = new Map<string, bigint>();
  const used: ApprovedExtractionForIndex[] = [];
  for (const row of matching) {
    const amount = signedAmount(row, intent.field!);
    if (amount === null) continue;
    const code = currency(row);
    totals.set(code, (totals.get(code) ?? 0n) + amount);
    used.push(row);
  }
  if (!used.length) return null;
  const formatted = [...totals.entries()]
    .map(([code, amount]) => `${fromMillimes(amount)} ${code}`)
    .join(', ');
  return {
    answer: `Le ${intent.label}${periodLabel(intent)} est de ${formatted}, calculé exactement à partir de ${used.length} pièce(s) validée(s).`,
    rows: used,
  };
}
