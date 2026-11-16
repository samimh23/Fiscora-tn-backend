/**
 * Evaluation questions for the synthetic dossier in `fixture.ts`.
 * Expected values are read from the fixture, so they always match the data.
 * Questions avoid the words that route to the live-ledger tools on purpose
 * where the goal is to measure document retrieval, and keep the natural
 * accountant phrasing (no accents, typos, month names) everywhere else.
 */
import type { RagEvaluationCase } from '../../assistant/rag-evaluation';
import {
  CUSTOMERS,
  EVAL_BANK_STATEMENTS,
  EVAL_INVOICES,
  EVAL_YEAR,
  type EvalInvoice,
  lineTotal,
  MONTH_NAMES,
  SUPPLIERS,
} from './fixture';

function withoutAccents(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** The ways a model commonly writes one ISO date in French. */
export function dateVariants(iso: string) {
  const [year, month, day] = iso.split('-');
  const monthName = MONTH_NAMES[Number(month)];
  const spoken = Number(day) === 1 ? '1er' : String(Number(day));
  return [
    ...new Set([
      iso,
      `${day}/${month}/${year}`,
      `${spoken} ${monthName} ${year}`,
      `${Number(day)} ${monthName} ${year}`,
      `${day} ${monthName} ${year}`,
    ]),
  ];
}

const doc = (id: string, input: Omit<RagEvaluationCase, 'id'>) => ({
  id,
  expectedScope: 'DOCUMENT',
  requireCitations: true,
  requireInlineCitations: true,
  ...input,
});

function pick<T>(items: readonly T[], count: number, offset = 0) {
  const step = Math.max(1, Math.floor(items.length / count));
  return Array.from(
    { length: Math.min(count, items.length) },
    (_, index) => items[(offset + index * step) % items.length],
  );
}

const invoices = EVAL_INVOICES.filter((item) => item.kind !== 'credit_note');
const purchases = invoices.filter((item) => item.kind === 'purchase');
const creditNote = EVAL_INVOICES.find((item) => item.kind === 'credit_note')!;

function documentsOf(name: string) {
  return EVAL_INVOICES.filter((item) => item.party.name === name).map(
    (item) => item.fileName,
  );
}

function referenceDates(): RagEvaluationCase[] {
  return pick(invoices, 15).map((invoice) =>
    doc(`ref-date-${invoice.number}`, {
      category: 'exact_reference',
      question: `Quelle est la date d’émission du document ${invoice.number} ?`,
      expectedTerms: [dateVariants(invoice.issueDate)],
      expectedSourceNames: [invoice.fileName],
    }),
  );
}

function referenceTotals(): RagEvaluationCase[] {
  return pick(invoices, 10, 1).map((invoice) =>
    doc(`ref-total-${invoice.number}`, {
      category: 'exact_reference',
      question: `Quel est le total TTC du document ${invoice.number} ?`,
      expectedNumbers: [invoice.total],
      expectedSourceNames: [invoice.fileName],
    }),
  );
}

function partyTaxIds(): RagEvaluationCase[] {
  return [...SUPPLIERS, ...CUSTOMERS].map((party, index) =>
    doc(`party-taxid-${party.code}`, {
      category: index % 2 ? 'accents_and_case' : 'party',
      // Every other question is typed lower-case and without accents.
      question:
        index % 2
          ? `matricule fiscal de ${withoutAccents(party.name).toLowerCase()} ?`
          : `Quel est le matricule fiscal de ${party.name} ?`,
      expectedTerms: [party.taxId],
      anyOfSourceNames: documentsOf(party.name),
    }),
  );
}

function linePrices(): RagEvaluationCase[] {
  return pick(invoices, 15, 2).map((invoice, index) => {
    const line = invoice.lines[index % invoice.lines.length];
    return doc(`line-price-${invoice.number}-${line.reference}`, {
      category: 'line_item',
      question: `Quel est le prix unitaire de « ${line.description} » sur le document ${invoice.number} ?`,
      expectedNumbers: [line.unitPrice.toFixed(3)],
      expectedSourceNames: [invoice.fileName],
    });
  });
}

function linesByPeriod(): RagEvaluationCase[] {
  return pick(purchases, 12, 3).map((invoice, index) => {
    const line = invoice.lines[(index + 1) % invoice.lines.length];
    const month = MONTH_NAMES[invoice.month];
    return doc(`period-line-${invoice.number}-${line.reference}`, {
      category: 'period',
      question: `Quelle quantité de « ${line.description} » a été achetée chez ${invoice.party.name} en ${month} ${EVAL_YEAR}, et quel est le total de cette ligne ?`,
      expectedNumbers: [String(line.quantity), lineTotal(line)],
      expectedSourceNames: [invoice.fileName],
    });
  });
}

const typoQueries: Array<[string, (invoice: EvalInvoice) => boolean, string]> =
  [
    [
      'abonement fibre telecom horizon',
      (i) => i.party.name.startsWith('Télécom'),
      'FIB-100',
    ],
    [
      'cartouche tonner noir imprimerie el amal',
      (i) => i.party.name.startsWith('Imprimerie'),
      'TON-85A',
    ],
    [
      'pneu 205/55 R16 garage hamdi',
      (i) => i.party.name.startsWith('Garage'),
      'PN-20555',
    ],
    [
      'plaquette frein avant garage hamdi',
      (i) => i.party.name.startsWith('Garage'),
      'PLQ-AV',
    ],
    [
      'vidange filtre huile',
      (i) => i.party.name.startsWith('Garage'),
      'VID-FLT',
    ],
    [
      'consomation electricite energie gaz sahel',
      (i) => i.party.name.startsWith('Société'),
      'ELEC-BT',
    ],
    [
      'ramettes papier a4',
      (i) => i.party.name.startsWith('Imprimerie'),
      'PAP-A4',
    ],
    [
      'transport marchandise sfax tunis ben salah',
      (i) => i.party.name.startsWith('Transports'),
      'TR-SFX-TUN',
    ],
    [
      'chaises ergonomiques bureau equipement',
      (i) => i.party.name.startsWith('Bureau'),
      'CH-ERG',
    ],
    [
      'armoire metalique deux portes',
      (i) => i.party.name.startsWith('Bureau'),
      'ARM-2P',
    ],
    [
      'manutention des palettes',
      (i) => i.party.name.startsWith('Transports'),
      'MAN-PAL',
    ],
    [
      'envelopes kraft c4',
      (i) => i.party.name.startsWith('Imprimerie'),
      'ENV-C4',
    ],
  ];

const PRODUCT_WORDS: Record<string, string> = {
  'FIB-100': 'fibre',
  'TON-85A': 'toner',
  'PN-20555': 'pneu',
  'PLQ-AV': 'plaquette',
  'VID-FLT': 'vidange',
  'ELEC-BT': 'electricit',
  'PAP-A4': 'ramette',
  'TR-SFX-TUN': 'transport',
  'CH-ERG': 'chaise',
  'ARM-2P': 'armoire',
  'MAN-PAL': 'manutention',
  'ENV-C4': 'enveloppe',
};

function typoCases(): RagEvaluationCase[] {
  return typoQueries.map(([query, match, reference]) => {
    const matching = EVAL_INVOICES.filter(match);
    return doc(`fuzzy-${reference}`, {
      category: 'typo_and_wording',
      question: `prix unitaire ${query} ?`,
      // The answer must name the product; the internal code is optional.
      expectedTerms: [[reference, PRODUCT_WORDS[reference] ?? reference]],
      anyOfSourceNames: matching.map((invoice) => invoice.fileName),
    });
  });
}

function bankCases(): RagEvaluationCase[] {
  const cases: RagEvaluationCase[] = [];
  for (const statement of EVAL_BANK_STATEMENTS) {
    const month = MONTH_NAMES[statement.month];
    cases.push(
      doc(`bank-closing-${statement.month}`, {
        category: 'bank',
        question: `Quel est le solde final du relevé BIAT de ${month} ${EVAL_YEAR} ?`,
        expectedNumbers: [statement.closing],
        expectedSourceNames: [statement.fileName],
      }),
      doc(`bank-fees-${statement.month}`, {
        category: 'bank',
        question: `Quels frais de tenue de compte la BIAT a-t-elle prélevés en ${month} ${EVAL_YEAR} ?`,
        expectedNumbers: [statement.transactions.at(-1)!.debit!],
        expectedSourceNames: [statement.fileName],
      }),
    );
  }
  for (const statement of pick(EVAL_BANK_STATEMENTS, 6, 1)) {
    const transaction = statement.transactions[1];
    cases.push(
      doc(`bank-operation-${transaction.reference}`, {
        category: 'bank',
        question: `Quel est le montant et le libellé de l’opération bancaire ${transaction.reference} ?`,
        expectedNumbers: [transaction.debit ?? transaction.credit!],
        expectedSourceNames: [statement.fileName],
      }),
    );
  }
  return cases;
}

function followUps(): RagEvaluationCase[] {
  return pick(invoices, 8, 4).map((invoice) =>
    doc(`follow-up-${invoice.number}`, {
      category: 'follow_up',
      setupQuestions: [
        `Quelle est la date d’émission du document ${invoice.number} ?`,
      ],
      question: 'Et son total TTC ?',
      expectedNumbers: [invoice.total],
      expectedSourceNames: [invoice.fileName],
    }),
  );
}

function multiDocument(): RagEvaluationCase[] {
  return [1, 3, 5].flatMap((month) => {
    const monthly = invoices.filter((invoice) => invoice.month === month);
    const sales = monthly.filter((invoice) => invoice.kind === 'sale');
    const purchases = monthly.filter((invoice) => invoice.kind === 'purchase');
    const monthName = MONTH_NAMES[month];
    return [
      doc(`multi-sales-${month}`, {
        category: 'multi_document',
        // Lists come from every approved document, not from 8 passages.
        expectedScope: 'ACCOUNTING_CALCULATION',
        question: `Quelles ventes ont été émises en ${monthName} ${EVAL_YEAR} et à quels clients ?`,
        expectedTerms: sales.map((invoice) => invoice.party.name),
        expectedSourceNames: sales.map((invoice) => invoice.fileName),
      }),
      doc(`multi-purchases-${month}`, {
        category: 'multi_document',
        // Lists come from every approved document, not from 8 passages.
        expectedScope: 'ACCOUNTING_CALCULATION',
        question: `Liste les documents d’achat de ${monthName} ${EVAL_YEAR} avec leur numéro.`,
        expectedTerms: purchases.map((invoice) => invoice.number),
        expectedSourceNames: purchases.map((invoice) => invoice.fileName),
      }),
    ];
  });
}

function creditNoteCases(): RagEvaluationCase[] {
  return [
    doc('credit-note-amount', {
      category: 'exact_reference',
      question: `Quel est le montant HT de l’avoir ${creditNote.number} et à qui a-t-il été émis ?`,
      expectedNumbers: [creditNote.subtotal],
      expectedTerms: [creditNote.party.name],
      expectedSourceNames: [creditNote.fileName],
    }),
    doc('credit-note-reason', {
      category: 'line_item',
      question: `Pourquoi un avoir a-t-il été émis pour ${creditNote.party.name} en mars ${EVAL_YEAR} ?`,
      expectedTerms: ['remise'],
      expectedSourceNames: [creditNote.fileName],
    }),
  ];
}

const unanswerable = [
  'Quel est le numéro de la police d’assurance des véhicules ?',
  `Quel est le loyer des locaux facturé en juillet ${EVAL_YEAR} ?`,
  'Quel est le salaire net de l’employé Karim Trabelsi ?',
  'Quelle est la date de la prochaine assemblée générale ?',
  `Quel est le relevé de la banque Zitouna pour mars ${EVAL_YEAR} ?`,
  'Quel est le prix unitaire des climatiseurs Samsung achetés ?',
  'Quel est le matricule fiscal de la société Les Jardins de Carthage ?',
  `Quelle est la date d’émission du document ZZZ-${EVAL_YEAR}-9999 ?`,
  'Combien de kilomètres a parcouru le camion de livraison ?',
  'Quel est le capital social inscrit au registre du commerce ?',
  'Quelle est la référence du contrat de leasing du véhicule utilitaire ?',
  `Quel est le montant de la déclaration CNSS du deuxième trimestre ${EVAL_YEAR} ?`,
  'Qui est le gérant de Garage Hamdi Auto ?',
  'Quel est le taux de change EUR/TND appliqué aux importations ?',
  'Quelle est l’adresse e-mail de Pharmacie Ennour ?',
];

function refusals(): RagEvaluationCase[] {
  return unanswerable.map((question, index) => ({
    id: `refusal-${index + 1}`,
    category: 'refusal',
    question,
    expectRefusal: true,
  }));
}

/** Counting and listing need every document, not the top passages. */
function partyCountCases(): RagEvaluationCase[] {
  const suppliers = [...new Set(purchases.map((item) => item.party.name))];
  const customers = [
    ...new Set(
      invoices
        .filter((item) => item.kind === 'sale')
        .map((item) => item.party.name),
    ),
  ];
  const exact = (id: string, question: string, names: string[]) => ({
    id,
    category: 'counting',
    question,
    expectedScope: 'ACCOUNTING_CALCULATION',
    requireCitations: true,
    requireInlineCitations: true,
    expectedNumbers: [String(names.length)],
    expectedTerms: names,
  });
  return [
    exact(
      'count-suppliers-fr',
      'Combien de fournisseurs avons-nous ?',
      suppliers,
    ),
    exact('count-suppliers-en', 'how many suplier we have', suppliers),
    exact('list-customers-fr', 'Liste des clients du dossier', customers),
  ];
}

export function buildEvaluationCases(): RagEvaluationCase[] {
  return [
    ...partyCountCases(),
    ...referenceDates(),
    ...referenceTotals(),
    ...creditNoteCases(),
    ...partyTaxIds(),
    ...linePrices(),
    ...linesByPeriod(),
    ...typoCases(),
    ...bankCases(),
    ...followUps(),
    ...multiDocument(),
    ...refusals(),
  ];
}
