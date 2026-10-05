import {
  mergeExtractionBatches,
  ocrTokenBatches,
  parseExtractionJson,
} from './extraction-json';

describe('Extraction JSON utilities', () => {
  it('accepts schema-constrained JSON', () => {
    expect(
      parseExtractionJson('```json\n{"document_type":"bank_statement"}\n```'),
    ).toEqual({ document_type: 'bank_statement' });
  });

  it('recovers a JSON object surrounded by model commentary', () => {
    expect(
      parseExtractionJson(
        'Result follows: {"document_type":"invoice"} End of result.',
      ),
    ).toEqual({ document_type: 'invoice' });
  });

  it('reports truncated responses distinctly', () => {
    expect(() =>
      parseExtractionJson('{"document_type":"bank_statement"', 'length'),
    ).toThrow('truncated');
  });

  it('splits OCR tokens on page boundaries', () => {
    const batches = ocrTokenBatches(
      [1, 2, 3, 4, 5].map((page) => ({
        id: `p${page}_t1`,
        page,
        text: `Page ${page}`,
        confidence: 1,
        bbox: [0, 0, 10, 10] as [number, number, number, number],
      })),
      2,
    );

    expect(batches.map((batch) => batch.map((token) => token.page))).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
  });

  it('also caps a batch by compact OCR payload size', () => {
    const batches = ocrTokenBatches(
      [1, 2].map((index) => ({
        id: `p1_t${index}`,
        page: 1,
        text: 'x'.repeat(900),
        confidence: 1,
        bbox: [0, index, 10, index + 1] as [number, number, number, number],
      })),
      4,
      1_000,
    );

    expect(batches).toHaveLength(2);
  });

  it('merges header values, later totals and rows from all OCR batches', () => {
    expect(
      mergeExtractionBatches([
        {
          document_type: 'invoice',
          supplier: { name: 'Supplier', tax_id: null },
          total_incl_tax: null,
          line_items: [{ description: 'First', quantity: '1' }],
        },
        {
          document_type: 'invoice',
          supplier: { name: null, tax_id: '123' },
          total_incl_tax: '119,000',
          line_items: [{ description: 'Second', quantity: '2' }],
        },
      ]),
    ).toMatchObject({
      document_type: 'invoice',
      supplier: { name: 'Supplier', tax_id: '123' },
      total_incl_tax: '119,000',
      line_items: [
        { description: 'First', quantity: '1' },
        { description: 'Second', quantity: '2' },
      ],
    });
  });

  it('preserves absent schema fields as null after merging', () => {
    expect(
      mergeExtractionBatches([
        {
          document_type: 'invoice',
          document_number: null,
          supplier: { name: null },
          line_items: [],
        },
      ]),
    ).toEqual({
      document_type: 'invoice',
      document_number: null,
      supplier: { name: null },
      line_items: [],
    });
  });
});
