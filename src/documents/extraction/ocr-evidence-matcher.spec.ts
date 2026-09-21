import { attachOcrEvidence, type OcrDocument } from './ocr-evidence-matcher';

describe('OCR evidence matcher', () => {
  const document: OcrDocument = {
    width: 768,
    height: 1024,
    tokens: [
      {
        id: 'p1_t60',
        page: 1,
        text: 'Timbre fiscal: 1,000',
        confidence: 0.99,
        bbox: [612, 730, 723, 743],
      },
      {
        id: 'p1_t64',
        page: 1,
        text: '95,639',
        confidence: 1,
        bbox: [432, 743, 471, 758],
      },
      {
        id: 'p1_t66',
        page: 1,
        text: 'TVA:95,639',
        confidence: 1,
        bbox: [655, 790, 723, 807],
      },
      {
        id: 'p1_t68',
        page: 1,
        text: 'TTC:600,000 DNT',
        confidence: 0.98,
        bbox: [621, 823, 723, 836],
      },
      {
        id: 'p1_t73',
        page: 1,
        text: 'MF:1184751K/B/M/000',
        confidence: 1,
        bbox: [499, 864, 617, 874],
      },
      {
        id: 'p1_t47',
        page: 1,
        text: '19',
        confidence: 1,
        bbox: [713, 387, 731, 404],
      },
      {
        id: 'p1_t63',
        page: 1,
        text: '19',
        confidence: 1,
        bbox: [335, 743, 352, 757],
      },
    ],
  };

  it('uses a unique exact or contained OCR value and normalizes its box', () => {
    const result = attachOcrEvidence(
      {
        supplier: { tax_id: '1184751K/B/M/000' },
        stamp_tax: '1.000',
        total_incl_tax: '600.000',
      },
      document,
    );
    expect(result._evidence).toMatchObject({
      'supplier.tax_id': { tokenIds: ['p1_t73'], status: 'MATCHED' },
      stamp_tax: { tokenIds: ['p1_t60'], status: 'MATCHED' },
      total_incl_tax: { tokenIds: ['p1_t68'], status: 'MATCHED' },
    });
  });

  it('prefers one exact token over a second token that only contains the value', () => {
    const result = attachOcrEvidence({ tax_amount: '95,639' }, document);
    expect(result._evidence).toMatchObject({
      tax_amount: { tokenIds: ['p1_t64'] },
    });
  });

  it('does not highlight ambiguous duplicate values', () => {
    const result = attachOcrEvidence(
      { line_items: [{ tax_rate: '19' }] },
      document,
    );
    expect(result._evidence).toEqual({});
  });
});
