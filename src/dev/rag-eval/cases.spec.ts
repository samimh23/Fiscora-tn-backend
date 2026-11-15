import { buildAccountingChunks } from '../../assistant/accounting-rag';
import { buildEvaluationCases } from './cases';
import { evalExtractionRows } from './fixture';

describe('RAG evaluation dataset', () => {
  const cases = buildEvaluationCases();
  const rows = evalExtractionRows();
  const indexedText = new Map(
    rows.map((row) => [
      row.original_name,
      buildAccountingChunks(row)
        .map((chunk) => chunk.content)
        .join('\n'),
    ]),
  );

  it('is large enough and has unique ids', () => {
    expect(cases.length).toBeGreaterThanOrEqual(100);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect(
      cases.filter((item) => item.expectRefusal).length,
    ).toBeGreaterThanOrEqual(10);
  });

  it('only names documents that exist in the fixture', () => {
    for (const testCase of cases) {
      for (const name of [
        ...(testCase.expectedSourceNames ?? []),
        ...(testCase.anyOfSourceNames ?? []),
      ]) {
        expect(indexedText.has(name)).toBe(true);
      }
    }
  });

  it('expects only numbers that the indexed chunks really contain', () => {
    for (const testCase of cases) {
      const names = [
        ...(testCase.expectedSourceNames ?? []),
        ...(testCase.anyOfSourceNames ?? []),
      ];
      const text = names.map((name) => indexedText.get(name)).join('\n');
      for (const value of testCase.expectedNumbers ?? []) {
        expect({ id: testCase.id, found: text.includes(value) }).toEqual({
          id: testCase.id,
          found: true,
        });
      }
    }
  });

  it('keeps the expected answers out of the refusal questions', () => {
    const allText = [...indexedText.values()].join('\n').toLowerCase();
    expect(allText).not.toContain('zitouna');
    expect(allText).not.toContain('juillet');
    expect(allText).not.toContain('zzz-2026-9999');
  });
});
