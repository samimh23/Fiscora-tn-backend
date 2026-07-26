import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AccountingYearClosing,
  AuditLog,
  CashFlowCategory,
  ClientDossier,
  CompanyProfile,
  FinancialStatementMapping,
  FinancialStatementNotesStatus,
  FinancialStatementSection,
  FinancialStatementSnapshot,
  FinancialStatementSnapshotStatus,
  LedgerAccount,
  LedgerAccountType,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { UpsertFinancialStatementMappingDto } from './dto';
import type { FinancialStatementNotesReport } from './financial-statement-note-definitions';
import { FinancialStatementNotesService } from './financial-statement-notes.service';
import {
  CASH_FLOW_LABELS,
  inferMapping,
  SECTION_BY_CODE,
  SECTION_DEFINITIONS,
  type StatementKind,
} from './financial-statement-definitions';

interface AccountAmountRow {
  accountId: string;
  debit: string;
  credit: string;
}

interface EntryLineRow extends AccountAmountRow {
  entryId: string;
}

interface EffectiveMapping {
  account: LedgerAccount;
  statementSection: FinancialStatementSection | null;
  cashFlowCategory: CashFlowCategory | null;
  source: 'PERSONNALISE' | 'NC01_AUTOMATIQUE';
}

export interface FinancialStatementLine {
  code: string;
  label: string;
  group: string;
  current: string;
  previous: string;
  noteNumber: number | null;
}

export interface FinancialStatementReport {
  standard: string;
  source: 'TEMPS_REEL' | 'SNAPSHOT_DEFINITIF';
  generatedAtUtc: string;
  dossier: {
    id: string;
    legalName: string;
    taxIdentifier: string | null;
    rneNumber: string | null;
  };
  currencyCode: string;
  period: { year: number; startsOn: string; endsOn: string };
  comparisonPeriod: { year: number; startsOn: string; endsOn: string };
  balanceSheet: {
    assets: FinancialStatementLine[];
    equityAndLiabilities: FinancialStatementLine[];
    totalAssets: { current: string; previous: string };
    totalEquityAndLiabilities: { current: string; previous: string };
    balanceDifference: { current: string; previous: string };
  };
  incomeStatement: {
    lines: FinancialStatementLine[];
    operatingResult: { current: string; previous: string };
    ordinaryResultBeforeTax: { current: string; previous: string };
    netResult: { current: string; previous: string };
  };
  cashFlowStatement: {
    lines: FinancialStatementLine[];
    operatingCashFlow: { current: string; previous: string };
    investingCashFlow: { current: string; previous: string };
    financingCashFlow: { current: string; previous: string };
    exchangeEffect: { current: string; previous: string };
    cashVariation: { current: string; previous: string };
    openingCash: { current: string; previous: string };
    closingCash: { current: string; previous: string };
    unclassifiedCashFlow: { current: string; previous: string };
    reconciliationDifference: { current: string; previous: string };
  };
  controls: Array<{
    code: string;
    label: string;
    status: 'OK' | 'ANOMALIE';
    currentDifference: string;
    previousDifference: string;
    message: string;
  }>;
  mappingWarnings: Array<{ accountId: string; code: string; name: string }>;
  notes: FinancialStatementNotesReport | null;
  snapshot?: {
    id: string;
    version: number;
    sourceHash: string;
    finalizedAtUtc: string | null;
  };
}

