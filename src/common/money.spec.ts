import { fromMillimes, multiplyRate, toMillimes } from './money';

describe('Calculs monétaires en millimes', () => {
  it('conserve exactement les trois décimales du TND', () => {
    expect(toMillimes('1250.500')).toBe(1250500n);
    expect(fromMillimes(1250500n)).toBe('1250.500');
  });

  it('calcule un taux sans utiliser de nombres flottants', () => {
    expect(fromMillimes(multiplyRate(toMillimes('10000.000'), '0.02000'))).toBe(
      '200.000',
    );
  });
});
