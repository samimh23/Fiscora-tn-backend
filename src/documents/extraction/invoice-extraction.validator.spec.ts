import { InvoiceExtractionValidator } from './invoice-extraction.validator';

describe('InvoiceExtractionValidator', () => {
  const validator = new InvoiceExtractionValidator();
  const septemberStatement = {
    currency: 'TND',
    bank_statement: {
      period_start: '01/09/2026',
      period_end: '30/09/2026',
      opening_balance: '5000,000',
      closing_balance: '5224,800',
      transactions: [
        {
          transaction_date: '15/09/2026',
          description: 'ATLAS',
          credit: '1000,000',
        },
        {
          transaction_date: '18/09/2026',
          description: 'CARTHAGE',
          debit: '700,000',
        },
        {
          transaction_date: '24/09/2026',
          description: 'SAHEL',
          debit: '65,200',
        },
        {
          transaction_date: '30/09/2026',
          description: 'Frais',
          debit: '10,000',
        },
      ],
    },
  };

  it.each([
    { documentType: 'bank_statement' },
    { documentType: ['bank_statement'] },
    { documentType: ' BANK_STATEMENT ' },
  ])(
    'normalizes the bank document type %j and runs bank-only controls',
    ({ documentType }) => {
      const input = { ...septemberStatement, document_type: documentType };
      const original = structuredClone(input);
      const result = validator.validate(input);
      expect(result.normalizedData).toMatchObject({
        document_type: 'bank_statement',
        bank_statement: {
          period_start: '2026-09-01',
          period_end: '2026-09-30',
          opening_balance: 5000,
          closing_balance: 5224.8,
          transactions: [
            expect.objectContaining({ amount: 1000 }),
            expect.objectContaining({ amount: -700 }),
            expect.objectContaining({ amount: -65.2 }),
            expect.objectContaining({ amount: -10 }),
          ],
        },
      });
      expect(result.issues).toEqual([]);
      expect(input).toEqual(original);
    },
  );

  it.each([
    { documentType: [] },
    { documentType: ['bank_statement', 'invoice'] },
    { documentType: [['bank_statement']] },
    { documentType: ['unknown'] },
    { documentType: { type: 'bank_statement' } },
    { documentType: 'unknown' },
  ])(
    'rejects an invalid or ambiguous document type %j rather than guessing',
    ({ documentType }) => {
      const result = validator.validate({
        ...septemberStatement,
        document_type: documentType,
      });
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'DOCUMENT_TYPE_INVALID',
          severity: 'ERROR',
        }),
      );
      expect(result.normalizedData.document_type).not.toBe('bank_statement');
    },
  );

  it('still blocks an inconsistent bank balance after repairing the type', () => {
    const result = validator.validate({
      ...septemberStatement,
      document_type: ['bank_statement'],
      bank_statement: {
        ...septemberStatement.bank_statement,
        closing_balance: '9999,000',
      },
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'BANK_CLOSING_BALANCE_MISMATCH',
        severity: 'ERROR',
      }),
    );
  });

  it('unwraps a legacy invoice classification without changing its identity', () => {
    expect(
      validator.validate({ document_type: ['credit_note'] }).normalizedData
        .document_type,
    ).toBe('credit_note');
  });

  it.each(['BIENS', 'SERVICES', 'MIXTE'])(
    'keeps a valid invoice nature suggestion: %s',
    (nature) => {
      expect(
        validator.validate({ invoice_nature: nature }).normalizedData
          .invoice_nature,
      ).toBe(nature);
    },
  );

  it('aggregates nature across merged page lines including negative adjustments', () => {
    const input = {
      invoice_nature: 'SERVICES',
      line_items: [
        {
          description: 'Abonnement internet',
          unit_price: '-38.941',
          item_nature: 'SERVICES',
        },
        { description: 'Routeur', unit_price: '94.374', item_nature: 'BIENS' },
      ],
    };
    const result = validator.validate(input);
    expect(result.normalizedData.invoice_nature).toBe('MIXTE');
    expect(
      (result.normalizedData.line_items as Array<Record<string, unknown>>)[0]
        .unit_price,
    ).toBe(-38.941);
    expect(input.invoice_nature).toBe('SERVICES');
  });

  it.each(['INDETERMINE', 'invalid', null])(
    'requires manual selection for an uncertain nature: %s',
    (nature) => {
      const result = validator.validate({ invoice_nature: nature });
      expect(result.normalizedData.invoice_nature).toBe('INDETERMINE');
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'INVOICE_NATURE_UNCERTAIN',
          severity: 'WARNING',
        }),
      );
    },
  );

  it('does not trust a global category when a line is ambiguous', () => {
    const result = validator.validate({
      invoice_nature: 'BIENS',
      line_items: [{ item_nature: 'BIENS' }, { item_nature: null }],
    });
    expect(result.normalizedData.invoice_nature).toBe('INDETERMINE');
  });

  it('does not add a nature suggestion to legacy extractions', () => {
    expect(
      validator.validate({ line_items: [{ description: 'Ancienne pièce' }] })
        .normalizedData,
    ).not.toHaveProperty('invoice_nature');
  });

  it.each([
    ['26/03/2024', '2024-03-26'],
    ['03/04/2024', '2024-04-03'],
    ['29/02/2024', '2024-02-29'],
    ['2024-03-26', '2024-03-26'],
  ])(
    'normalizes the printed date %s without guessing month/day order',
    (printed, expected) => {
      const result = validator.validate({ issue_date: printed });
      expect(result.normalizedData.issue_date).toBe(expected);
      expect(
        result.issues.some((issue) => issue.code === 'ISSUE_DATE_INVALID'),
      ).toBe(false);
    },
  );

  it.each(['31/04/2024', '29/02/2023', '2024-02-30', '13/13/2024'])(
    'rejects an impossible date %s',
    (printed) => {
      expect(validator.validate({ issue_date: printed }).issues).toContainEqual(
        expect.objectContaining({ code: 'ISSUE_DATE_INVALID' }),
      );
    },
  );

  it('does not turn the MYTEK stamp/subtotal difference into a discount or change printed TTC', () => {
    const result = validator.validate({
      document_type: 'invoice',
      supplier: { name: 'STE MYTEK INFORMATIQUE' },
      issue_date: '26/03/2024',
      gross_subtotal_excl_tax: '504,361',
      subtotal_excl_tax: '503,361',
      global_discount_amount: null,
      global_discount_rate: null,
      tax_amount: '95,639',
      stamp_tax: '1,000',
      total_incl_tax: '600,000',
      amount_due: null,
    });
    expect(result.normalizedData).toMatchObject({
      issue_date: '2024-03-26',
      global_discount_amount: null,
      global_discount_rate: null,
      total_incl_tax: 600,
      amount_due: null,
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'SUBTOTAL_DIFFERENCE_UNEXPLAINED',
        severity: 'WARNING',
      }),
    );
    expect(result.issues.some((issue) => issue.code === 'TOTAL_MISMATCH')).toBe(
      false,
    );
  });

  it('does not fill missing subtotals or discount rates even when they could be calculated', () => {
    const result = validator.validate({
      gross_subtotal_excl_tax: '100,000',
      global_discount_amount: '10,000',
      global_discount_rate: null,
      subtotal_excl_tax: null,
    });
    expect(result.normalizedData).toMatchObject({
      global_discount_amount: 10,
      global_discount_rate: null,
      subtotal_excl_tax: null,
    });
  });

  it('removes empty, repeated and standard additional fields and remaps remaining evidence', () => {
    const result = validator.validate({
      additional_fields: [
        { label: 'Date', value: '26/03/2024' },
        { label: 'Numéro pièce', value: 'FAC-1' },
        { label: 'PU TTC', value: '599,000' },
        { label: 'Code à Barre', value: '' },
        { label: 'Mode de règlement', value: 'CAISSE' },
        { label: 'Mode de règlement', value: 'CAISSE' },
        { label: 'Transporteur', value: 'Par vos soins.' },
        { label: '', value: 'junk' },
      ],
      _evidence: {
        'additional_fields.0.value': { tokenIds: ['date'] },
        'additional_fields.4.value': { tokenIds: ['payment'] },
        issue_date: { tokenIds: ['date'] },
      },
    });
    expect(result.normalizedData.additional_fields).toEqual([
      { label: 'Mode de règlement', value: 'CAISSE' },
      { label: 'Transporteur', value: 'Par vos soins.' },
    ]);
    expect(result.normalizedData._evidence).toEqual({
      'additional_fields.0.value': { tokenIds: ['payment'] },
      issue_date: { tokenIds: ['date'] },
    });
  });

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
