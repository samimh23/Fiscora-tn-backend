import { parseNuExtractJson } from './nuextract-client.service';

describe('parseNuExtractJson', () => {
  it('accepts JSON wrapped in answer and markdown tags', () => {
    expect(
      parseNuExtractJson(
        '<answer>```json\n{"document_type":"bank_statement"}\n```</answer>',
      ),
    ).toEqual({ document_type: 'bank_statement' });
  });

  it('recovers a JSON object surrounded by model commentary', () => {
    expect(
      parseNuExtractJson(
        'Result follows: {"document_type":"invoice"} End of result.',
      ),
    ).toEqual({ document_type: 'invoice' });
  });

  it('reports truncated responses distinctly', () => {
    expect(() =>
      parseNuExtractJson('{"document_type":"bank_statement"', 'length'),
    ).toThrow('truncated');
  });
});
