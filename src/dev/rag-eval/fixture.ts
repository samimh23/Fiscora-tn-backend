/**
 * Synthetic, fictional dossier used to measure the assistant's retrieval.
 * Every company, person and amount here is invented. The data is generated
 * deterministically so the expected answers in `cases.ts` never drift.
 */
import type { ApprovedExtractionForIndex } from '../../assistant/accounting-rag';

export interface EvalLine {
  description: string;
  reference: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface EvalInvoice {
  kind: 'purchase' | 'sale' | 'credit_note';
  fileName: string;
  number: string;
  issueDate: string;
  month: number;
  party: { name: string; taxId: string; address: string };
  lines: EvalLine[];
  subtotal: string;
  tax: string;
  stamp: string;
  total: string;
}

export interface EvalBankTransaction {
  date: string;
  description: string;
  reference: string;
  debit: string | null;
  credit: string | null;
  balance: string;
}

export interface EvalBankStatement {
  kind: 'bank';
  fileName: string;
  month: number;
  bankName: string;
  iban: string;
  periodStart: string;
  periodEnd: string;
  opening: string;
  closing: string;
  transactions: EvalBankTransaction[];
}

export const EVAL_YEAR = 2026;
export const EVAL_OBJECT_KEY_PREFIX = 'rag-eval/';

export const SUPPLIERS = [
  {
    code: 'STEG',
    name: 'Société Énergie et Gaz du Sahel',
    taxId: '0001234AAM000',
    address: 'Rue de la Liberté, Sousse',
    lines: [
      ['Consommation électricité', 'ELEC-BT'],
      ['Redevance compteur', 'RED-CPT'],
    ],
    taxRate: 19,
  },
  {
    code: 'TTEL',
    name: 'Télécom Horizon Tunisie',
    taxId: '0004567BAM000',
    address: 'Avenue Habib Bourguiba, Tunis',
    lines: [
      ['Abonnement fibre 100 Mo', 'FIB-100'],
      ['Forfait mobile flotte', 'MOB-FLT'],
    ],
    taxRate: 19,
  },
  {
    code: 'IMPA',
    name: 'Imprimerie El Amal',
    taxId: '0007788CAM000',
    address: 'Zone industrielle, Sfax',
    lines: [
      ['Ramette papier A4 80g', 'PAP-A4'],
      ['Cartouche toner noir', 'TON-85A'],
      ['Enveloppes kraft C4', 'ENV-C4'],
    ],
    taxRate: 19,
  },
  {
    code: 'TBS',
    name: 'Transports Ben Salah',
    taxId: '0009911DAM000',
    address: 'Route de Gabès km 4, Sfax',
    lines: [
      ['Transport marchandises Sfax-Tunis', 'TR-SFX-TUN'],
      ['Manutention palettes', 'MAN-PAL'],
    ],
    taxRate: 7,
  },
  {
    code: 'GHA',
    name: 'Garage Hamdi Auto',
    taxId: '0003322EAM000',
    address: 'Cité El Khadra, Tunis',
    lines: [
      ['Pneus 205/55R16', 'PN-20555'],
      ['Vidange et filtre à huile', 'VID-FLT'],
      ['Plaquettes de frein avant', 'PLQ-AV'],
    ],
    taxRate: 19,
  },
  {
    code: 'BES',
    name: 'Bureau Équipement Sfax',
    taxId: '0006655FAM000',
    address: 'Avenue Majida Boulila, Sfax',
    lines: [
      ['Chaise ergonomique', 'CH-ERG'],
      ['Armoire métallique 2 portes', 'ARM-2P'],
    ],
    taxRate: 19,
  },
] as const;

export const CUSTOMERS = [
  {
    code: 'CLO',
    name: 'Clinique Les Oliviers',
    taxId: '0012345GAM000',
    address: 'Route de la Marsa, Tunis',
    lines: [['Maintenance réseau informatique', 'SRV-NET']],
  },
  {
    code: 'HBA',
    name: 'Hôtel Bel Azur',
    taxId: '0015678HAM000',
    address: 'Zone touristique, Hammamet',
    lines: [['Installation caméras de surveillance', 'SRV-CAM']],
  },
  {
    code: 'PEN',
    name: 'Pharmacie Ennour',
    taxId: '0018899JAM000',
    address: 'Rue Ibn Khaldoun, Nabeul',
    lines: [['Licence logiciel de caisse', 'LIC-CAISSE']],
  },
  {
    code: 'EPM',
    name: 'École Privée Al Moustakbal',
    taxId: '0011122KAM000',
    address: 'Cité Ennasr, Ariana',
    lines: [['Formation bureautique 3 jours', 'FOR-BUR']],
  },
] as const;

const MONTHS = [1, 2, 3, 4, 5, 6];

export const MONTH_NAMES = [
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

/** Fixed amounts in millimes, as the app stores them (3 decimals). */
function money(millimes: number) {
  const sign = millimes < 0 ? '-' : '';
  const value = Math.abs(millimes);
  return `${sign}${Math.trunc(value / 1000)}.${String(value % 1000).padStart(3, '0')}`;
}

/** Small deterministic generator, so the dataset is identical on every run. */
function generator(seed: number) {
  let state = seed;
  return (min: number, max: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return min + (state % (max - min + 1));
  };
}

function day(month: number, value: number) {
  return `${EVAL_YEAR}-${String(month).padStart(2, '0')}-${String(value).padStart(2, '0')}`;
}

function totals(lines: EvalLine[], stampMillimes: number) {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    const amount = Math.round(line.quantity * line.unitPrice * 1000);
    subtotal += amount;
    tax += Math.round((amount * line.taxRate) / 100);
  }
  return {
    subtotal: money(subtotal),
    tax: money(tax),
    stamp: money(stampMillimes),
    total: money(subtotal + tax + stampMillimes),
  };
}

function buildInvoices() {
  const random = generator(20260115);
  const invoices: EvalInvoice[] = [];
  for (const month of MONTHS) {
    // Three suppliers bill each month, rotating through the list.
    for (let slot = 0; slot < 3; slot += 1) {
      const supplier = SUPPLIERS[(month + slot * 2) % SUPPLIERS.length];
      const serial = random(1000, 9999);
      const lines = supplier.lines.map(([description, reference]) => ({
        description,
        reference,
        quantity: random(1, 12),
        unitPrice: random(15, 420) + random(0, 9) / 10,
        taxRate: supplier.taxRate,
      }));
      invoices.push({
        kind: 'purchase',
        fileName: `achat-${EVAL_YEAR}-${String(month).padStart(2, '0')}-${supplier.code.toLowerCase()}-${serial}.pdf`,
        number: `${supplier.code}-${EVAL_YEAR}-${String(month).padStart(2, '0')}-${serial}`,
        issueDate: day(month, 3 + slot * 8),
        month,
        party: supplier,
        lines,
        ...totals(lines, 1000),
      });
    }
    // Two sales a month.
    for (let slot = 0; slot < 2; slot += 1) {
      const customer = CUSTOMERS[(month + slot) % CUSTOMERS.length];
      const serial = month * 10 + slot + 1;
      const lines = customer.lines.map(([description, reference]) => ({
        description,
        reference,
        quantity: random(1, 4),
        unitPrice: random(600, 2400),
        taxRate: 19,
      }));
      invoices.push({
        kind: 'sale',
        fileName: `vente-${EVAL_YEAR}-${String(month).padStart(2, '0')}-${customer.code.toLowerCase()}-${serial}.pdf`,
        number: `FV-${EVAL_YEAR}-${String(serial).padStart(3, '0')}`,
        issueDate: day(month, 10 + slot * 9),
        month,
        party: customer,
        lines,
        ...totals(lines, 1000),
      });
    }
  }
  // One credit note against a March sale.
  const creditLines = [
    {
      description: 'Avoir remise commerciale',
      reference: 'AV-REM',
      quantity: 1,
      unitPrice: 250,
      taxRate: 19,
    },
  ];
  invoices.push({
    kind: 'credit_note',
    fileName: `avoir-${EVAL_YEAR}-03-hba.pdf`,
    number: `AV-${EVAL_YEAR}-001`,
    issueDate: day(3, 28),
    month: 3,
    party: CUSTOMERS[1],
    lines: creditLines,
    ...totals(creditLines, 0),
  });
  return invoices;
}

function buildBankStatements(invoices: EvalInvoice[]) {
  const statements: EvalBankStatement[] = [];
  let balance = 18_450_250;
  for (const month of MONTHS) {
    const opening = balance;
    const transactions: EvalBankTransaction[] = [];
    const monthly = invoices.filter(
      (invoice) => invoice.month === month && invoice.kind !== 'credit_note',
    );
    for (const [index, invoice] of monthly.entries()) {
      const amount = Math.round(Number(invoice.total) * 1000);
      const isSale = invoice.kind === 'sale';
      balance += isSale ? amount : -amount;
      transactions.push({
        date: day(month, Math.min(28, Number(invoice.issueDate.slice(8)) + 5)),
        description: isSale
          ? `VIR RECU ${invoice.party.name.toUpperCase()}`
          : `VIR EMIS ${invoice.party.name.toUpperCase()}`,
        reference: `BIAT${String(month).padStart(2, '0')}${String(index + 1).padStart(3, '0')}`,
        debit: isSale ? null : money(amount),
        credit: isSale ? money(amount) : null,
        balance: money(balance),
      });
    }
    const fees = 12_500 + month * 250;
    balance -= fees;
    transactions.push({
      date: day(month, 28),
      description: 'FRAIS TENUE DE COMPTE',
      reference: `BIAT${String(month).padStart(2, '0')}FRA`,
      debit: money(fees),
      credit: null,
      balance: money(balance),
    });
    statements.push({
      kind: 'bank',
      fileName: `releve-biat-${EVAL_YEAR}-${String(month).padStart(2, '0')}.pdf`,
      month,
      bankName: 'BIAT',
      iban: 'TN5908003000512345678901',
      periodStart: day(month, 1),
      periodEnd: day(month, 28),
      opening: money(opening),
      closing: money(balance),
      transactions,
    });
  }
  return statements;
}

export const EVAL_INVOICES = buildInvoices();
export const EVAL_BANK_STATEMENTS = buildBankStatements(EVAL_INVOICES);

export function categoryFor(document: EvalInvoice | EvalBankStatement) {
  if (document.kind === 'bank') return 'RELEVES_BANCAIRES';
  return document.kind === 'purchase' ? 'FACTURES_ACHATS' : 'FACTURES_VENTES';
}

export function normalizedDataFor(
  document: EvalInvoice | EvalBankStatement,
): Record<string, unknown> {
  if (document.kind === 'bank') {
    return {
      document_type: 'bank_statement',
      currency: 'TND',
      bank_statement: {
        bank_name: document.bankName,
        iban: document.iban,
        account_number: document.iban.slice(-12),
        period_start: document.periodStart,
        period_end: document.periodEnd,
        opening_balance: document.opening,
        closing_balance: document.closing,
        transactions: document.transactions.map((transaction) => ({
          transaction_date: transaction.date,
          value_date: transaction.date,
          description: transaction.description,
          reference: transaction.reference,
          debit: transaction.debit,
          credit: transaction.credit,
          amount: transaction.credit ?? `-${transaction.debit}`,
          balance: transaction.balance,
        })),
      },
    };
  }
  const party = {
    name: document.party.name,
    tax_id: document.party.taxId,
    address: document.party.address,
  };
  const company = {
    name: 'SARL Évaluation Fiscora',
    tax_id: '0099999ZAM000',
    address: 'Les Berges du Lac, Tunis',
  };
  return {
    document_type: document.kind === 'credit_note' ? 'credit_note' : 'invoice',
    document_number: document.number,
    issue_date: document.issueDate,
    currency: 'TND',
    supplier: document.kind === 'purchase' ? party : company,
    customer: document.kind === 'purchase' ? company : party,
    subtotal_excl_tax: document.subtotal,
    tax_amount: document.tax,
    stamp_tax: document.stamp,
    total_incl_tax: document.total,
    line_items: document.lines.map((line) => ({
      description: line.description,
      reference: line.reference,
      quantity: line.quantity,
      unit_price: line.unitPrice.toFixed(3),
      tax_rate: line.taxRate,
      line_total: money(Math.round(line.quantity * line.unitPrice * 1000)),
    })),
  };
}

/** The rows exactly as the indexer would read them back from the database. */
export function evalExtractionRows(): ApprovedExtractionForIndex[] {
  return [...EVAL_INVOICES, ...EVAL_BANK_STATEMENTS].map((document) => ({
    document_id: document.fileName,
    original_name: document.fileName,
    category: categoryFor(document),
    period_year: EVAL_YEAR,
    period_month: document.month,
    normalized_data: normalizedDataFor(document),
  }));
}

export function lineTotal(line: EvalLine) {
  return money(Math.round(line.quantity * line.unitPrice * 1000));
}
