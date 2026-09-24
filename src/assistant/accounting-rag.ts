export interface ApprovedExtractionForIndex {
  document_id: string;
  original_name: string;
  category: string;
  period_year: number | null;
  period_month: number | null;
  normalized_data: Record<string, unknown>;
}

export interface AccountingKnowledgeChunk {
  kind:
    | 'IDENTITY'
    | 'FINANCIAL_TOTALS'
    | 'PARTIES'
    | 'LINE_ITEMS'
    | 'BANK_ACCOUNT'
    | 'BANK_TRANSACTIONS'
    | 'STRUCTURED_DATA';
  content: string;
  metadata: Record<string, unknown>;
}

const financialFields: Array<[string, string]> = [
  ['gross_subtotal_excl_tax', 'Total HT avant remise'],
  ['global_discount_amount', 'Remise globale'],
  ['global_discount_rate', 'Taux de remise globale'],
  ['subtotal_excl_tax', 'Base HT après remise'],
  ['tax_amount', 'TVA'],
  ['fodec_amount', 'FODEC'],
  ['stamp_tax', 'Timbre fiscal'],
  ['total_incl_tax', 'Total TTC'],
  ['amount_due', 'Montant dû'],
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function present(value: unknown) {
  return (
    (typeof value === 'string' && value.trim() !== '') ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function display(value: unknown, fallback: string) {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : fallback;
}

function baseMetadata(row: ApprovedExtractionForIndex) {
  const data = row.normalized_data;
  const supplier = record(data.supplier);
  return {
    category: row.category,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    documentType: data.document_type ?? null,
    documentNumber: data.document_number ?? null,
    issueDate: data.issue_date ?? null,
    currency: data.currency ?? 'TND',
    supplierName: supplier?.name ?? null,
  };
}

function identityLines(row: ApprovedExtractionForIndex) {
  const data = row.normalized_data;
  return [
    `Document: ${row.original_name}`,
    `Type: ${display(data.document_type, row.category)}`,
    `Numéro: ${display(data.document_number, 'non renseigné')}`,
    `Date d’émission: ${display(data.issue_date, 'non renseignée')}`,
    `Devise: ${display(data.currency, 'TND')}`,
    `Période dossier: ${row.period_year ?? 'non renseignée'}-${String(row.period_month ?? 0).padStart(2, '0')}`,
  ];
}

export function buildAccountingChunks(
  row: ApprovedExtractionForIndex,
): AccountingKnowledgeChunk[] {
  const data = row.normalized_data;
  const metadata = baseMetadata(row);
  const chunks: AccountingKnowledgeChunk[] = [];
  const identity = identityLines(row);

  chunks.push({
    kind: 'IDENTITY',
    content: identity.join('\n'),
    metadata: { ...metadata, kind: 'IDENTITY' },
  });

  const supplier = record(data.supplier);
  const customer = record(data.customer);
  if (supplier || customer) {
    const lines = [...identity.slice(0, 3)];
    if (supplier) {
      lines.push(
        `Fournisseur: ${display(supplier.name, 'non renseigné')}`,
        `Matricule fiscal fournisseur: ${display(supplier.tax_id, 'non renseigné')}`,
        `Adresse fournisseur: ${display(supplier.address, 'non renseignée')}`,
      );
    }
    if (customer) {
      lines.push(
        `Client: ${display(customer.name, 'non renseigné')}`,
        `Matricule fiscal client: ${display(customer.tax_id, 'non renseigné')}`,
        `Adresse client: ${display(customer.address, 'non renseignée')}`,
      );
    }
    chunks.push({
      kind: 'PARTIES',
      content: lines.join('\n'),
      metadata: { ...metadata, kind: 'PARTIES' },
    });
  }

  const totals = financialFields.filter(([field]) => present(data[field]));
  const otherTaxes = Array.isArray(data.other_taxes) ? data.other_taxes : [];
  if (totals.length || otherTaxes.length) {
    const lines = [
      ...identity.slice(0, 5),
      ...totals.map(
        ([field, label]) =>
          `${label}: ${display(data[field], 'non renseigné')}`,
      ),
    ];
    otherTaxes.forEach((item, index) => {
      const tax = record(item);
      if (tax)
        lines.push(
          `Autre taxe ${index + 1} (${display(tax.label, 'sans libellé')}): ${display(tax.amount, 'non renseigné')}`,
        );
    });
    chunks.push({
      kind: 'FINANCIAL_TOTALS',
      content: lines.join('\n'),
      metadata: {
        ...metadata,
        kind: 'FINANCIAL_TOTALS',
        financialValues: Object.fromEntries(
          totals.map(([field]) => [field, data[field]]),
        ),
      },
    });
  }

  const lineItems = Array.isArray(data.line_items) ? data.line_items : [];
  for (let offset = 0; offset < lineItems.length; offset += 5) {
    const group = lineItems.slice(offset, offset + 5);
    const lines = [...identity.slice(0, 3), 'Lignes de facture:'];
    group.forEach((value, index) => {
      const item = record(value);
      if (!item) return;
      lines.push(
        [
          `Ligne ${offset + index + 1}`,
          `description=${display(item.description, 'non renseignée')}`,
          `référence=${display(item.reference, 'non renseignée')}`,
          `quantité=${display(item.quantity, 'non renseignée')}`,
          `prix unitaire=${display(item.unit_price, 'non renseigné')}`,
          `remise=${display(item.discount_rate, 'non renseignée')}`,
          `TVA=${display(item.tax_rate, 'non renseignée')}`,
          `total=${display(item.line_total, 'non renseigné')}`,
        ].join(' | '),
      );
    });
    chunks.push({
      kind: 'LINE_ITEMS',
      content: lines.join('\n'),
      metadata: {
        ...metadata,
        kind: 'LINE_ITEMS',
        lineStart: offset + 1,
        lineEnd: Math.min(offset + group.length, lineItems.length),
      },
    });
  }

  const bankStatement = record(data.bank_statement);
  if (bankStatement) {
    const bankLines = [
      ...identity.slice(0, 3),
      `Banque: ${display(bankStatement.bank_name, 'non renseignée')}`,
      `IBAN / RIB: ${display(bankStatement.iban, 'non renseigné')}`,
      `Numéro de compte: ${display(bankStatement.account_number, 'non renseigné')}`,
      `Début de période: ${display(bankStatement.period_start, 'non renseigné')}`,
      `Fin de période: ${display(bankStatement.period_end, 'non renseignée')}`,
      `Solde initial: ${display(bankStatement.opening_balance, 'non renseigné')}`,
      `Solde final: ${display(bankStatement.closing_balance, 'non renseigné')}`,
    ];
    chunks.push({
      kind: 'BANK_ACCOUNT',
      content: bankLines.join('\n'),
      metadata: { ...metadata, kind: 'BANK_ACCOUNT' },
    });

    const transactions = Array.isArray(bankStatement.transactions)
      ? bankStatement.transactions
      : [];
    for (let offset = 0; offset < transactions.length; offset += 10) {
      const group = transactions.slice(offset, offset + 10);
      const lines = [
        ...identity.slice(0, 3),
        `Banque: ${display(bankStatement.bank_name, 'non renseignée')}`,
        'Opérations bancaires:',
      ];
      group.forEach((value, index) => {
        const transaction = record(value);
        if (!transaction) return;
        lines.push(
          [
            `Opération ${offset + index + 1}`,
            `date=${display(transaction.transaction_date, 'non renseignée')}`,
            `valeur=${display(transaction.value_date, 'non renseignée')}`,
            `libellé=${display(transaction.description, 'non renseigné')}`,
            `référence=${display(transaction.reference, 'non renseignée')}`,
            `débit=${display(transaction.debit, 'non renseigné')}`,
            `crédit=${display(transaction.credit, 'non renseigné')}`,
            `montant=${display(transaction.amount, 'non renseigné')}`,
            `solde=${display(transaction.balance, 'non renseigné')}`,
          ].join(' | '),
        );
      });
      chunks.push({
        kind: 'BANK_TRANSACTIONS',
        content: lines.join('\n'),
        metadata: {
          ...metadata,
          kind: 'BANK_TRANSACTIONS',
          transactionStart: offset + 1,
          transactionEnd: Math.min(offset + group.length, transactions.length),
        },
      });
    }
  }

  if (chunks.length === 1) {
    chunks.push({
      kind: 'STRUCTURED_DATA',
      content: `${identity.join('\n')}\nDonnées structurées validées:\n${JSON.stringify(data, null, 2)}`,
      metadata: { ...metadata, kind: 'STRUCTURED_DATA' },
    });
  }

  return chunks;
}
