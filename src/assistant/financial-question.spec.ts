import type { ApprovedExtractionForIndex } from './accounting-rag';
import {
  aggregateFinancialQuestion,
  detectFinancialQuestion,
} from './financial-question';

const rows: ApprovedExtractionForIndex[] = [
  {
    document_id: 'invoice',
    original_name: 'facture.pdf',
    category: 'Factures achats',
    period_year: 2026,
    period_month: 9,
    normalized_data: {
      document_type: 'invoice',
      issue_date: '2026-09-10',
      currency: 'TND',
      total_incl_tax: 120,
      tax_amount: 19,
    },
  },
  {
    document_id: 'credit',
    original_name: 'avoir.pdf',
    category: 'Factures achats',
    period_year: 2026,
    period_month: 9,
    normalized_data: {
      document_type: 'credit_note',
      issue_date: '2026-09-12',
      currency: 'TND',
      total_incl_tax: 20,
      tax_amount: 3,
    },
  },
];

describe('financial question routing', () => {
  it('detects a period-specific TTC aggregation', () => {
    expect(
      detectFinancialQuestion('Quel est le total TTC de septembre 2026 ?'),
    ).toMatchObject({
      operation: 'SUM',
      field: 'total_incl_tax',
      year: 2026,
      month: 9,
    });
  });

  it('calculates in millimes and subtracts credit notes', () => {
    const intent = detectFinancialQuestion(
      'Quel est le total TTC de septembre 2026 ?',
    )!;
    const result = aggregateFinancialQuestion(rows, intent);
    expect(result?.answer).toContain('100.000 TND');
    expect(result?.rows).toHaveLength(2);
  });

  it('does not route descriptive questions to deterministic totals', () => {
    expect(
      detectFinancialQuestion('Quels fournisseurs apparaissent ?'),
    ).toBeNull();
  });
});
