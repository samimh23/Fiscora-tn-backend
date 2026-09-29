import { divideRounded, fromMillimes, multiplyRate, toMillimes } from './money';

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

  it('préserve les ajustements négatifs sans perdre un millime', () => {
    expect(toMillimes('-38.941')).toBe(-38941n);
    expect(fromMillimes(-38941n)).toBe('-38.941');
    expect(divideRounded(-38941n * 1000n, 1000n)).toBe(-38941n);
    expect(multiplyRate(-38941n, '0.07000')).toBe(-2726n);
    expect(multiplyRate(38941n, '0.07000')).toBe(2726n);
    expect(divideRounded(-1500n, 1000n)).toBe(-2n);
    expect(divideRounded(1500n, 1000n)).toBe(2n);
  });
});
