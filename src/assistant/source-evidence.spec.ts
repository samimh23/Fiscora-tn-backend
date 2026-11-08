import { sourcePages } from './source-evidence';

describe('citation page evidence', () => {
  const matched = (page: number) => ({ status: 'MATCHED', page });
  it('uses stored page information when present', () => {
    expect(sourcePages({}, null, 3)).toEqual([3]);
  });
  it('does not invent page 1 when mapping is missing or unmatched', () => {
    expect(sourcePages({}, null, null)).toEqual([]);
    expect(
      sourcePages(
        { kind: 'IDENTITY' },
        { document_number: { status: 'MISSING', page: 1 } },
        null,
      ),
    ).toEqual([]);
  });
  it('keeps all relevant pages for a chunk spanning pages', () => {
    expect(
      sourcePages(
        {
          kind: 'FINANCIAL_TOTALS',
          financialValues: { tax_amount: 19, total_incl_tax: 119 },
        },
        {
          tax_amount: matched(3),
          total_incl_tax: matched(2),
          document_number: matched(1),
        },
        null,
      ),
    ).toEqual([2, 3]);
  });
  it('selects only the exact line and transaction ranges in the chunk', () => {
    const evidence = {
      'line_items.0.description': matched(1),
      'line_items.1.description': matched(2),
      'bank_statement.transactions.2.debit': matched(4),
    };
    expect(
      sourcePages(
        { kind: 'LINE_ITEMS', lineStart: 2, lineEnd: 2 },
        evidence,
        null,
      ),
    ).toEqual([2]);
    expect(
      sourcePages(
        { kind: 'BANK_TRANSACTIONS', transactionStart: 3, transactionEnd: 3 },
        evidence,
        null,
      ),
    ).toEqual([4]);
  });
});
