import { FinancialStatementSection } from '../database/entities';
import {
  ALLOWED_FINANCIAL_STATEMENT_LINE_CODES,
  DEFAULT_FINANCIAL_NOTE_DEFINITIONS,
} from './financial-statement-note-definitions';

describe('Définitions des notes aux états financiers', () => {
  it('fournit dix notes numérotées sans doublon', () => {
    expect(DEFAULT_FINANCIAL_NOTE_DEFINITIONS).toHaveLength(10);
    expect(
      new Set(DEFAULT_FINANCIAL_NOTE_DEFINITIONS.map((item) => item.noteNumber))
        .size,
    ).toBe(10);
    expect(
      DEFAULT_FINANCIAL_NOTE_DEFINITIONS.map((item) => item.noteNumber),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('relie les immobilisations à leur rubrique du bilan', () => {
    const note = DEFAULT_FINANCIAL_NOTE_DEFINITIONS.find(
      (item) => item.code === 'IMMOBILISATIONS',
    );
    expect(note?.statementLineCodes).toContain(
      FinancialStatementSection.BalanceTangibleAssets,
    );
    expect(
      note?.statementLineCodes.every((code) =>
        ALLOWED_FINANCIAL_STATEMENT_LINE_CODES.has(code),
      ),
    ).toBe(true);
  });

  it('rend obligatoires les informations non déductibles des écritures', () => {
    const requiredCodes = DEFAULT_FINANCIAL_NOTE_DEFINITIONS.filter(
      (item) => item.isRequired,
    ).map((item) => item.code);
    expect(requiredCodes).toEqual([
      'METHODES_COMPTABLES',
      'ENGAGEMENTS_HORS_BILAN',
      'EVENTUALITES_LITIGES',
      'EVENEMENTS_POSTERIEURS',
    ]);
  });
});
