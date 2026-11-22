import {
  analyzeQuestion,
  documentCodes,
  hasFilters,
  namesDocumentReference,
} from './query-filters';

describe('analyzeQuestion', () => {
  it('reads a French month and year, with or without accents', () => {
    expect(analyzeQuestion('Quelles ventes en février 2026 ?').filters).toEqual(
      { year: 2026, month: 2, category: 'FACTURES_VENTES' },
    );
    expect(analyzeQuestion('achats de fevrier').filters).toMatchObject({
      month: 2,
      category: 'FACTURES_ACHATS',
    });
    expect(analyzeQuestion('relevé de 03/2026').filters).toEqual({
      year: 2026,
      month: 3,
      category: 'RELEVES_BANCAIRES',
    });
  });

  it('does not read a year inside a document reference', () => {
    expect(
      analyzeQuestion('Total TTC du document FV-2026-013 ?').filters.year,
    ).toBeNull();
  });

  it('drops the month filter when two months are compared', () => {
    expect(
      analyzeQuestion('Compare the electricity bills of January and April 2026')
        .filters,
    ).toMatchObject({ year: 2026, month: null });
  });

  it('does not read a month inside another word', () => {
    expect(
      analyzeQuestion('Route de la Marsa, Tunis').filters.month,
    ).toBeNull();
  });

  it('leaves the kind of document open when the question mixes kinds', () => {
    expect(
      analyzeQuestion('virement reçu pour la vente à Hôtel Bel Azur').filters
        .category,
    ).toBeNull();
    expect(hasFilters(analyzeQuestion('Quel est le matricule ?').filters)).toBe(
      false,
    );
  });

  it('keeps significant, accent-free words for fuzzy matching', () => {
    expect(
      analyzeQuestion('Prix unitaire de l’abonement fibre chez Télécom ?')
        .terms,
    ).toEqual(['unitaire', 'abonement', 'fibre', 'telecom']);
  });
});

describe('document references', () => {
  it('finds invoice numbers and product codes but not years or amounts', () => {
    expect(
      documentCodes(
        'Total du document STEG-2026-01-4471 et des pneus 205/55R16 en 2026 pour 120.500 TND',
      ),
    ).toEqual(['STEG-2026-01-4471', '205/55R16']);
  });

  it('recognises a named document reference only', () => {
    expect(namesDocumentReference('Total TTC du document FV-2026-013 ?')).toBe(
      true,
    );
    expect(namesDocumentReference('Total TTC des pneus 205/55R16 ?')).toBe(
      false,
    );
    expect(namesDocumentReference('Quel est le total TTC pour 2026 ?')).toBe(
      false,
    );
    // Two letter groups before the digits are still one document.
    expect(
      namesDocumentReference(
        'Quel est le montant TTC de la facture A-CEQ-2607-014 ?',
      ),
    ).toBe(true);
    expect(namesDocumentReference('Pourquoi l’avoir AV-MD-2609-001 ?')).toBe(
      true,
    );
  });
});
