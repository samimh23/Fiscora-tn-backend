import { convertForeignToTnd, normalizeCurrency } from './currency';

describe('currency engine', () => {
  it('convertit un montant en TND avec arrondi au millime', () => {
    expect(convertForeignToTnd('100.000', '3.35670000')).toBe('335.670');
    expect(convertForeignToTnd('12.345', '3.10000000')).toBe('38.270');
  });

  it('normalise le code devise', () => {
    expect(normalizeCurrency(' eur ')).toBe('EUR');
  });
});
