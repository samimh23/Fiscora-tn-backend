import { parsePaddleOcrResponse } from './paddle-ocr-client.service';

describe('PaddleOCR response parser', () => {
  it('accepts the compact Fiscora OCR response', () => {
    expect(
      parsePaddleOcrResponse({
        width: 768,
        height: 1024,
        tokens: [
          {
            id: 'p1_t1',
            page: 1,
            text: 'Total TTC',
            confidence: 0.98,
            bbox: [10, 20, 90, 40],
          },
        ],
      }),
    ).toEqual({
      width: 768,
      height: 1024,
      tokens: [
        {
          id: 'p1_t1',
          page: 1,
          text: 'Total TTC',
          confidence: 0.98,
          bbox: [10, 20, 90, 40],
        },
      ],
    });
  });

  it('normalizes the PP-OCR website/service response', () => {
    expect(
      parsePaddleOcrResponse({
        dataInfo: { width: 768, height: 1024 },
        ocrResults: [
          {
            prunedResult: {
              rec_texts: ['TOTAL HT:', '504,361'],
              rec_scores: [0.99, 1],
              rec_boxes: [
                [35, 721, 96, 735],
                [69, 743, 113, 758],
              ],
            },
          },
        ],
      }),
    ).toEqual({
      width: 768,
      height: 1024,
      tokens: [
        {
          id: 'p1_t1',
          page: 1,
          text: 'TOTAL HT:',
          confidence: 0.99,
          bbox: [35, 721, 96, 735],
        },
        {
          id: 'p1_t2',
          page: 1,
          text: '504,361',
          confidence: 1,
          bbox: [69, 743, 113, 758],
        },
      ],
    });
  });
});
