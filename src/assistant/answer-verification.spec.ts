import {
  amountWarning,
  normalizeCitations,
  unsupportedAmounts,
} from './answer-verification';

const sources = `[S1] facture.pdf
Total HT avant remise: 1000.000
TVA: 190.000
Total TTC: 1191.000
Date d’émission: 2026-03-11
Ligne 1 | quantité=12 | prix unitaire=83.500 | total=1002.000`;

describe('unsupportedAmounts', () => {
  it('accepts amounts written in any usual format', () => {
    expect(
      unsupportedAmounts(
        'Le total TTC est de 1 191,000 TND [S1], soit 1191 TND ; prix 83,5 TND.',
        sources,
      ),
    ).toEqual([]);
  });

  it('flags an amount that is not in the sources', () => {
    expect(
      unsupportedAmounts('Le total TTC est de 1 291,000 TND [S1].', sources),
    ).toEqual(['1291.000']);
  });

  it('ignores citation labels, years, dates, quantities and small integers', () => {
    expect(
      unsupportedAmounts(
        'Émise le 11/03/2026 (2026-03-11) en 2026, 12 unités, TVA 19 % [S1] [S12].',
        sources,
      ),
    ).toEqual([]);
  });

  it('flags a total the model calculated itself', () => {
    expect(
      unsupportedAmounts('Ensemble : 2193.000 TND [S1].', sources),
    ).toEqual(['2193.000']);
  });

  it('does not read a reference as an amount', () => {
    expect(
      unsupportedAmounts('Le document STEG-2026-01-4471 [S1].', sources),
    ).toEqual([]);
  });
});

describe('amountWarning', () => {
  it('is empty when every amount is supported', () => {
    expect(amountWarning([])).toBe('');
  });

  it('names the unverified amounts', () => {
    expect(amountWarning(['1291.000'])).toContain(
      'Montant non retrouvé tel quel dans les sources : 1291.000',
    );
  });
});

describe('normalizeCitations', () => {
  it.each([
    ['Émis le 28 mars [S1, S2].', 'Émis le 28 mars [S1] [S2].'],
    ['Voir [S1; S3]', 'Voir [S1] [S3]'],
    ['Voir [S2-S4]', 'Voir [S2] [S3] [S4]'],
    ['Voir [S1 et S2]', 'Voir [S1] [S2]'],
    ['Déjà correct [S1] [S2]', 'Déjà correct [S1] [S2]'],
  ])('rewrites %s', (input, expected) => {
    expect(normalizeCitations(input)).toBe(expected);
  });
});