@Injectable()
export class FinancialStatementsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(FinancialStatementMapping)
    private readonly mappings: Repository<FinancialStatementMapping>,
    @InjectRepository(FinancialStatementSnapshot)
    private readonly snapshots: Repository<FinancialStatementSnapshot>,
    @InjectRepository(AccountingYearClosing)
    private readonly closings: Repository<AccountingYearClosing>,
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    @InjectRepository(AuditLog)
    private readonly audits: Repository<AuditLog>,
    private readonly dossiers: DossiersService,
    private readonly notesService: FinancialStatementNotesService,
  ) {}

  async listMappings(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const effective = await this.effectiveMappings(organizationId, dossierId);
    return effective.map((item) => ({
      accountId: item.account.id,
      accountCode: item.account.code,
      accountName: item.account.name,
      accountType: item.account.type,
      statementSection: item.statementSection,
      statementSectionLabel: item.statementSection
        ? SECTION_BY_CODE.get(item.statementSection)?.label
        : null,
      cashFlowCategory: item.cashFlowCategory,
      cashFlowCategoryLabel: item.cashFlowCategory
        ? CASH_FLOW_LABELS[item.cashFlowCategory]
        : null,
      source: item.source,
    }));
  }

  async applyDefaults(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const accounts = await this.accounts.find({
      where: { organizationId, dossierId, isActive: true },
      order: { code: 'ASC' },
    });
    const existing = await this.mappings.findBy({ organizationId, dossierId });
    const existingIds = new Set(existing.map((item) => item.accountId));
    const additions = accounts
      .filter((account) => !existingIds.has(account.id))
      .map((account) => {
        const inferred = inferMapping(account);
        return this.mappings.create({
          organizationId,
          dossierId,
          accountId: account.id,
          ...inferred,
          updatedByUserId: userId,
        });
      });
    if (additions.length) await this.mappings.save(additions);
    await this.audit(
      organizationId,
      userId,
      'financial_mapping.defaults_applied',
      dossierId,
      {
        dossierId,
        added: additions.length,
      },
    );
    return { added: additions.length, total: accounts.length };
  }

  async upsertMapping(
    organizationId: string,
    dossierId: string,
    accountId: string,
    userId: string,
    dto: UpsertFinancialStatementMappingDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const account = await this.accounts.findOneBy({
      id: accountId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!account)
      throw new NotFoundException('Le compte comptable est introuvable.');
    let mapping = await this.mappings.findOneBy({ dossierId, accountId });
    mapping ??= this.mappings.create({ organizationId, dossierId, accountId });
    const inferred = inferMapping(account);
    mapping.statementSection =
      dto.statementSection === undefined
        ? (mapping.statementSection ?? inferred.statementSection)
        : dto.statementSection;
    mapping.cashFlowCategory =
      dto.cashFlowCategory === undefined
        ? (mapping.cashFlowCategory ?? inferred.cashFlowCategory)
        : dto.cashFlowCategory;
    mapping.updatedByUserId = userId;
    const result = await this.mappings.save(mapping);
    await this.audit(
      organizationId,
      userId,
      'financial_mapping.updated',
      result.id,
      {
        dossierId,
        accountId,
        statementSection: result.statementSection,
        cashFlowCategory: result.cashFlowCategory,
      },
    );
    return result;
  }

  async getReport(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
  ): Promise<FinancialStatementReport> {
    this.assertYear(periodYear);
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const final = await this.snapshots.findOne({
      where: {
        organizationId,
        dossierId,
        periodYear,
        status: FinancialStatementSnapshotStatus.Final,
      },
    });
    if (final) {
      const payload = final.payloadJson as unknown as FinancialStatementReport;
      return {
        ...payload,
        notes: payload.notes ?? null,
        source: 'SNAPSHOT_DEFINITIF',
        snapshot: {
          id: final.id,
          version: final.version,
          sourceHash: final.sourceHash,
          finalizedAtUtc: final.finalizedAtUtc?.toISOString() ?? null,
        },
      };
    }
    return this.buildLiveReport(organizationId, dossierId, periodYear);
  }

  async previewReport(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
  ) {
    this.assertYear(periodYear);
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.buildLiveReport(organizationId, dossierId, periodYear);
  }

  async finalize(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
  ) {
    this.assertYear(periodYear);
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    if (
      await this.snapshots.existsBy({
        organizationId,
        dossierId,
        periodYear,
        status: FinancialStatementSnapshotStatus.Final,
      })
    ) {
      throw new ConflictException(
        'Les états financiers définitifs de cet exercice sont déjà figés.',
      );
    }
    const closing = await this.closings.findOneBy({
      organizationId,
      dossierId,
      periodYear,
    });
    if (!closing) {
      throw new ConflictException(
        'Clôturez d’abord l’exercice avant de figer ses états financiers.',
      );
    }
    await this.notesService.requireValidatedForFinalization(
      organizationId,
      dossierId,
      periodYear,
    );
    const report = await this.buildLiveReport(
      organizationId,
      dossierId,
      periodYear,
    );
    const failures = report.controls.filter(
      (control) => control.status === 'ANOMALIE',
    );
    if (failures.length) {
      throw new ConflictException(
        `Validation impossible : ${failures.map((item) => item.label).join(', ')}.`,
      );
    }
    const latest = await this.snapshots
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.version)', 'version')
      .where('snapshot.dossier_id = :dossierId', { dossierId })
      .andWhere('snapshot.period_year = :periodYear', { periodYear })
      .getRawOne<{ version: string | null }>();
    const version = Number(latest?.version ?? 0) + 1;
    const sourceHash = createHash('sha256')
      .update(JSON.stringify(report))
      .digest('hex');
    const snapshot = await this.snapshots.save(
      this.snapshots.create({
        organizationId,
        dossierId,
        periodYear,
        startsOn: report.period.startsOn,
        endsOn: report.period.endsOn,
        version,
        status: FinancialStatementSnapshotStatus.Final,
        payloadJson: report as unknown as Record<string, unknown>,
        sourceHash,
        accountingYearClosingId: closing.id,
        createdByUserId: userId,
        finalizedByUserId: userId,
        finalizedAtUtc: new Date(),
      }),
    );
    await this.audit(
      organizationId,
      userId,
      'financial_statements.finalized',
      snapshot.id,
      {
        dossierId,
        periodYear,
        version,
        sourceHash,
      },
    );
    return this.getReport(organizationId, dossierId, periodYear, userId);
  }

  async listSnapshots(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.snapshots.find({
      where: { organizationId, dossierId },
      order: { periodYear: 'DESC', version: 'DESC' },
    });
  }

  private async buildLiveReport(
    organizationId: string,
    dossierId: string,
    periodYear: number,
  ): Promise<FinancialStatementReport> {
    const dossier = await this.dataSource
      .getRepository(ClientDossier)
      .findOneBy({
        id: dossierId,
        organizationId,
      });
    if (!dossier) throw new NotFoundException('Le dossier est introuvable.');
    const profile = await this.profiles.findOneBy({ organizationId });
    const currentRange = this.fiscalRange(dossier, periodYear);
    const previousRange = this.fiscalRange(dossier, periodYear - 1);
    const mappings = await this.effectiveMappings(organizationId, dossierId);
    const notes = await this.notesService.getForReport(
      organizationId,
      dossierId,
      periodYear,
    );
    const noteNumberByLine = new Map<string, number>();
    for (const section of notes?.sections ?? []) {
      for (const code of section.statementLineCodes) {
        if (!noteNumberByLine.has(code)) {
          noteNumberByLine.set(code, section.noteNumber);
        }
      }
    }
    const mappingByAccount = new Map(
      mappings.map((item) => [item.account.id, item]),
    );
    const [current, previous] = await Promise.all([
      this.periodData(organizationId, dossierId, currentRange, mappings),
      this.periodData(organizationId, dossierId, previousRange, mappings),
    ]);

    const statementLines = (kind: StatementKind) =>
      SECTION_DEFINITIONS.filter((definition) => definition.kind === kind).map(
        (definition) => ({
          code: definition.code,
          label: definition.label,
          group: definition.group,
          current: fromMillimes(current.sections.get(definition.code) ?? 0n),
          previous: fromMillimes(previous.sections.get(definition.code) ?? 0n),
          noteNumber: noteNumberByLine.get(definition.code) ?? null,
        }),
      );
    const assets = statementLines('BALANCE_ASSET');
    const equityAndLiabilities = statementLines('BALANCE_EQUITY_LIABILITY');
    const incomeLines = statementLines('INCOME');
    const currentAssets = this.sumLines(assets, 'current');
    const previousAssets = this.sumLines(assets, 'previous');
    const currentEquityLiabilities = this.sumLines(
      equityAndLiabilities,
      'current',
    );
    const previousEquityLiabilities = this.sumLines(
      equityAndLiabilities,
      'previous',
    );
    const cashLines = this.cashFlowLines(
      current.cashFlow.categories,
      previous.cashFlow.categories,
      noteNumberByLine,
    );

    const activeAccountIds = new Set([
      ...current.activeAccountIds,
      ...previous.activeAccountIds,
    ]);
    const mappingWarnings = [...activeAccountIds]
      .map((accountId) => mappingByAccount.get(accountId))
      .filter((mapping): mapping is EffectiveMapping =>
        Boolean(mapping && !mapping.statementSection),
      )
      .map((mapping) => ({
        accountId: mapping.account.id,
        code: mapping.account.code,
        name: mapping.account.name,
      }));

    const currentBalanceDifference = currentAssets - currentEquityLiabilities;
    const previousBalanceDifference =
      previousAssets - previousEquityLiabilities;
    const currentCashDifference =
      current.cashFlow.closing -
      current.cashFlow.opening -
      current.cashFlow.variation;
    const previousCashDifference =
      previous.cashFlow.closing -
      previous.cashFlow.opening -
      previous.cashFlow.variation;
    const controls: FinancialStatementReport['controls'] = [
      this.control(
        'EQUILIBRE_BILAN',
        'Équilibre Actifs = Capitaux propres + Passifs',
        currentBalanceDifference,
        previousBalanceDifference,
        'Vérifiez le mapping des comptes et les écritures de clôture.',
      ),
      this.control(
        'RAPPROCHEMENT_TRESORERIE',
        'Rapprochement de la variation de trésorerie',
        currentCashDifference,
        previousCashDifference,
        'La trésorerie de fin doit correspondre à la trésorerie initiale augmentée des flux.',
      ),
      this.control(
        'FLUX_NON_CLASSES',
        'Classement complet des flux de trésorerie',
        current.cashFlow.unclassified,
        previous.cashFlow.unclassified,
        'Configurez la catégorie de flux des comptes de contrepartie.',
      ),
      {
        code: 'MAPPING_COMPLET',
        label: 'Mapping complet des comptes mouvementés',
        status: mappingWarnings.length ? 'ANOMALIE' : 'OK',
        currentDifference: String(mappingWarnings.length),
        previousDifference: '0',
        message: mappingWarnings.length
          ? `${mappingWarnings.length} compte(s) mouvementé(s) sans rubrique d’état financier.`
          : 'Tous les comptes mouvementés sont classés.',
      },
      {
        code: 'NOTES_VALIDEES',
        label: 'Validation des notes aux états financiers',
        status:
          notes?.status === FinancialStatementNotesStatus.Validated
            ? 'OK'
            : 'ANOMALIE',
        currentDifference:
          notes?.status === FinancialStatementNotesStatus.Validated ? '0' : '1',
        previousDifference: '0',
        message:
          notes?.status === FinancialStatementNotesStatus.Validated
            ? 'Les annexes obligatoires ont été validées.'
            : 'Générez, complétez puis validez les notes avant de figer les états.',
      },
    ];

    return {
      standard:
        'Système Comptable des Entreprises - NC 01 (modèle général adaptable)',
      source: 'TEMPS_REEL',
      generatedAtUtc: new Date().toISOString(),
      dossier: {
        id: dossier.id,
        legalName: dossier.legalName,
        taxIdentifier: dossier.taxIdentifier,
        rneNumber: dossier.rneNumber,
      },
      currencyCode: profile?.baseCurrencyCode ?? 'TND',
      period: { year: periodYear, ...currentRange },
      comparisonPeriod: { year: periodYear - 1, ...previousRange },
      balanceSheet: {
        assets,
        equityAndLiabilities,
        totalAssets: {
          current: fromMillimes(currentAssets),
          previous: fromMillimes(previousAssets),
        },
        totalEquityAndLiabilities: {
          current: fromMillimes(currentEquityLiabilities),
          previous: fromMillimes(previousEquityLiabilities),
        },
        balanceDifference: {
          current: fromMillimes(currentBalanceDifference),
          previous: fromMillimes(previousBalanceDifference),
        },
      },
      incomeStatement: {
        lines: incomeLines,
        operatingResult: {
          current: fromMillimes(current.operatingResult),
          previous: fromMillimes(previous.operatingResult),
        },
        ordinaryResultBeforeTax: {
          current: fromMillimes(current.ordinaryResultBeforeTax),
          previous: fromMillimes(previous.ordinaryResultBeforeTax),
        },
        netResult: {
          current: fromMillimes(current.netResult),
          previous: fromMillimes(previous.netResult),
        },
      },
      cashFlowStatement: {
        lines: cashLines,
        operatingCashFlow: this.pair(
          current.cashFlow.operating,
          previous.cashFlow.operating,
        ),
        investingCashFlow: this.pair(
          current.cashFlow.investing,
          previous.cashFlow.investing,
        ),
        financingCashFlow: this.pair(
          current.cashFlow.financing,
          previous.cashFlow.financing,
        ),
        exchangeEffect: this.pair(
          current.cashFlow.exchange,
          previous.cashFlow.exchange,
        ),
        cashVariation: this.pair(
          current.cashFlow.variation,
          previous.cashFlow.variation,
        ),
        openingCash: this.pair(
          current.cashFlow.opening,
          previous.cashFlow.opening,
        ),
        closingCash: this.pair(
          current.cashFlow.closing,
          previous.cashFlow.closing,
        ),
        unclassifiedCashFlow: this.pair(
          current.cashFlow.unclassified,
          previous.cashFlow.unclassified,
        ),
        reconciliationDifference: this.pair(
          currentCashDifference,
          previousCashDifference,
        ),
      },
      controls,
      mappingWarnings,
      notes,
    };
  }

  private async periodData(
    organizationId: string,
    dossierId: string,
    range: { startsOn: string; endsOn: string },
    mappings: EffectiveMapping[],
  ) {
    const closing = await this.closings.findOneBy({
      organizationId,
      dossierId,
      startsOn: range.startsOn,
      endsOn: range.endsOn,
    });
    const [balanceRows, incomeRows, entryRows] = await Promise.all([
      this.accountAmounts(organizationId, dossierId, null, range.endsOn),
      this.accountAmounts(
        organizationId,
        dossierId,
        range.startsOn,
        range.endsOn,
        closing?.closingJournalEntryId ?? null,
      ),
      this.entryLines(organizationId, dossierId, range.startsOn, range.endsOn),
    ]);
    const mappingByAccount = new Map(
      mappings.map((item) => [item.account.id, item]),
    );
    const sections = new Map<FinancialStatementSection, bigint>();
    const activeAccountIds = new Set<string>();
    for (const row of balanceRows) {
      const mapping = mappingByAccount.get(row.accountId);
      if (!mapping) continue;
      activeAccountIds.add(row.accountId);
      if (
        !mapping.statementSection ||
        ![
          LedgerAccountType.Asset,
          LedgerAccountType.Liability,
          LedgerAccountType.Equity,
        ].includes(mapping.account.type)
      )
        continue;
      const net = this.accountValue(mapping.account.type, row);
      sections.set(
        mapping.statementSection,
        (sections.get(mapping.statementSection) ?? 0n) + net,
      );
    }
    for (const row of incomeRows) {
      const mapping = mappingByAccount.get(row.accountId);
      if (!mapping) continue;
      activeAccountIds.add(row.accountId);
      if (
        !mapping.statementSection ||
        ![LedgerAccountType.Revenue, LedgerAccountType.Expense].includes(
          mapping.account.type,
        )
      )
        continue;
      let net = this.accountValue(mapping.account.type, row);
      if (
        mapping.statementSection ===
          FinancialStatementSection.IncomeExtraordinary &&
        mapping.account.type === LedgerAccountType.Expense
      ) {
        net = -net;
      }
      sections.set(
        mapping.statementSection,
        (sections.get(mapping.statementSection) ?? 0n) + net,
      );
    }
    const revenue = this.sumSections(sections, [
      FinancialStatementSection.IncomeRevenue,
      FinancialStatementSection.IncomeOtherOperatingIncome,
      FinancialStatementSection.IncomeCapitalizedProduction,
      FinancialStatementSection.IncomeInvestmentIncome,
      FinancialStatementSection.IncomeOtherOrdinaryGain,
      FinancialStatementSection.IncomeExtraordinary,
      FinancialStatementSection.IncomeAccountingChanges,
    ]);
    const expenses = this.sumSections(sections, [
      FinancialStatementSection.IncomeInventoryChange,
      FinancialStatementSection.IncomeGoodsPurchases,
      FinancialStatementSection.IncomeSuppliesPurchases,
      FinancialStatementSection.IncomePersonnel,
      FinancialStatementSection.IncomeDepreciationProvisions,
      FinancialStatementSection.IncomeOtherOperatingExpense,
      FinancialStatementSection.IncomeFinancialExpense,
      FinancialStatementSection.IncomeOtherOrdinaryLoss,
      FinancialStatementSection.IncomeTax,
    ]);
    const netResult = revenue - expenses;
    if (!closing) {
      sections.set(
        FinancialStatementSection.BalanceCurrentResult,
        (sections.get(FinancialStatementSection.BalanceCurrentResult) ?? 0n) +
          netResult,
      );
    }
    const operatingIncome = this.sumSections(sections, [
      FinancialStatementSection.IncomeRevenue,
      FinancialStatementSection.IncomeOtherOperatingIncome,
      FinancialStatementSection.IncomeCapitalizedProduction,
    ]);
    const operatingExpense = this.sumSections(sections, [
      FinancialStatementSection.IncomeInventoryChange,
      FinancialStatementSection.IncomeGoodsPurchases,
      FinancialStatementSection.IncomeSuppliesPurchases,
      FinancialStatementSection.IncomePersonnel,
      FinancialStatementSection.IncomeDepreciationProvisions,
      FinancialStatementSection.IncomeOtherOperatingExpense,
    ]);
    const operatingResult = operatingIncome - operatingExpense;
    const ordinaryResultBeforeTax =
      operatingResult -
      (sections.get(FinancialStatementSection.IncomeFinancialExpense) ?? 0n) +
      (sections.get(FinancialStatementSection.IncomeInvestmentIncome) ?? 0n) +
      (sections.get(FinancialStatementSection.IncomeOtherOrdinaryGain) ?? 0n) -
      (sections.get(FinancialStatementSection.IncomeOtherOrdinaryLoss) ?? 0n);
    const cashFlow = await this.cashFlow(
      organizationId,
      dossierId,
      range,
      entryRows,
      mappingByAccount,
    );
    return {
      sections,
      netResult,
      operatingResult,
      ordinaryResultBeforeTax,
      cashFlow,
      activeAccountIds,
    };
  }

  private async cashFlow(
    organizationId: string,
    dossierId: string,
    range: { startsOn: string; endsOn: string },
    rows: EntryLineRow[],
    mappingByAccount: Map<string, EffectiveMapping>,
  ) {
    const categories = new Map<CashFlowCategory, bigint>();
    let unclassified = 0n;
    const grouped = new Map<string, EntryLineRow[]>();
    for (const row of rows)
      grouped.set(row.entryId, [...(grouped.get(row.entryId) ?? []), row]);
    for (const lines of grouped.values()) {
      const cashLines = lines.filter(
        (line) =>
          mappingByAccount.get(line.accountId)?.cashFlowCategory ===
          CashFlowCategory.Cash,
      );
      const cashMovement = cashLines.reduce(
        (sum, line) => sum + toMillimes(line.debit) - toMillimes(line.credit),
        0n,
      );
      if (cashMovement === 0n) continue;
      const weights = new Map<CashFlowCategory, bigint>();
      for (const line of lines.filter((item) => !cashLines.includes(item))) {
        const category = mappingByAccount.get(line.accountId)?.cashFlowCategory;
        if (!category || category === CashFlowCategory.Cash) continue;
        const net = toMillimes(line.debit) - toMillimes(line.credit);
        const weight = net < 0n ? -net : net;
        weights.set(category, (weights.get(category) ?? 0n) + weight);
      }
      const totalWeight = [...weights.values()].reduce(
        (sum, value) => sum + value,
        0n,
      );
      if (!totalWeight) {
        unclassified += cashMovement;
        continue;
      }
      const items = [...weights.entries()];
      let allocated = 0n;
      items.forEach(([category, weight], index) => {
        const amount =
          index === items.length - 1
            ? cashMovement - allocated
            : (cashMovement * weight) / totalWeight;
        allocated += amount;
        categories.set(category, (categories.get(category) ?? 0n) + amount);
      });
    }
    const cashAccountIds = [...mappingByAccount.values()]
      .filter((item) => item.cashFlowCategory === CashFlowCategory.Cash)
      .map((item) => item.account.id);
    const opening = await this.cashBalance(
      organizationId,
      dossierId,
      cashAccountIds,
      this.addDays(range.startsOn, -1),
    );
    const closing = await this.cashBalance(
      organizationId,
      dossierId,
      cashAccountIds,
      range.endsOn,
    );
    const operatingCategories = [
      CashFlowCategory.OperatingCustomers,
      CashFlowCategory.OperatingSuppliersPersonnel,
      CashFlowCategory.OperatingInterest,
      CashFlowCategory.OperatingIncomeTax,
      CashFlowCategory.OtherOperating,
    ];
    const investingCategories = [
      CashFlowCategory.InvestingTangibleIntangible,
      CashFlowCategory.InvestingFinancial,
    ];
    const financingCategories = [
      CashFlowCategory.FinancingEquity,
      CashFlowCategory.FinancingDividends,
      CashFlowCategory.FinancingBorrowings,
    ];
    const total = (selected: CashFlowCategory[]) =>
      selected.reduce(
        (sum, category) => sum + (categories.get(category) ?? 0n),
        0n,
      );
    const operating = total(operatingCategories);
    const investing = total(investingCategories);
    const financing = total(financingCategories);
    const exchange = categories.get(CashFlowCategory.ExchangeEffect) ?? 0n;
    const variation =
      operating + investing + financing + exchange + unclassified;
    return {
      categories,
      operating,
      investing,
      financing,
      exchange,
      variation,
      opening,
      closing,
      unclassified,
    };
  }

  private async cashBalance(
    organizationId: string,
    dossierId: string,
    accountIds: string[],
    endsOn: string,
  ) {
    if (!accountIds.length) return 0n;
    const rows = await this.dataSource.query<Array<{ balance: string }>>(
      `SELECT COALESCE(SUM(l.debit-l.credit),0)::numeric(18,3) AS balance
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       WHERE e.organization_id=$1 AND e.dossier_id=$2 AND e.entry_date <= $3
         AND e.status IN ('COMPTABILISEE','EXTOURNEE') AND l.account_id = ANY($4::uuid[])`,
      [organizationId, dossierId, endsOn, accountIds],
    );
    return toMillimes(rows[0]?.balance ?? '0.000');
  }

  private accountAmounts(
    organizationId: string,
    dossierId: string,
    startsOn: string | null,
    endsOn: string,
    excludedEntryId: string | null = null,
  ) {
    return this.dataSource.query<AccountAmountRow[]>(
      `SELECT l.account_id AS "accountId",
              COALESCE(SUM(l.debit),0)::numeric(18,3) AS debit,
              COALESCE(SUM(l.credit),0)::numeric(18,3) AS credit
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       WHERE e.organization_id=$1 AND e.dossier_id=$2
         AND ($3::date IS NULL OR e.entry_date >= $3) AND e.entry_date <= $4
         AND e.status IN ('COMPTABILISEE','EXTOURNEE') AND ($5::uuid IS NULL OR e.id <> $5)
       GROUP BY l.account_id
       HAVING COALESCE(SUM(l.debit),0) <> 0 OR COALESCE(SUM(l.credit),0) <> 0`,
      [organizationId, dossierId, startsOn, endsOn, excludedEntryId],
    );
  }

  private entryLines(
    organizationId: string,
    dossierId: string,
    startsOn: string,
    endsOn: string,
  ) {
    return this.dataSource.query<EntryLineRow[]>(
      `SELECT e.id AS "entryId", l.account_id AS "accountId", l.debit, l.credit
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       WHERE e.organization_id=$1 AND e.dossier_id=$2
         AND e.entry_date BETWEEN $3 AND $4 AND e.status IN ('COMPTABILISEE','EXTOURNEE')
       ORDER BY e.entry_date,e.id,l.id`,
      [organizationId, dossierId, startsOn, endsOn],
    );
  }

  private async effectiveMappings(organizationId: string, dossierId: string) {
    const [accounts, custom] = await Promise.all([
      this.accounts.find({
        where: { organizationId, dossierId, isActive: true },
        order: { code: 'ASC' },
      }),
      this.mappings.findBy({ organizationId, dossierId }),
    ]);
    const customByAccount = new Map(
      custom.map((item) => [item.accountId, item]),
    );
    return accounts.map((account): EffectiveMapping => {
      const saved = customByAccount.get(account.id);
      const inferred = inferMapping(account);
      return {
        account,
        statementSection: saved
          ? saved.statementSection
          : inferred.statementSection,
        cashFlowCategory: saved
          ? saved.cashFlowCategory
          : inferred.cashFlowCategory,
        source: saved ? 'PERSONNALISE' : 'NC01_AUTOMATIQUE',
      };
    });
  }

  private cashFlowLines(
    current: Map<CashFlowCategory, bigint>,
    previous: Map<CashFlowCategory, bigint>,
    noteNumberByLine: Map<string, number>,
  ): FinancialStatementLine[] {
    return Object.values(CashFlowCategory)
      .filter((category) => category !== CashFlowCategory.Cash)
      .map((category) => ({
        code: category,
        label: CASH_FLOW_LABELS[category],
        group: this.cashFlowGroup(category),
        current: fromMillimes(current.get(category) ?? 0n),
        previous: fromMillimes(previous.get(category) ?? 0n),
        noteNumber: noteNumberByLine.get(category) ?? null,
      }));
  }

  private cashFlowGroup(category: CashFlowCategory) {
    if (category.startsWith('EXPLOITATION'))
      return 'Flux liés à l’exploitation';
    if (category.startsWith('INVESTISSEMENT'))
      return 'Flux liés aux activités d’investissement';
    if (category.startsWith('FINANCEMENT'))
      return 'Flux liés aux activités de financement';
    return 'Autres effets';
  }

  private accountValue(type: LedgerAccountType, row: AccountAmountRow) {
    const debit = toMillimes(row.debit);
    const credit = toMillimes(row.credit);
    return [
      LedgerAccountType.Liability,
      LedgerAccountType.Equity,
      LedgerAccountType.Revenue,
    ].includes(type)
      ? credit - debit
      : debit - credit;
  }

  private sumSections(
    sections: Map<FinancialStatementSection, bigint>,
    selected: FinancialStatementSection[],
  ) {
    return selected.reduce((sum, code) => sum + (sections.get(code) ?? 0n), 0n);
  }

  private sumLines(
    lines: FinancialStatementLine[],
    key: 'current' | 'previous',
  ) {
    return lines.reduce((sum, line) => sum + toMillimes(line[key]), 0n);
  }

  private pair(current: bigint, previous: bigint) {
    return { current: fromMillimes(current), previous: fromMillimes(previous) };
  }

  private control(
    code: string,
    label: string,
    current: bigint,
    previous: bigint,
    failureMessage: string,
  ): FinancialStatementReport['controls'][number] {
    const ok = current === 0n && previous === 0n;
    return {
      code,
      label,
      status: ok ? 'OK' : 'ANOMALIE',
      currentDifference: fromMillimes(current),
      previousDifference: fromMillimes(previous),
      message: ok ? 'Contrôle validé.' : failureMessage,
    };
  }

  private fiscalRange(dossier: ClientDossier, periodYear: number) {
    const month = dossier.fiscalYearStartMonth;
    const startDay = Math.min(
      dossier.fiscalYearStartDay,
      new Date(Date.UTC(periodYear, month, 0)).getUTCDate(),
    );
    const start = new Date(Date.UTC(periodYear, month - 1, startDay));
    const nextDay = Math.min(
      dossier.fiscalYearStartDay,
      new Date(Date.UTC(periodYear + 1, month, 0)).getUTCDate(),
    );
    const nextStart = new Date(Date.UTC(periodYear + 1, month - 1, nextDay));
    return {
      startsOn: start.toISOString().slice(0, 10),
      endsOn: new Date(nextStart.getTime() - 86_400_000)
        .toISOString()
        .slice(0, 10),
    };
  }

  private addDays(value: string, days: number) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private assertYear(year: number) {
    if (!Number.isInteger(year) || year < 1900 || year > 2200)
      throw new BadRequestException('L’année est invalide.');
  }

  private audit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    return this.audits.save(
      this.audits.create({
        organizationId,
        actorUserId,
        action,
        entityType: 'FinancialStatements',
        entityId,
        detailsJson,
      }),
    );
  }
}
