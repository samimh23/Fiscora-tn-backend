import {
  CashFlowCategory,
  FinancialStatementSection,
  LedgerAccount,
  LedgerAccountType,
} from '../database/entities';

export type StatementKind =
  'BALANCE_ASSET' | 'BALANCE_EQUITY_LIABILITY' | 'INCOME';

export interface SectionDefinition {
  code: FinancialStatementSection;
  label: string;
  kind: StatementKind;
  order: number;
  group: string;
}

const s = FinancialStatementSection;

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    code: s.BalanceIntangibleAssets,
    label: 'Immobilisations incorporelles',
    kind: 'BALANCE_ASSET',
    order: 10,
    group: 'Actifs non courants',
  },
  {
    code: s.BalanceTangibleAssets,
    label: 'Immobilisations corporelles',
    kind: 'BALANCE_ASSET',
    order: 20,
    group: 'Actifs non courants',
  },
  {
    code: s.BalanceFinancialAssets,
    label: 'Immobilisations financières',
    kind: 'BALANCE_ASSET',
    order: 30,
    group: 'Actifs non courants',
  },
  {
    code: s.BalanceOtherNonCurrentAssets,
    label: 'Autres actifs non courants',
    kind: 'BALANCE_ASSET',
    order: 40,
    group: 'Actifs non courants',
  },
  {
    code: s.BalanceInventories,
    label: 'Stocks',
    kind: 'BALANCE_ASSET',
    order: 50,
    group: 'Actifs courants',
  },
  {
    code: s.BalanceCustomers,
    label: 'Clients et comptes rattachés',
    kind: 'BALANCE_ASSET',
    order: 60,
    group: 'Actifs courants',
  },
  {
    code: s.BalanceOtherCurrentAssets,
    label: 'Autres actifs courants',
    kind: 'BALANCE_ASSET',
    order: 70,
    group: 'Actifs courants',
  },
  {
    code: s.BalanceShortTermInvestments,
    label: 'Placements et autres actifs financiers',
    kind: 'BALANCE_ASSET',
    order: 80,
    group: 'Actifs courants',
  },
  {
    code: s.BalanceCash,
    label: 'Liquidités et équivalents de liquidités',
    kind: 'BALANCE_ASSET',
    order: 90,
    group: 'Actifs courants',
  },
  {
    code: s.BalanceCapital,
    label: 'Capital social',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 110,
    group: 'Capitaux propres',
  },
  {
    code: s.BalanceReserves,
    label: 'Réserves',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 120,
    group: 'Capitaux propres',
  },
  {
    code: s.BalanceOtherEquity,
    label: 'Autres capitaux propres',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 130,
    group: 'Capitaux propres',
  },
  {
    code: s.BalanceRetainedEarnings,
    label: 'Résultats reportés',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 140,
    group: 'Capitaux propres',
  },
  {
    code: s.BalanceCurrentResult,
    label: 'Résultat de l’exercice',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 150,
    group: 'Capitaux propres',
  },
  {
    code: s.BalanceBorrowings,
    label: 'Emprunts',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 160,
    group: 'Passifs non courants',
  },
  {
    code: s.BalanceOtherNonCurrentLiabilities,
    label: 'Autres passifs financiers non courants',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 170,
    group: 'Passifs non courants',
  },
  {
    code: s.BalanceProvisions,
    label: 'Provisions',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 180,
    group: 'Passifs non courants',
  },
  {
    code: s.BalanceSuppliers,
    label: 'Fournisseurs et comptes rattachés',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 190,
    group: 'Passifs courants',
  },
  {
    code: s.BalanceOtherCurrentLiabilities,
    label: 'Autres passifs courants',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 200,
    group: 'Passifs courants',
  },
  {
    code: s.BalanceBankOverdrafts,
    label: 'Concours bancaires et autres passifs financiers',
    kind: 'BALANCE_EQUITY_LIABILITY',
    order: 210,
    group: 'Passifs courants',
  },
  {
    code: s.IncomeRevenue,
    label: 'Revenus',
    kind: 'INCOME',
    order: 310,
    group: 'Produits d’exploitation',
  },
  {
    code: s.IncomeOtherOperatingIncome,
    label: 'Autres produits d’exploitation',
    kind: 'INCOME',
    order: 320,
    group: 'Produits d’exploitation',
  },
  {
    code: s.IncomeCapitalizedProduction,
    label: 'Production immobilisée',
    kind: 'INCOME',
    order: 330,
    group: 'Produits d’exploitation',
  },
  {
    code: s.IncomeInventoryChange,
    label: 'Variation des stocks de produits finis et des encours',
    kind: 'INCOME',
    order: 340,
    group: 'Charges d’exploitation',
  },
  {
    code: s.IncomeGoodsPurchases,
    label: 'Achats de marchandises consommés',
    kind: 'INCOME',
    order: 350,
    group: 'Charges d’exploitation',
  },
  {
    code: s.IncomeSuppliesPurchases,
    label: 'Achats d’approvisionnements consommés',
    kind: 'INCOME',
    order: 360,
    group: 'Charges d’exploitation',
  },
  {
    code: s.IncomePersonnel,
    label: 'Charges de personnel',
    kind: 'INCOME',
    order: 370,
    group: 'Charges d’exploitation',
  },
  {
    code: s.IncomeDepreciationProvisions,
    label: 'Dotations aux amortissements et aux provisions',
    kind: 'INCOME',
    order: 380,
    group: 'Charges d’exploitation',
  },
  {
    code: s.IncomeOtherOperatingExpense,
    label: 'Autres charges d’exploitation',
    kind: 'INCOME',
    order: 390,
    group: 'Charges d’exploitation',
  },
  {
    code: s.IncomeFinancialExpense,
    label: 'Charges financières nettes',
    kind: 'INCOME',
    order: 400,
    group: 'Activités ordinaires',
  },
  {
    code: s.IncomeInvestmentIncome,
    label: 'Produits des placements',
    kind: 'INCOME',
    order: 410,
    group: 'Activités ordinaires',
  },
  {
    code: s.IncomeOtherOrdinaryGain,
    label: 'Autres gains ordinaires',
    kind: 'INCOME',
    order: 420,
    group: 'Activités ordinaires',
  },
  {
    code: s.IncomeOtherOrdinaryLoss,
    label: 'Autres pertes ordinaires',
    kind: 'INCOME',
    order: 430,
    group: 'Activités ordinaires',
  },
  {
    code: s.IncomeTax,
    label: 'Impôt sur les bénéfices',
    kind: 'INCOME',
    order: 440,
    group: 'Impôt',
  },
  {
    code: s.IncomeExtraordinary,
    label: 'Éléments extraordinaires (gains/pertes)',
    kind: 'INCOME',
    order: 450,
    group: 'Éléments extraordinaires',
  },
  {
    code: s.IncomeAccountingChanges,
    label: 'Effet des modifications comptables (net d’impôt)',
    kind: 'INCOME',
    order: 460,
    group: 'Modifications comptables',
  },
];

