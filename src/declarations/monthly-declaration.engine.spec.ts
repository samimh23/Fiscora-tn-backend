import {
  calculateDeclarationTotal,
  calculateVatPosition,
  previousPeriod,
} from './monthly-declaration.engine';

describe('moteur de déclaration mensuelle', () => {
  it('calcule une TVA à payer', () => {
    expect(calculateVatPosition(19_000n, 7_000n, 2_000n)).toEqual({
      vatDue: 10_000n,
      vatCreditNext: 0n,
    });
  });

  it('reporte un crédit de TVA', () => {
    expect(calculateVatPosition(5_000n, 8_000n, 1_000n)).toEqual({
      vatDue: 0n,
      vatCreditNext: 4_000n,
    });
  });

  it('additionne les taxes sans perdre les millimes', () => {
    expect(
      calculateDeclarationTotal({
        vatDue: 10_125n,
        withholdingTax: 2_500n,
        tfpDue: 1_000n,
        foprolosDue: 500n,
        tclDue: 200n,
        stampDuty: 1_000n,
      }),
    ).toBe(15_325n);
  });

  it('traverse correctement le changement d’année', () => {
    expect(previousPeriod(2026, 1)).toEqual({ year: 2025, month: 12 });
    expect(previousPeriod(2026, 7)).toEqual({ year: 2026, month: 6 });
  });
});
