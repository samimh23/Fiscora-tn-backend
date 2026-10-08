import { projectTrainingAnswer, sha256 } from './training-dataset-format';
import { templateFor } from '../documents/extraction/nuextract-extraction-client.service';

describe('training answer projection', () => {
  it('keeps reviewed extraction fields but removes evidence and internal metadata', () => {
    const answer = projectTrainingAnswer(
      {
        document_type: 'invoice',
        document_number: 'A-001',
        supplier: { name: 'Test', evidence: { secret: 'x' } },
        total_incl_tax: 1191,
        ocr: { tokens: ['private'] },
        organizationId: 'secret',
        line_items: [
          { description: 'Service', quantity: '1', rowId: 'internal' },
        ],
      },
      templateFor('invoice'),
    ) as Record<string, unknown>;
    expect(answer.document_type).toBe('invoice');
    expect(answer.total_incl_tax).toBe(1191);
    expect(answer).not.toHaveProperty('ocr');
    expect(answer).not.toHaveProperty('organizationId');
    expect(answer.supplier).not.toHaveProperty('evidence');
    expect((answer.line_items as unknown[])[0]).not.toHaveProperty('rowId');
    expect(answer.amount_due).toBeNull();
  });

  it('retains bank transaction order and decimal strings', () => {
    const answer = projectTrainingAnswer(
      {
        document_type: 'bank_statement',
        bank_statement: {
          transactions: [
            { description: 'Payment', debit: '700,000' },
            { description: 'Fee', debit: '10,000' },
          ],
        },
      },
      templateFor('bank_statement'),
    ) as { bank_statement: { transactions: { debit: string }[] } };
    expect(answer.bank_statement.transactions.map((row) => row.debit)).toEqual([
      '700,000',
      '10,000',
    ]);
  });

  it('does not invent enum values or turn missing arrays into text', () => {
    expect(
      projectTrainingAnswer(
        { document_type: 'other', line_items: null },
        templateFor('invoice'),
      ),
    ).toMatchObject({ document_type: null, line_items: [] });
  });

  it('makes duplicate source groups stable', () => {
    expect(sha256(Buffer.from('same'))).toEqual(sha256('same'));
    expect(sha256('same')).not.toEqual(sha256('different'));
  });
});
