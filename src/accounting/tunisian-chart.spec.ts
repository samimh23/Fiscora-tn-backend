import { LedgerAccountType, NormalBalance } from '../database/entities';
import { TUNISIAN_NC01_CHART } from './tunisian-chart';

describe('TUNISIAN_NC01_CHART', () => {
  it('contient une nomenclature générale étendue sans doublon', () => {
    const codes = TUNISIAN_NC01_CHART.map((account) => account.code);

    expect(codes.length).toBeGreaterThanOrEqual(450);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('contient les comptes structurants tunisiens', () => {
    const byCode = new Map(
      TUNISIAN_NC01_CHART.map((account) => [account.code, account]),
    );

    for (const code of [
      '101',
      '4011',
      '411',
      '43651',
      '43666',
      '436711',
      '45311',
      '5321',
      '5411',
      '601',
      '691',
      '705',
      '707',
    ]) {
      expect(byCode.has(code)).toBe(true);
    }

    expect(byCode.get('601')?.type).toBe(LedgerAccountType.Expense);
    expect(byCode.get('705')?.type).toBe(LedgerAccountType.Revenue);
    expect(byCode.get('4011')?.normalBalance).toBe(NormalBalance.Credit);
    expect(byCode.get('411')?.normalBalance).toBe(NormalBalance.Debit);
  });

  it('maintient une hiérarchie valide et réserve la saisie aux feuilles', () => {
    const byCode = new Map(
      TUNISIAN_NC01_CHART.map((account) => [account.code, account]),
    );

    for (const account of TUNISIAN_NC01_CHART) {
      if (account.parentCode) {
        const parent = byCode.get(account.parentCode);
        expect(parent).toBeDefined();
        expect(account.code.startsWith(account.parentCode)).toBe(true);
        expect(parent?.allowsPosting).toBe(false);
      }

      const hasChild = TUNISIAN_NC01_CHART.some(
        (candidate) => candidate.parentCode === account.code,
      );
      expect(account.allowsPosting).toBe(!hasChild);
    }
  });
});