export const SECTION_BY_CODE = new Map(
  SECTION_DEFINITIONS.map((item) => [item.code, item]),
);

export const CASH_FLOW_LABELS: Record<CashFlowCategory, string> = {
  [CashFlowCategory.Cash]: 'Compte de liquidités ou équivalent',
  [CashFlowCategory.OperatingCustomers]: 'Encaissements reçus des clients',
  [CashFlowCategory.OperatingSuppliersPersonnel]:
    'Sommes versées aux fournisseurs et au personnel',
  [CashFlowCategory.OperatingInterest]: 'Intérêts payés',
  [CashFlowCategory.OperatingIncomeTax]: 'Impôts sur les bénéfices payés',
  [CashFlowCategory.InvestingTangibleIntangible]:
    'Acquisitions et cessions d’immobilisations corporelles et incorporelles',
  [CashFlowCategory.InvestingFinancial]:
    'Acquisitions et cessions d’immobilisations financières',
  [CashFlowCategory.FinancingEquity]:
    'Émission ou rachat d’instruments de capitaux propres',
  [CashFlowCategory.FinancingDividends]: 'Dividendes et autres distributions',
  [CashFlowCategory.FinancingBorrowings]:
    'Encaissements et remboursements d’emprunts',
  [CashFlowCategory.ExchangeEffect]:
    'Incidence des variations des taux de change',
  [CashFlowCategory.OtherOperating]: 'Autres flux d’exploitation',
};

