import {
  CashFlowCategory,
  FinancialStatementNoteSource,
  FinancialStatementNotesStatus,
  FinancialStatementSection,
} from '../database/entities';

export type FinancialNoteGenerator =
  | 'FIXED_ASSETS'
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'TAXES'
  | 'PAYROLL'
  | 'PROVISIONS'
  | null;

export interface FinancialNoteColumn {
  key: string;
  label: string;
  type: 'TEXT' | 'MONEY' | 'NUMBER';
}

export interface FinancialNoteTable {
  title: string;
  columns: FinancialNoteColumn[];
  rows: Array<Record<string, string | number | null>>;
  emptyMessage?: string;
}

export interface FinancialStatementNoteReportSection {
  id: string;
  code: string;
  noteNumber: number;
  title: string;
  source: FinancialStatementNoteSource;
  content: string;
  autoData: FinancialNoteTable[];
  statementLineCodes: string[];
  isRequired: boolean;
  displayOrder: number;
  documents: Array<{
    id: string;
    documentId: string;
    originalName: string;
    mimeType: string;
    version: number;
  }>;
}

export interface FinancialStatementNotesReport {
  id: string;
  periodYear: number;
  status: FinancialStatementNotesStatus;
  reviewComment: string | null;
  submittedAtUtc: string | null;
  validatedAtUtc: string | null;
  sections: FinancialStatementNoteReportSection[];
}

export interface FinancialNoteDefinition {
  code: string;
  noteNumber: number;
  title: string;
  source: FinancialStatementNoteSource;
  defaultContent: string;
  statementLineCodes: string[];
  isRequired: boolean;
  displayOrder: number;
  generator: FinancialNoteGenerator;
}

const s = FinancialStatementSection;

export const DEFAULT_FINANCIAL_NOTE_DEFINITIONS: FinancialNoteDefinition[] = [
  {
    code: 'METHODES_COMPTABLES',
    noteNumber: 1,
    title: 'Principes et méthodes comptables',
    source: FinancialStatementNoteSource.Manual,
    defaultContent:
      'Décrire le référentiel appliqué, les conventions comptables, les méthodes d’évaluation et les changements éventuels de méthodes.',
    statementLineCodes: [],
    isRequired: true,
    displayOrder: 10,
    generator: null,
  },
  {
    code: 'IMMOBILISATIONS',
    noteNumber: 2,
    title: 'Immobilisations et amortissements',
    source: FinancialStatementNoteSource.Mixed,
    defaultContent:
      'Présenter les méthodes d’amortissement, les durées d’utilité et les mouvements significatifs de l’exercice.',
    statementLineCodes: [
      s.BalanceIntangibleAssets,
      s.BalanceTangibleAssets,
      s.BalanceFinancialAssets,
      s.IncomeDepreciationProvisions,
    ],
    isRequired: false,
    displayOrder: 20,
    generator: 'FIXED_ASSETS',
  },
  {
    code: 'CLIENTS_CREANCES',
    noteNumber: 3,
    title: 'Clients et créances rattachées',
    source: FinancialStatementNoteSource.Mixed,
    defaultContent:
      'Commenter les créances anciennes, litigieuses ou présentant un risque de recouvrement.',
    statementLineCodes: [s.BalanceCustomers, s.IncomeRevenue],
    isRequired: false,
    displayOrder: 30,
    generator: 'CUSTOMERS',
  },
  {
    code: 'FOURNISSEURS_DETTES',
    noteNumber: 4,
    title: 'Fournisseurs et dettes rattachées',
    source: FinancialStatementNoteSource.Mixed,
    defaultContent:
      'Commenter les dettes échues, contestées ou faisant l’objet d’un accord particulier.',
    statementLineCodes: [
      s.BalanceSuppliers,
      s.IncomeGoodsPurchases,
      s.IncomeSuppliesPurchases,
    ],
    isRequired: false,
    displayOrder: 40,
    generator: 'SUPPLIERS',
  },
  {
    code: 'IMPOTS_TAXES',
    noteNumber: 5,
    title: 'Impôts, taxes et déclarations',
    source: FinancialStatementNoteSource.Mixed,
    defaultContent:
      'Préciser les contrôles fiscaux en cours, crédits d’impôt significatifs et positions fiscales incertaines.',
    statementLineCodes: [
      s.BalanceOtherCurrentAssets,
      s.BalanceOtherCurrentLiabilities,
      s.IncomeTax,
    ],
    isRequired: false,
    displayOrder: 50,
    generator: 'TAXES',
  },
  {
    code: 'PERSONNEL_SOCIAL',
    noteNumber: 6,
    title: 'Personnel et charges sociales',
    source: FinancialStatementNoteSource.Mixed,
    defaultContent:
      'Décrire les engagements sociaux significatifs et les éléments exceptionnels de rémunération.',
    statementLineCodes: [s.IncomePersonnel],
    isRequired: false,
    displayOrder: 60,
    generator: 'PAYROLL',
  },
  {
    code: 'PROVISIONS',
    noteNumber: 7,
    title: 'Provisions pour risques et charges',
    source: FinancialStatementNoteSource.Mixed,
    defaultContent:
      'Décrire la nature, les hypothèses et l’échéance probable des risques provisionnés.',
    statementLineCodes: [s.BalanceProvisions, s.IncomeDepreciationProvisions],
    isRequired: false,
    displayOrder: 70,
    generator: 'PROVISIONS',
  },
  {
    code: 'ENGAGEMENTS_HORS_BILAN',
    noteNumber: 8,
    title: 'Engagements hors bilan',
    source: FinancialStatementNoteSource.Manual,
    defaultContent:
      'Indiquer les garanties données ou reçues, cautions, contrats et autres engagements non comptabilisés. Écrire « Néant » lorsqu’il n’existe aucun engagement significatif.',
    statementLineCodes: [],
    isRequired: true,
    displayOrder: 80,
    generator: null,
  },
  {
    code: 'EVENTUALITES_LITIGES',
    noteNumber: 9,
    title: 'Éventualités et litiges',
    source: FinancialStatementNoteSource.Manual,
    defaultContent:
      'Décrire les litiges, passifs éventuels et actifs éventuels significatifs. Écrire « Néant » si aucun élément n’est à signaler.',
    statementLineCodes: [],
    isRequired: true,
    displayOrder: 90,
    generator: null,
  },
  {
    code: 'EVENEMENTS_POSTERIEURS',
    noteNumber: 10,
    title: 'Événements postérieurs à la date de clôture',
    source: FinancialStatementNoteSource.Manual,
    defaultContent:
      'Décrire les événements significatifs survenus entre la clôture et l’autorisation de publication. Écrire « Néant » lorsqu’aucun événement n’est à signaler.',
    statementLineCodes: [],
    isRequired: true,
    displayOrder: 100,
    generator: null,
  },
];

export const FINANCIAL_NOTE_DEFINITION_BY_CODE = new Map(
  DEFAULT_FINANCIAL_NOTE_DEFINITIONS.map((definition) => [
    definition.code,
    definition,
  ]),
);

export const ALLOWED_FINANCIAL_STATEMENT_LINE_CODES = new Set<string>([
  ...Object.values(FinancialStatementSection),
  ...Object.values(CashFlowCategory),
]);
