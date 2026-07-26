import { DepreciationMethod } from '../database/entities';
import { generateDepreciationPlan } from './depreciation.engine';

describe('generateDepreciationPlan', () => {
  it('compare un plan comptable de 12 mois à un plan fiscal de 24 mois', () => {
    const plan = generateDepreciationPlan({
      acquisitionCost: '1200.000',
      residualValue: '0.000',
      serviceDate: '2026-01-01',
      accountingMethod: DepreciationMethod.StraightLine,
      usefulLifeMonths: 12,
      fiscalMethod: DepreciationMethod.StraightLine,
      fiscalUsefulLifeMonths: 24,
    });

    expect(plan).toHaveLength(24);
    expect(plan[0]).toMatchObject({
      periodYear: 2026,
      periodMonth: 1,
      accountingAmount: '100.000',
      fiscalAmount: '50.000',
      temporaryDifference: '50.000',
      netBookValue: '1100.000',
    });
    expect(plan[11].netBookValue).toBe('0.000');
    expect(plan[23].accumulatedFiscal).toBe('1200.000');
  });

  it('termine exactement un plan dégressif sans dépasser la base', () => {
    const plan = generateDepreciationPlan({
      acquisitionCost: '1000.000',
      residualValue: '100.000',
      serviceDate: '2026-02-10',
      accountingMethod: DepreciationMethod.DecliningBalance,
      usefulLifeMonths: 36,
      accountingDecliningRate: '0.30000',
      fiscalMethod: DepreciationMethod.DecliningBalance,
      fiscalUsefulLifeMonths: 36,
      fiscalDecliningRate: '0.30000',
    });

    expect(plan).toHaveLength(36);
    expect(plan.at(-1)?.netBookValue).toBe('100.000');
    expect(plan.at(-1)?.accumulatedAccounting).toBe('900.000');
  });
});
