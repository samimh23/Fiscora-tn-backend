import {
  extractionInstructions,
  parseQwenExtractionJson,
} from './qwen-extraction-client.service';

describe('Qwen extraction contract', () => {
  it('accepts schema-constrained JSON', () => {
    expect(
      parseQwenExtractionJson(
        '```json\n{"document_type":"bank_statement"}\n```',
      ),
    ).toEqual({ document_type: 'bank_statement' });
  });

  it('recovers a JSON object surrounded by model commentary', () => {
    expect(
      parseQwenExtractionJson(
        'Result follows: {"document_type":"invoice"} End of result.',
      ),
    ).toEqual({ document_type: 'invoice' });
  });

  it('reports truncated responses distinctly', () => {
    expect(() =>
      parseQwenExtractionJson('{"document_type":"bank_statement"', 'length'),
    ).toThrow('truncated');
  });

  it('provides the canonical Fiscora extraction schema', () => {
    const prompt = extractionInstructions();

    expect(prompt).toContain('"document_type": "invoice"');
    expect(prompt).toContain('"supplier"');
    expect(prompt).toContain('"line_items"');
    expect(prompt).toContain('"bank_statement"');
    expect(prompt).toContain('"transactions"');
    expect(prompt).toContain('spaces, commas and points');
    expect(prompt).toContain('Return JSON only');
  });
});