export function inferMapping(account: Pick<LedgerAccount, 'code' | 'type'>) {
  const code = account.code.replace(/\D/g, '');
  const type = account.type;
  let statementSection: FinancialStatementSection | null = null;
  let cashFlowCategory: CashFlowCategory | null = null;

  if (type === LedgerAccountType.Asset) {
    if (/^20/.test(code)) statementSection = s.BalanceIntangibleAssets;
    else if (/^(21|22|23|24|281|282|283|284)/.test(code))
      statementSection = s.BalanceTangibleAssets;
    else if (/^(25|26|27|29)/.test(code))
      statementSection = s.BalanceFinancialAssets;
    else if (/^2/.test(code)) statementSection = s.BalanceOtherNonCurrentAssets;
    else if (/^(3|39)/.test(code)) statementSection = s.BalanceInventories;
    else if (/^41/.test(code)) statementSection = s.BalanceCustomers;
    else if (/^(52|50)/.test(code))
      statementSection = s.BalanceShortTermInvestments;
    else if (/^(53|54|55|58)/.test(code)) statementSection = s.BalanceCash;
    else statementSection = s.BalanceOtherCurrentAssets;
  } else if (type === LedgerAccountType.Equity) {
    if (/^10/.test(code)) statementSection = s.BalanceCapital;
    else if (/^11/.test(code)) statementSection = s.BalanceReserves;
    else if (/^12/.test(code)) statementSection = s.BalanceRetainedEarnings;
    else if (/^13/.test(code)) statementSection = s.BalanceCurrentResult;
    else statementSection = s.BalanceOtherEquity;
  } else if (type === LedgerAccountType.Liability) {
    if (/^40/.test(code)) statementSection = s.BalanceSuppliers;
    else if (/^(50|51)/.test(code)) statementSection = s.BalanceBorrowings;
    else if (/^(53|54|55|58)/.test(code))
      statementSection = s.BalanceBankOverdrafts;
    else if (/^(15|16)/.test(code))
      statementSection = s.BalanceOtherNonCurrentLiabilities;
    else if (/^(19|48)/.test(code)) statementSection = s.BalanceProvisions;
    else statementSection = s.BalanceOtherCurrentLiabilities;
  } else if (type === LedgerAccountType.Expense) {
    if (/^603/.test(code)) statementSection = s.IncomeInventoryChange;
    else if (/^600/.test(code)) statementSection = s.IncomeGoodsPurchases;
    else if (/^60/.test(code)) statementSection = s.IncomeSuppliesPurchases;
    else if (/^64/.test(code)) statementSection = s.IncomePersonnel;
    else if (/^65/.test(code)) statementSection = s.IncomeFinancialExpense;
    else if (/^68/.test(code))
      statementSection = s.IncomeDepreciationProvisions;
    else if (/^69/.test(code)) statementSection = s.IncomeTax;
    else if (/^67/.test(code)) statementSection = s.IncomeExtraordinary;
    else statementSection = s.IncomeOtherOperatingExpense;
  } else if (type === LedgerAccountType.Revenue) {
    if (/^70/.test(code)) statementSection = s.IncomeRevenue;
    else if (/^72/.test(code)) statementSection = s.IncomeCapitalizedProduction;
    else if (/^75/.test(code)) statementSection = s.IncomeInvestmentIncome;
    else if (/^76/.test(code)) statementSection = s.IncomeOtherOrdinaryGain;
    else if (/^77/.test(code)) statementSection = s.IncomeExtraordinary;
    else if (/^79/.test(code)) statementSection = s.IncomeAccountingChanges;
    else statementSection = s.IncomeOtherOperatingIncome;
  }

  if (/^(53|54|55|58)/.test(code) && type === LedgerAccountType.Asset)
    cashFlowCategory = CashFlowCategory.Cash;
  else if (/^(41|70)/.test(code))
    cashFlowCategory = CashFlowCategory.OperatingCustomers;
  else if (/^(40|42|60|61|62|63|64|66|68)/.test(code))
    cashFlowCategory = CashFlowCategory.OperatingSuppliersPersonnel;
  else if (/^65/.test(code))
    cashFlowCategory = CashFlowCategory.OperatingInterest;
  else if (/^69/.test(code))
    cashFlowCategory = CashFlowCategory.OperatingIncomeTax;
  else if (/^(20|21|22|23|24|28)/.test(code))
    cashFlowCategory = CashFlowCategory.InvestingTangibleIntangible;
  else if (/^(25|26|27)/.test(code))
    cashFlowCategory = CashFlowCategory.InvestingFinancial;
  else if (/^(10|11)/.test(code))
    cashFlowCategory = CashFlowCategory.FinancingEquity;
  else if (/^457/.test(code))
    cashFlowCategory = CashFlowCategory.FinancingDividends;
  else if (/^(15|16|50|51)/.test(code))
    cashFlowCategory = CashFlowCategory.FinancingBorrowings;
  else if (type !== LedgerAccountType.OffBalanceSheet)
    cashFlowCategory = CashFlowCategory.OtherOperating;

  return { statementSection, cashFlowCategory };
}
