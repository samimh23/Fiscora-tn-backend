import {
  CashFlowCategory,
  FinancialStatementSection,
  LedgerAccountType,
} from '../database/entities';
import { inferMapping } from './financial-statement-definitions';

describe('mapping NC 01 par défaut', () => {
  it.each([
    [
      '218200',
      LedgerAccountType.Asset,
      FinancialStatementSection.BalanceTangibleAssets,
      CashFlowCategory.InvestingTangibleIntangible,
    ],
    [
      '411000',
      LedgerAccountType.Asset,
      FinancialStatementSection.BalanceCustomers,
      CashFlowCategory.OperatingCustomers,
    ],
    [
      '401000',
      LedgerAccountType.Liability,
      FinancialStatementSection.BalanceSuppliers,
      CashFlowCategory.OperatingSuppliersPersonnel,
    ],
    [
      '530000',
      LedgerAccountType.Asset,
      FinancialStatementSection.BalanceCash,
      CashFlowCategory.Cash,
    ],
    [
      '706000',
      LedgerAccountType.Revenue,
      FinancialStatementSection.IncomeRevenue,
      CashFlowCategory.OperatingCustomers,
    ],
    [
      '606000',
      LedgerAccountType.Expense,
      FinancialStatementSection.IncomeSuppliesPurchases,
      CashFlowCategory.OperatingSuppliersPersonnel,
    ],
  ])(
    'classe le compte %s',
    (code, type, statementSection, cashFlowCategory) => {
      expect(inferMapping({ code, type })).toEqual({
        statementSection,
        cashFlowCategory,
      });
    },
  );
});
