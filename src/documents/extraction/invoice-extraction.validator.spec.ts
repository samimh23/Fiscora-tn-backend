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
});
