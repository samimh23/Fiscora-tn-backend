import { InvoiceExtractionValidator } from './invoice-extraction.validator';

describe('InvoiceExtractionValidator', () => {
  const validator = new InvoiceExtractionValidator();

  it('accepts a balanced Tunisian invoice without blocking issues', () => {
    const result = validator.validate({
      document_type: 'invoice',
      supplier: { name: 'TOPNET' },
      document_number: 'F-2026-001',
      issue_date: '2026-09-15',
      subtotal_excl_tax: 100,
      tax_amount: 19,
      stamp_tax: 1,
      total_incl_tax: 120,
      amount_due: 120,
      line_items: [{ quantity: 2, unit_price: 50, line_total: 100 }],
    });

    expect(result.issues.filter((issue) => issue.severity === 'ERROR')).toEqual(
      [],
    );
  });

  it('blocks inconsistent totals', () => {
    const result = validator.validate({
      document_type: 'invoice',
      supplier: { name: 'Supplier' },
      issue_date: '2026-09-15',
      subtotal_excl_tax: '100,000',
      tax_amount: '19,000',
      stamp_tax: '1,000',
      total_incl_tax: '150,000',
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TOTAL_MISMATCH', severity: 'ERROR' }),
      ]),
    );
  });

  it('includes FODEC and supplementary taxes in the invoice balance', () => {
    const result = validator.validate({
      document_type: 'invoice',
      supplier: { name: 'E-INFO Expert' },
      document_number: 'FAC-2025-36117',
      issue_date: '2026-06-09',
      subtotal_excl_tax: 1014.239,
      tax_amount: 94.665,
      fodec_amount: 0.303,
      stamp_tax: 1,
      other_taxes: [],
      total_incl_tax: 1110.207,
      amount_due: 1110.207,
    });

    expect(result.issues.filter((issue) => issue.severity === 'ERROR')).toEqual(
      [],
    );
  });

  it('includes named non-FODEC taxes without double counting', () => {
    const result = validator.validate({
      document_type: 'invoice',
      supplier: { name: 'Supplier' },
      issue_date: '2026-09-15',
      subtotal_excl_tax: 100,
      tax_amount: 19,
      fodec_amount: 1,
      stamp_tax: 1,
      other_taxes: [{ label: 'Droit complémentaire', amount: 2.5 }],
      total_incl_tax: 123.5,
    });

    expect(result.issues.filter((issue) => issue.severity === 'ERROR')).toEqual(
      [],
    );
  });

  it('preserves a global discount and separates TTC from net payable', () => {
    const result = validator.validate({
      document_type: 'invoice',
      supplier: { name: 'LEADERSOFT Sarl' },
      document_number: 'FV2018/00063',
      issue_date: '2018-05-05',
      gross_subtotal_excl_tax: '1 398,000',
      global_discount_amount: '139,800',
      global_discount_rate: '10 %',
      subtotal_excl_tax: '1 258,200',
      tax_amount: '239,058',
      stamp_tax: '0,600',
      total_incl_tax: '1 497,258',
      amount_due: '1 497,858',
      line_items: [
        {
          description: 'ARTICLE 1',
          quantity: 1,
          unit_price: '120,000',
          discount_rate: '10 %',
          line_total: '108,000',
        },
      ],
    });

    expect(result.issues.filter((issue) => issue.severity === 'ERROR')).toEqual(
      [],
    );
    expect(result.normalizedData).toMatchObject({
      gross_subtotal_excl_tax: 1398,
      global_discount_amount: 139.8,
      global_discount_rate: 0.1,
      subtotal_excl_tax: 1258.2,
      total_incl_tax: 1497.258,
      amount_due: 1497.858,
      line_items: [expect.objectContaining({ discount_rate: 0.1 })],
    });
  });

  it('normalizes Tunisian monetary strings without multiplying them by 1000', () => {
    const result = validator.validate({
      document_type: 'invoice',
      supplier: { name: 'STE MYTEK INFORMATIQUE' },
      document_number: 'FAC-24M04LIV-123987',
      issue_date: '2024-04-29',
      subtotal_excl_tax: '3 782,353',
      tax_amount: '718,647',
      stamp_tax: '1,000',
      total_incl_tax: '4 502,000 TND',
      amount_due: '4 502,000',
      line_items: [
        {
          description: 'HP 250 G9',
          quantity: 2,
          unit_price: '1.459,000',
          line_total: '2 918,000',
        },
      ],
    });

    expect(result.issues.filter((issue) => issue.severity === 'ERROR')).toEqual(
      [],
    );
    expect(result.normalizedData).toMatchObject({
      subtotal_excl_tax: 3782.353,
      tax_amount: 718.647,
      stamp_tax: 1,
      total_incl_tax: 4502,
      amount_due: 4502,
      line_items: [
        expect.objectContaining({
          quantity: 2,
          unit_price: 1459,
          line_total: 2918,
        }),
      ],
    });
  });

  it('reports the real one-dinar mismatch in a contradictory printed invoice', () => {
    const result = validator.validate({
      document_type: 'invoice',
      supplier: { name: 'STE MYTEK INFORMATIQUE' },
      document_number: 'FAC-24M04LIV-123987',
      issue_date: '2024-04-29',
      subtotal_excl_tax: '3 782,353',
      tax_amount: '718,647',
      stamp_tax: '1,000',
      total_incl_tax: '4 500,000',
    });

    const mismatch = result.issues.find(
      (issue) => issue.code === 'TOTAL_MISMATCH',
    );
    expect(mismatch).toMatchObject({ severity: 'ERROR' });
    expect(mismatch?.message).toContain('1.000');
  });

  it('warns when identity fields are missing', () => {
    const result = validator.validate({});
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'DOCUMENT_TYPE_MISSING',
        'SUPPLIER_MISSING',
        'DOCUMENT_NUMBER_MISSING',
        'ISSUE_DATE_INVALID',
      ]),
    );
  });

  it('normalizes a balanced bank statement without invoice-only errors', () => {
    const result = validator.validate({
      document_type: 'bank_statement',
      currency: 'TND',
      bank_statement: {
        bank_name: 'BIAT',
        iban: 'TN5901000000000000000000',
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        opening_balance: '1 000,000',
        closing_balance: '1 125,000',
        transactions: [
          {
            transaction_date: '2026-06-10',
            description: 'Virement client',
            credit: '250,000',
          },
          {
            transaction_date: '2026-06-12',
            description: 'Frais bancaires',
            debit: '125,000',
          },
        ],
      },
    });

    expect(result.issues.filter((issue) => issue.severity === 'ERROR')).toEqual(
      [],
    );
    expect(result.normalizedData.bank_statement).toMatchObject({
      opening_balance: 1000,
      closing_balance: 1125,
      transactions: [
        expect.objectContaining({ amount: 250 }),
        expect.objectContaining({ amount: -125 }),
      ],
    });
    expect(result.issues.map((issue) => issue.code)).not.toContain(
      'SUPPLIER_MISSING',
    );
  });

  it('blocks an inconsistent bank closing balance', () => {
    const result = validator.validate({
      document_type: 'bank_statement',
      bank_statement: {
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        opening_balance: 100,
        closing_balance: 999,
        transactions: [
          {
            transaction_date: '2026-06-15',
            description: 'Versement',
            amount: 50,
          },
        ],
      },
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'BANK_CLOSING_BALANCE_MISMATCH',
          severity: 'ERROR',
        }),
      ]),
    );
  });
});
