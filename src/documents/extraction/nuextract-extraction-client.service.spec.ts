import {
  nuextractInstructions,
  nuextractOcrInstructions,
  templateFor,
} from './nuextract-extraction-client.service';

describe('NuExtract extraction contract', () => {
  it('uses a fixed invoice-only template', () => {
    const template = templateFor('invoice');

    expect(template).toMatchObject({
      document_type: ['invoice', 'credit_note', 'receipt'],
      tax_amount: 'verbatim-string',
      line_items: [
        expect.objectContaining({
          description: 'verbatim-string',
          tax_rate: 'verbatim-string',
        }),
      ],
    });
    expect(template).not.toHaveProperty('bank_statement');
  });

  it('uses a fixed bank-statement-only template', () => {
    const template = templateFor('bank_statement');

    expect(template).toMatchObject({
      document_type: ['bank_statement'],
      bank_statement: {
        transactions: [
          expect.objectContaining({
            description: 'verbatim-string',
            debit: 'verbatim-string',
            credit: 'verbatim-string',
          }),
        ],
      },
    });
    expect(template).not.toHaveProperty('line_items');
  });

  it('keeps OCR coordinates in the input but not in the output template', () => {
    const prompt = nuextractOcrInstructions(
      'invoice',
      [
        {
          id: 'p1_t1',
          page: 1,
          text: 'Total TVA 95,639',
          confidence: 0.99,
          bbox: [10, 20, 30, 40],
        },
      ],
      0,
      1,
    );

    expect(prompt).toContain('OCR_INPUT');
    expect(prompt).toContain('p1_t1');
    expect(prompt).toContain('95,639');
    expect(templateFor('invoice')).not.toHaveProperty('_evidence');
  });

  it('includes validation failures in a targeted reread', () => {
    const prompt = nuextractInstructions('bank_statement', [
      { field: 'transactions.0', message: 'Debit and credit both present' },
    ]);

    expect(prompt).toContain('previous extraction failed');
    expect(prompt).toContain('transactions.0');
    expect(prompt).toContain('Debit and credit both present');
  });

  it('prevents bank identifiers from being mapped as fiscal identifiers', () => {
    const prompt = nuextractInstructions('invoice');

    expect(prompt).toContain('matricule fiscal');
    expect(prompt).toContain('Never use an IBAN, RIB');
  });
});
