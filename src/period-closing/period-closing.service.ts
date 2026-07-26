import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AccountingJournal,
  AccountingPeriod,
  AccountingPeriodStatus,
  AccountingYearClosing,
  AccountingYearClosingStatus,
  AuditLog,
  ClientDossier,
  ClosingAdjustment,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  JournalType,
  LedgerAccount,
  LedgerAccountType,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  AdjustmentLineDto,
  CloseAccountingYearDto,
  CreateClosingAdjustmentDto,
} from './dto';
import { PeriodLockService } from './period-lock.service';

interface AccountBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  debit: string;
  credit: string;
}

interface AutomaticLine {
  accountId: string;
  label: string;
  debit: string;
  credit: string;
}

@Injectable()
export class PeriodClosingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AccountingPeriod)
    private readonly periods: Repository<AccountingPeriod>,
    @InjectRepository(ClosingAdjustment)
    private readonly adjustments: Repository<ClosingAdjustment>,
    @InjectRepository(AccountingYearClosing)
    private readonly closings: Repository<AccountingYearClosing>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(AccountingJournal)
    private readonly journals: Repository<AccountingJournal>,
    private readonly dossiers: DossiersService,
    private readonly locks: PeriodLockService,
  ) {}

  async listPeriods(
    organizationId: string,
    dossierId: string,
    year: number,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const existing = await this.periods.findBy({
      organizationId,
      dossierId,
      periodYear: year,
    });
    const map = new Map(existing.map((period) => [period.periodMonth, period]));
    return Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const month = index + 1;
        const dates = this.monthDates(year, month);
        const readiness = await this.periodReadiness(
          organizationId,
          dossierId,
          dates.startsOn,
          dates.endsOn,
        );
        return {
          ...(map.get(month) ?? {
            id: null,
            organizationId,
            dossierId,
            periodYear: year,
            periodMonth: month,
            startsOn: dates.startsOn,
            endsOn: dates.endsOn,
            status: AccountingPeriodStatus.Open,
            lockedByUserId: null,
            lockedAtUtc: null,
            reopenedByUserId: null,
            reopenedAtUtc: null,
            note: null,
          }),
          readiness,
        };
      }),
    );
  }

  async lockPeriod(
    organizationId: string,
    dossierId: string,
    year: number,
    month: number,
    userId: string,
    note?: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const dates = this.monthDates(year, month);
    if (dates.endsOn > new Date().toISOString().slice(0, 10))
      throw new ConflictException(
        'Une période future ne peut pas être verrouillée.',
      );
    const readiness = await this.periodReadiness(
      organizationId,
      dossierId,
      dates.startsOn,
      dates.endsOn,
    );
    if (!readiness.ready)
      throw new ConflictException(this.readinessMessage(readiness));

    return this.dataSource.transaction(async (manager) => {
      let period = await manager.findOne(AccountingPeriod, {
        where: {
          organizationId,
          dossierId,
          periodYear: year,
          periodMonth: month,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (period?.status === AccountingPeriodStatus.Closed)
        throw new ConflictException(
          'Cette période est clôturée définitivement.',
        );
      if (period?.status === AccountingPeriodStatus.Locked)
        throw new ConflictException('Cette période est déjà verrouillée.');
      period ??= manager.create(AccountingPeriod, {
        organizationId,
        dossierId,
        periodYear: year,
        periodMonth: month,
        startsOn: dates.startsOn,
        endsOn: dates.endsOn,
      });
      Object.assign(period, {
        status: AccountingPeriodStatus.Locked,
        lockedByUserId: userId,
        lockedAtUtc: new Date(),
        note: note?.trim() || null,
      });
      const saved = await manager.save(period);
      await this.audit(
        manager,
        organizationId,
        userId,
        'period.locked',
        saved.id,
        {
          year,
          month,
          note: saved.note,
        },
      );
      return saved;
    });
  }

  async reopenPeriod(
    organizationId: string,
    dossierId: string,
    year: number,
    month: number,
    userId: string,
    reason: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.transaction(async (manager) => {
      const period = await manager.findOne(AccountingPeriod, {
        where: {
          organizationId,
          dossierId,
          periodYear: year,
          periodMonth: month,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!period || period.status === AccountingPeriodStatus.Open)
        throw new ConflictException('Cette période est déjà ouverte.');
      if (period.status === AccountingPeriodStatus.Closed)
        throw new ConflictException(
          'Une période appartenant à un exercice clôturé ne peut pas être rouverte.',
        );
      period.status = AccountingPeriodStatus.Open;
      period.reopenedByUserId = userId;
      period.reopenedAtUtc = new Date();
      period.note = reason.trim();
      const saved = await manager.save(period);
      await this.audit(
        manager,
        organizationId,
        userId,
        'period.reopened',
        saved.id,
        {
          year,
          month,
          reason: period.note,
        },
      );
      return saved;
    });
  }

  async listAdjustments(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.adjustments.find({
      where: { organizationId, dossierId },
      relations: {
        journalEntry: { lines: { account: true } },
        reversalEntry: true,
      },
      order: { entryDate: 'DESC', createdAtUtc: 'DESC' },
      take: 500,
    });
  }

  async createAdjustment(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateClosingAdjustmentDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    if (dto.reversalDate && dto.reversalDate <= dto.entryDate)
      throw new BadRequestException(
        'La date d’extourne doit être postérieure à la régularisation.',
      );
    await this.locks.assertDateOpen(organizationId, dossierId, dto.entryDate);
    if (dto.reversalDate)
      await this.locks.assertDateOpen(
        organizationId,
        dossierId,
        dto.reversalDate,
      );
    const journal = await this.journals.findOneBy({
      id: dto.journalId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!journal || journal.type !== JournalType.Miscellaneous)
      throw new BadRequestException(
        'Les régularisations doivent utiliser un journal d’opérations diverses.',
      );
    await this.validateLines(organizationId, dossierId, dto.lines);

    return this.dataSource.transaction(async (manager) => {
      await this.locks.assertDateOpen(
        organizationId,
        dossierId,
        dto.entryDate,
        manager,
      );
      const lines = dto.lines.map((line) => ({
        accountId: line.accountId,
        label: line.label.trim(),
        debit: fromMillimes(toMillimes(line.debit)),
        credit: fromMillimes(toMillimes(line.credit)),
      }));
      const entry = await this.createAutomaticEntry(manager, {
        organizationId,
        dossierId,
        journalId: journal.id,
        entryDate: dto.entryDate,
        pieceReference: `REG-${dto.entryDate}-${dto.type}`.slice(0, 100),
        description: dto.description.trim(),
        userId,
        lines,
      });
      if (!entry) throw new BadRequestException('La régularisation est vide.');

      let reversal: JournalEntry | null = null;
      if (dto.reversalDate) {
        await this.locks.assertDateOpen(
          organizationId,
          dossierId,
          dto.reversalDate,
          manager,
        );
        reversal = await this.createAutomaticEntry(manager, {
          organizationId,
          dossierId,
          journalId: journal.id,
          entryDate: dto.reversalDate,
          pieceReference: `EXT-${entry.pieceReference}`.slice(0, 100),
          description: `Extourne automatique : ${dto.description}`.slice(
            0,
            300,
          ),
          userId,
          reversalEntryId: entry.id,
          lines: lines.map((line) => ({
            ...line,
            label: `Extourne : ${line.label}`.slice(0, 300),
            debit: line.credit,
            credit: line.debit,
          })),
        });
        entry.reversalEntryId = reversal?.id ?? null;
        await manager.save(entry);
      }
      const adjustment = await manager.save(
        manager.create(ClosingAdjustment, {
          organizationId,
          dossierId,
          type: dto.type,
          entryDate: dto.entryDate,
          description: dto.description.trim(),
          journalEntryId: entry.id,
          reversalDate: dto.reversalDate ?? null,
          reversalEntryId: reversal?.id ?? null,
          createdByUserId: userId,
        }),
      );
      await this.audit(
        manager,
        organizationId,
        userId,
        'closing_adjustment.created',
        adjustment.id,
        {
          type: dto.type,
          entryDate: dto.entryDate,
          reversalDate: dto.reversalDate,
        },
      );
      return manager.findOneOrFail(ClosingAdjustment, {
        where: { id: adjustment.id },
        relations: {
          journalEntry: { lines: { account: true } },
          reversalEntry: true,
        },
      });
    });
  }

  async yearReadiness(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const range = this.fiscalRange(dossier, periodYear);
    const months = this.monthsInRange(range.startsOn, range.endsOn);
    const periods = await this.periods.findBy({
      organizationId,
      dossierId,
      periodYear: In([...new Set(months.map((item) => item.year))]),
    });
    const periodMap = new Map(
      periods.map((period) => [
        `${period.periodYear}-${period.periodMonth}`,
        period.status,
      ]),
    );
    const unlockedPeriods = months.filter(
      (item) =>
        periodMap.get(`${item.year}-${item.month}`) !==
        AccountingPeriodStatus.Locked,
    );
    const readiness = await this.periodReadiness(
      organizationId,
      dossierId,
      range.startsOn,
      range.endsOn,
    );
    const existing = await this.closings.findOneBy({
      organizationId,
      dossierId,
      periodYear,
    });
    return {
      periodYear,
      ...range,
      existingClosing: existing,
      requiredPeriods: months.length,
      unlockedPeriods,
      ...readiness,
      ready:
        !existing &&
        unlockedPeriods.length === 0 &&
        readiness.ready &&
        range.endsOn < new Date().toISOString().slice(0, 10),
    };
  }

  async listClosings(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.closings.find({
      where: { organizationId, dossierId },
      relations: {
        resultAccount: true,
        closingJournalEntry: true,
        openingJournalEntry: true,
      },
      order: { periodYear: 'DESC' },
    });
  }

  async closeYear(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
    dto: CloseAccountingYearDto,
  ) {
    const readiness = await this.yearReadiness(
      organizationId,
      dossierId,
      periodYear,
      userId,
    );
    if (readiness.existingClosing)
      throw new ConflictException('Cet exercice est déjà clôturé.');
    if (readiness.endsOn >= new Date().toISOString().slice(0, 10))
      throw new ConflictException(
        'Un exercice ne peut être clôturé avant sa date de fin.',
      );
    if (readiness.unlockedPeriods.length)
      throw new ConflictException(
        `${readiness.unlockedPeriods.length} période(s) doivent être verrouillées avant la clôture.`,
      );
    if (!readiness.ready)
      throw new ConflictException(this.readinessMessage(readiness));

    const [closingJournal, openingJournal, resultAccount] = await Promise.all([
      this.journals.findOneBy({
        id: dto.closingJournalId,
        organizationId,
        dossierId,
        isActive: true,
      }),
      this.journals.findOneBy({
        id: dto.openingJournalId,
        organizationId,
        dossierId,
        isActive: true,
      }),
      this.accounts.findOneBy({
        id: dto.resultAccountId,
        organizationId,
        dossierId,
        isActive: true,
        allowsPosting: true,
      }),
    ]);
    if (
      !closingJournal ||
      !openingJournal ||
      closingJournal.type !== JournalType.Miscellaneous ||
      openingJournal.type !== JournalType.Miscellaneous
    )
      throw new BadRequestException(
        'La clôture et l’ouverture doivent utiliser un journal d’opérations diverses.',
      );
    if (!resultAccount || resultAccount.type !== LedgerAccountType.Equity)
      throw new BadRequestException(
        'Le compte de résultat doit être un compte mouvementable de capitaux propres.',
      );
    const openingDate = this.addDays(readiness.endsOn, 1);
    await this.locks.assertDateOpen(organizationId, dossierId, openingDate);

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `accounting-close:${dossierId}:${periodYear}`,
      ]);
      await manager.query(`SET LOCAL app.allow_closed_period = 'on'`);
      if (
        await manager.existsBy(AccountingYearClosing, { dossierId, periodYear })
      )
        throw new ConflictException('Cet exercice est déjà clôturé.');

      const profitAndLoss = await this.accountBalances(
        manager,
        organizationId,
        dossierId,
        readiness.startsOn,
        readiness.endsOn,
        [LedgerAccountType.Revenue, LedgerAccountType.Expense],
      );
      const closingLines: AutomaticLine[] = [];
      for (const row of profitAndLoss) {
        const balance = toMillimes(row.debit) - toMillimes(row.credit);
        if (balance === 0n) continue;
        closingLines.push({
          accountId: row.accountId,
          label: `Solde ${row.code} - ${row.name}`.slice(0, 300),
          debit: balance < 0n ? fromMillimes(-balance) : '0.000',
          credit: balance > 0n ? fromMillimes(balance) : '0.000',
        });
      }
      const closingDebit = closingLines.reduce(
        (sum, line) => sum + toMillimes(line.debit),
        0n,
      );
      const closingCredit = closingLines.reduce(
        (sum, line) => sum + toMillimes(line.credit),
        0n,
      );
      const netResult = closingDebit - closingCredit;
      if (netResult !== 0n) {
        closingLines.push({
          accountId: resultAccount.id,
          label:
            netResult > 0n ? 'Bénéfice de l’exercice' : 'Perte de l’exercice',
          debit: netResult < 0n ? fromMillimes(-netResult) : '0.000',
          credit: netResult > 0n ? fromMillimes(netResult) : '0.000',
        });
      }
      const closingEntry = await this.createAutomaticEntry(manager, {
        organizationId,
        dossierId,
        journalId: closingJournal.id,
        entryDate: readiness.endsOn,
        pieceReference: `CLOTURE-${periodYear}`,
        description: `Clôture de l’exercice ${periodYear}`,
        userId,
        lines: closingLines,
      });

      const balanceSheet = await this.accountBalances(
        manager,
        organizationId,
        dossierId,
        readiness.startsOn,
        readiness.endsOn,
        [
          LedgerAccountType.Asset,
          LedgerAccountType.Liability,
          LedgerAccountType.Equity,
        ],
      );
      const openingLines = balanceSheet
        .map((row) => {
          const balance = toMillimes(row.debit) - toMillimes(row.credit);
          return {
            accountId: row.accountId,
            label: `À-nouveau ${row.code} - ${row.name}`.slice(0, 300),
            debit: balance > 0n ? fromMillimes(balance) : '0.000',
            credit: balance < 0n ? fromMillimes(-balance) : '0.000',
          };
        })
        .filter(
          (line) =>
            toMillimes(line.debit) !== 0n || toMillimes(line.credit) !== 0n,
        );
      const openingEntry = await this.createAutomaticEntry(manager, {
        organizationId,
        dossierId,
        journalId: openingJournal.id,
        entryDate: openingDate,
        pieceReference: `AN-${periodYear + 1}`,
        description: `Report à nouveau de l’exercice ${periodYear}`,
        userId,
        lines: openingLines,
      });

      const months = this.monthsInRange(readiness.startsOn, readiness.endsOn);
      for (const month of months) {
        await manager.update(
          AccountingPeriod,
          {
            organizationId,
            dossierId,
            periodYear: month.year,
            periodMonth: month.month,
          },
          { status: AccountingPeriodStatus.Closed },
        );
      }
      const closing = await manager.save(
        manager.create(AccountingYearClosing, {
          organizationId,
          dossierId,
          periodYear,
          startsOn: readiness.startsOn,
          endsOn: readiness.endsOn,
          status: AccountingYearClosingStatus.Closed,
          netResult: fromMillimes(netResult),
          resultAccountId: resultAccount.id,
          closingJournalEntryId: closingEntry?.id ?? null,
          openingJournalEntryId: openingEntry?.id ?? null,
          closedByUserId: userId,
          closedAtUtc: new Date(),
        }),
      );
      await this.audit(
        manager,
        organizationId,
        userId,
        'accounting_year.closed',
        closing.id,
        {
          periodYear,
          startsOn: readiness.startsOn,
          endsOn: readiness.endsOn,
          netResult: closing.netResult,
          closingEntryId: closing.closingJournalEntryId,
          openingEntryId: closing.openingJournalEntryId,
        },
      );
      return manager.findOneOrFail(AccountingYearClosing, {
        where: { id: closing.id },
        relations: {
          resultAccount: true,
          closingJournalEntry: { lines: { account: true } },
          openingJournalEntry: { lines: { account: true } },
        },
      });
    });
  }

  private async periodReadiness(
    organizationId: string,
    dossierId: string,
    startsOn: string,
    endsOn: string,
  ) {
    const [drafts, unpostedDepreciation, unreconciledStatements] =
      await Promise.all([
        this.dataSource.query<Array<{ count: string }>>(
          `SELECT COUNT(*)::text AS count FROM accounting.journal_entries
           WHERE organization_id=$1 AND dossier_id=$2 AND entry_date BETWEEN $3 AND $4
             AND status NOT IN ('COMPTABILISEE','EXTOURNEE')`,
          [organizationId, dossierId, startsOn, endsOn],
        ),
        this.dataSource.query<Array<{ count: string }>>(
          `SELECT COUNT(*)::text AS count FROM accounting.asset_depreciation_periods
           WHERE organization_id=$1 AND dossier_id=$2 AND period_end BETWEEN $3 AND $4
             AND accounting_amount > 0 AND status='PLANIFIEE'`,
          [organizationId, dossierId, startsOn, endsOn],
        ),
        this.dataSource.query<Array<{ count: string }>>(
          `SELECT COUNT(*)::text AS count FROM accounting.bank_statements
           WHERE organization_id=$1 AND dossier_id=$2
             AND period_start <= $4 AND period_end >= $3 AND status <> 'RAPPROCHE'`,
          [organizationId, dossierId, startsOn, endsOn],
        ),
      ]);
    const result = {
      draftEntries: Number(drafts[0]?.count ?? 0),
      unpostedDepreciation: Number(unpostedDepreciation[0]?.count ?? 0),
      unreconciledStatements: Number(unreconciledStatements[0]?.count ?? 0),
    };
    return {
      ...result,
      ready:
        result.draftEntries === 0 &&
        result.unpostedDepreciation === 0 &&
        result.unreconciledStatements === 0,
    };
  }

  private readinessMessage(readiness: {
    draftEntries: number;
    unpostedDepreciation: number;
    unreconciledStatements: number;
  }) {
    return `Clôture impossible : ${readiness.draftEntries} écriture(s) brouillon, ${readiness.unpostedDepreciation} dotation(s) non comptabilisée(s), ${readiness.unreconciledStatements} relevé(s) bancaire(s) non rapproché(s).`;
  }

  private async validateLines(
    organizationId: string,
    dossierId: string,
    lines: AdjustmentLineDto[],
  ) {
    const ids = [...new Set(lines.map((line) => line.accountId))];
    const accounts = await this.accounts.findBy({
      id: In(ids),
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (accounts.length !== ids.length)
      throw new BadRequestException(
        'Une ligne utilise un compte inexistant ou non mouvementable.',
      );
    let debit = 0n;
    let credit = 0n;
    for (const line of lines) {
      const lineDebit = toMillimes(line.debit, 'Débit');
      const lineCredit = toMillimes(line.credit, 'Crédit');
      if (
        (lineDebit > 0n && lineCredit > 0n) ||
        (lineDebit === 0n && lineCredit === 0n)
      )
        throw new BadRequestException(
          'Chaque ligne doit contenir soit un débit, soit un crédit.',
        );
      debit += lineDebit;
      credit += lineCredit;
    }
    if (debit === 0n || debit !== credit)
      throw new BadRequestException('La régularisation doit être équilibrée.');
  }

  private async createAutomaticEntry(
    manager: EntityManager,
    input: {
      organizationId: string;
      dossierId: string;
      journalId: string;
      entryDate: string;
      pieceReference: string;
      description: string;
      userId: string;
      lines: AutomaticLine[];
      reversalEntryId?: string;
    },
  ) {
    if (!input.lines.length) return null;
    const debit = input.lines.reduce(
      (sum, line) => sum + toMillimes(line.debit),
      0n,
    );
    const credit = input.lines.reduce(
      (sum, line) => sum + toMillimes(line.credit),
      0n,
    );
    if (debit === 0n || debit !== credit)
      throw new ConflictException(
        'L’écriture automatique de clôture n’est pas équilibrée.',
      );
    const entry = await manager.save(
      manager.create(JournalEntry, {
        organizationId: input.organizationId,
        dossierId: input.dossierId,
        journalId: input.journalId,
        entryDate: input.entryDate,
        pieceReference: input.pieceReference.slice(0, 100),
        description: input.description.slice(0, 300),
        status: JournalEntryStatus.Posted,
        totalDebit: fromMillimes(debit),
        totalCredit: fromMillimes(credit),
        sourceDocumentId: null,
        createdByUserId: input.userId,
        postedByUserId: input.userId,
        postedAtUtc: new Date(),
        reversalEntryId: input.reversalEntryId ?? null,
      }),
    );
    await manager.save(
      input.lines.map((line) =>
        manager.create(JournalEntryLine, {
          organizationId: input.organizationId,
          entryId: entry.id,
          accountId: line.accountId,
          label: line.label.slice(0, 300),
          debit: line.debit,
          credit: line.credit,
          thirdPartyName: null,
        }),
      ),
    );
    return entry;
  }

  private accountBalances(
    manager: EntityManager,
    organizationId: string,
    dossierId: string,
    startsOn: string,
    endsOn: string,
    types: LedgerAccountType[],
  ) {
    return manager.query<AccountBalanceRow[]>(
      `SELECT a.id AS "accountId", a.code, a.name, a.type,
              COALESCE(SUM(l.debit),0)::numeric(15,3) AS debit,
              COALESCE(SUM(l.credit),0)::numeric(15,3) AS credit
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       JOIN accounting.ledger_accounts a ON a.id=l.account_id
       WHERE e.organization_id=$1 AND e.dossier_id=$2
         AND e.entry_date BETWEEN $3 AND $4 AND e.status IN ('COMPTABILISEE','EXTOURNEE')
         AND a.type = ANY($5::varchar[])
       GROUP BY a.id,a.code,a.name,a.type
       HAVING COALESCE(SUM(l.debit),0) <> COALESCE(SUM(l.credit),0)
       ORDER BY a.code`,
      [organizationId, dossierId, startsOn, endsOn, types],
    );
  }

  private fiscalRange(dossier: ClientDossier, periodYear: number) {
    const month = dossier.fiscalYearStartMonth;
    const startDay = Math.min(
      dossier.fiscalYearStartDay,
      new Date(Date.UTC(periodYear, month, 0)).getUTCDate(),
    );
    const start = new Date(Date.UTC(periodYear, month - 1, startDay));
    const nextYearDay = Math.min(
      dossier.fiscalYearStartDay,
      new Date(Date.UTC(periodYear + 1, month, 0)).getUTCDate(),
    );
    const nextStart = new Date(
      Date.UTC(periodYear + 1, month - 1, nextYearDay),
    );
    const end = new Date(nextStart.getTime() - 86_400_000);
    return {
      startsOn: start.toISOString().slice(0, 10),
      endsOn: end.toISOString().slice(0, 10),
    };
  }

  private monthDates(year: number, month: number) {
    if (!Number.isInteger(year) || year < 1900 || year > 2200)
      throw new BadRequestException('L’année est invalide.');
    if (!Number.isInteger(month) || month < 1 || month > 12)
      throw new BadRequestException('Le mois est invalide.');
    return {
      startsOn: new Date(Date.UTC(year, month - 1, 1))
        .toISOString()
        .slice(0, 10),
      endsOn: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    };
  }

  private monthsInRange(startsOn: string, endsOn: string) {
    const start = new Date(`${startsOn}T00:00:00.000Z`);
    const end = new Date(`${endsOn}T00:00:00.000Z`);
    const result: Array<{ year: number; month: number }> = [];
    let cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    while (cursor <= end) {
      result.push({
        year: cursor.getUTCFullYear(),
        month: cursor.getUTCMonth() + 1,
      });
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
    }
    return result;
  }

  private addDays(value: string, days: number) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private audit(
    manager: EntityManager,
    organizationId: string,
    actorUserId: string,
    action: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    return manager.save(
      manager.create(AuditLog, {
        organizationId,
        actorUserId,
        action,
        entityType: 'AccountingClosing',
        entityId,
        detailsJson,
      }),
    );
  }
}
