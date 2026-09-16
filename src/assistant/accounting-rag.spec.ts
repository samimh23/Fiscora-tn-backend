import { buildAccountingChunks } from './accounting-rag';

describe('buildAccountingChunks', () => {
  it('creates accounting-aware identity, party, totals and line chunks', () => {
    const chunks = buildAccountingChunks({
      document_id: 'doc-1',
      original_name: 'facture.pdf',
      category: 'Factures achats',
      period_year: 2026,
      period_month: 9,
      normalized_data: {
        document_type: 'invoice',
        document_number: 'FAC-42',
        issue_date: '2026-09-10',
        currency: 'TND',
        supplier: { name: 'Fournisseur Test', tax_id: '1234567A' },
        subtotal_excl_tax: 100,
        tax_amount: 19,
        stamp_tax: 1,
        total_incl_tax: 120,
        line_items: Array.from({ length: 6 }, (_, index) => ({
          description: `Article ${index + 1}`,
          quantity: 1,
          unit_price: 10,
          line_total: 10,
        })),
      },
    });

    expect(chunks.map((chunk) => chunk.kind)).toEqual([
      'IDENTITY',
      'PARTIES',
      'FINANCIAL_TOTALS',
      'LINE_ITEMS',
      'LINE_ITEMS',
    ]);
    expect(chunks[2].content).toContain('Total TTC: 120');
    expect(chunks[3].metadata).toMatchObject({ lineStart: 1, lineEnd: 5 });
    expect(chunks[4].metadata).toMatchObject({ lineStart: 6, lineEnd: 6 });
  });

  it('retains unknown approved structures in a fallback chunk', () => {
    const chunks = buildAccountingChunks({
      document_id: 'doc-2',
      original_name: 'piece.json',
      category: 'Autre',
      period_year: null,
      period_month: null,
      normalized_data: { custom_field: 'valeur validée' },
    });
    expect(chunks).toHaveLength(2);
    expect(chunks[1].kind).toBe('STRUCTURED_DATA');
    expect(chunks[1].content).toContain('valeur validée');
  });
});
