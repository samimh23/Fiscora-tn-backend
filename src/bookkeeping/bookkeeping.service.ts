import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  AccountReconciliation,
  AccountingDocument,
  AccountingJournal,
  AuditLog,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  LedgerAccount,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { fromMillimes, toMillimes } from '../common/money';
import {
  CreateEntryDto,
  CreateJournalDto,
  CreateReconciliationDto,
  ExportReportQueryDto,
  ReportQueryDto,
} from './dto';
import { PeriodLockService } from '../period-closing/period-lock.service';
import {
  BookkeepingExportService,
  ExportColumn,
} from './bookkeeping-export.service';

@Injectable()
export class BookkeepingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AccountingJournal)
    private readonly journals: Repository<AccountingJournal>,
    @InjectRepository(JournalEntry)
    private readonly entries: Repository<JournalEntry>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(AccountingDocument)
    private readonly documents: Repository<AccountingDocument>,
    @InjectRepository(AccountReconciliation)
    private readonly reconciliations: Repository<AccountReconciliation>,
    @InjectRepository(AuditLog)
    private readonly audits: Repository<AuditLog>,
    private readonly dossiers: DossiersService,
    private readonly periodLocks: PeriodLockService,
    private readonly exports: BookkeepingExportService,
  ) {}

  async listJournals(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.journals.find({
      where: { organizationId, dossierId, isActive: true },
      order: { code: 'ASC' },
    });
  }

  async createJournal(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateJournalDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const journal = await this.journals.save(
      this.journals.create({
        organizationId,
        dossierId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        type: dto.type,
        isActive: true,
      }),
    );
    await this.addAudit(
      organizationId,
      userId,
      'accounting_journal.created',
      'AccountingJournal',
      journal.id,
      { dossierId, code: journal.code },
    );
    return journal;
  }

  async listEntries(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.entries.find({
      where: { organizationId, dossierId },
      relations: { journal: true, lines: { account: true } },
      order: { entryDate: 'DESC', createdAtUtc: 'DESC' },
      take: 500,
    });
  }

  async getEntry(
    organizationId: string,
    dossierId: string,
    entryId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const entry = await this.entries.findOne({
      where: { id: entryId, organizationId, dossierId },
      relations: { journal: true, lines: { account: true } },
    });
    if (!entry) throw new NotFoundException("L'écriture est introuvable.");
    return entry;
  }

  async createEntry(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateEntryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      dto.entryDate,
    );
    const journal = await this.journals.findOneBy({
      id: dto.journalId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!journal) throw new NotFoundException('Le journal est introuvable.');
    const accountIds = [...new Set(dto.lines.map((line) => line.accountId))];
    const accounts = await this.accounts.findBy({
      id: In(accountIds),
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (accounts.length !== accountIds.length)
      throw new BadRequestException(
        'Une ligne utilise un compte inexistant ou non mouvementable.',
      );
    if (
      dto.sourceDocumentId &&
      !(await this.documents.existsBy({
        id: dto.sourceDocumentId,
        organizationId,
        dossierId,
        deletedAtUtc: IsNull(),
      }))
    )
      throw new NotFoundException('Le document source est introuvable.');
    const totals = this.totals(dto);
    return this.dataSource.transaction(async (manager) => {
      const entry = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: dto.journalId,
          entryDate: dto.entryDate,
          pieceReference: dto.pieceReference.trim(),
          description: dto.description.trim(),
          status: JournalEntryStatus.Draft,
          totalDebit: totals.debit,
          totalCredit: totals.credit,
          sourceDocumentId: dto.sourceDocumentId ?? null,
          createdByUserId: userId,
          postedByUserId: null,
          postedAtUtc: null,
          reversalEntryId: null,
        }),
      );
      const lines = dto.lines.map((line) =>
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: entry.id,
          accountId: line.accountId,
          label: line.label.trim(),
          debit: fromMillimes(toMillimes(line.debit)),
          credit: fromMillimes(toMillimes(line.credit)),
          thirdPartyName: line.thirdPartyName?.trim() || null,
        }),
      );
      await manager.save(lines);
      await this.addAudit(
        organizationId,
        userId,
        'journal_entry.created',
        'JournalEntry',
        entry.id,
        {
          dossierId,
          status: entry.status,
          pieceReference: entry.pieceReference,
          totalDebit: entry.totalDebit,
        },
        manager,
      );
      return manager.findOneOrFail(JournalEntry, {
        where: { id: entry.id },
        relations: { journal: true, lines: { account: true } },
      });
    });
  }

  async updateEntry(
    organizationId: string,
    dossierId: string,
    entryId: string,
    userId: string,
    dto: CreateEntryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      dto.entryDate,
    );
    const journal = await this.journals.findOneBy({
      id: dto.journalId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!journal) throw new NotFoundException('Le journal est introuvable.');
    const accountIds = [...new Set(dto.lines.map((line) => line.accountId))];
    const accounts = await this.accounts.findBy({
      id: In(accountIds),
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (accounts.length !== accountIds.length)
      throw new BadRequestException(
        'Une ligne utilise un compte inexistant ou non mouvementable.',
      );
    if (
      dto.sourceDocumentId &&
      !(await this.documents.existsBy({
        id: dto.sourceDocumentId,
        organizationId,
        dossierId,
        deletedAtUtc: IsNull(),
      }))
    )
      throw new NotFoundException('Le document source est introuvable.');
    const totals = this.totals(dto);

    return this.dataSource.transaction(async (manager) => {
      const entry = await manager.findOne(JournalEntry, {
        where: { id: entryId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entry) throw new NotFoundException("L'écriture est introuvable.");
      if (
        ![JournalEntryStatus.Draft, JournalEntryStatus.Rejected].includes(
          entry.status,
        )
      )
        throw new ConflictException(
          'Seule une écriture brouillon ou rejetée peut être modifiée.',
        );
      const previousStatus = entry.status;

      Object.assign(entry, {
        journalId: dto.journalId,
        entryDate: dto.entryDate,
        pieceReference: dto.pieceReference.trim(),
        description: dto.description.trim(),
        status: JournalEntryStatus.Draft,
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        sourceDocumentId: dto.sourceDocumentId ?? null,
        submittedByUserId: null,
        submittedAtUtc: null,
        reviewedByUserId: null,
        reviewedAtUtc: null,
        reviewComment: null,
      });
      await manager.save(entry);
      await manager.delete(JournalEntryLine, { entryId: entry.id });
      await manager.save(
        dto.lines.map((line) =>
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: entry.id,
            accountId: line.accountId,
            label: line.label.trim(),
            debit: fromMillimes(toMillimes(line.debit)),
            credit: fromMillimes(toMillimes(line.credit)),
            thirdPartyName: line.thirdPartyName?.trim() || null,
          }),
        ),
      );
      await this.addAudit(
        organizationId,
        userId,
        'journal_entry.updated',
        'JournalEntry',
        entry.id,
        {
          dossierId,
          previousStatus,
          status: JournalEntryStatus.Draft,
          totalDebit: entry.totalDebit,
        },
        manager,
      );
      return manager.findOneOrFail(JournalEntry, {
        where: { id: entry.id },
        relations: { journal: true, lines: { account: true } },
      });
    });
  }

  async submit(
    organizationId: string,
    dossierId: string,
    entryId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const entry = await this.entries.findOne({
      where: { id: entryId, organizationId, dossierId },
      relations: { lines: true },
    });
    if (!entry) throw new NotFoundException("L'écriture est introuvable.");
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      entry.entryDate,
    );
    if (
      ![JournalEntryStatus.Draft, JournalEntryStatus.Rejected].includes(
        entry.status,
      )
    )
      throw new ConflictException(
        'Seule une écriture brouillon ou rejetée peut être soumise.',
      );
    if (
      toMillimes(entry.totalDebit) === 0n ||
      toMillimes(entry.totalDebit) !== toMillimes(entry.totalCredit)
    )
      throw new ConflictException(
        'Une écriture doit être équilibrée avant validation.',
      );
    Object.assign(entry, {
      status: JournalEntryStatus.PendingReview,
      submittedByUserId: userId,
      submittedAtUtc: new Date(),
      reviewedByUserId: null,
      reviewedAtUtc: null,
      reviewComment: null,
    });
    await this.entries.save(entry);
    await this.addAudit(
      organizationId,
      userId,
      'journal_entry.submitted',
      'JournalEntry',
      entry.id,
      { dossierId },
    );
    return entry;
  }

  async reject(
    organizationId: string,
    dossierId: string,
    entryId: string,
    userId: string,
    comment: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const entry = await this.entries.findOneBy({
      id: entryId,
      organizationId,
      dossierId,
    });
    if (!entry) throw new NotFoundException("L'écriture est introuvable.");
    if (entry.status !== JournalEntryStatus.PendingReview)
      throw new ConflictException(
        'Seule une écriture à valider peut être rejetée.',
      );
    Object.assign(entry, {
      status: JournalEntryStatus.Rejected,
      reviewedByUserId: userId,
      reviewedAtUtc: new Date(),
      reviewComment: comment.trim(),
    });
    await this.entries.save(entry);
    await this.addAudit(
      organizationId,
      userId,
      'journal_entry.rejected',
      'JournalEntry',
      entry.id,
      { dossierId, comment: entry.reviewComment },
    );
    return entry;
  }

  async post(
    organizationId: string,
    dossierId: string,
    entryId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const entry = await this.entries.findOne({
      where: { id: entryId, organizationId, dossierId },
      relations: { lines: true },
    });
    if (!entry) throw new NotFoundException('L’écriture est introuvable.');
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      entry.entryDate,
    );
    if (entry.status !== JournalEntryStatus.PendingReview)
      throw new ConflictException('Cette écriture est déjà comptabilisée.');
    if (
      toMillimes(entry.totalDebit) === 0n ||
      toMillimes(entry.totalDebit) !== toMillimes(entry.totalCredit)
    )
      throw new ConflictException(
        'Une écriture doit être équilibrée avant comptabilisation.',
      );
    entry.status = JournalEntryStatus.Posted;
    entry.postedByUserId = userId;
    entry.postedAtUtc = new Date();
    entry.reviewedByUserId = userId;
    entry.reviewedAtUtc = new Date();
    const saved = await this.entries.save(entry);
    await this.addAudit(
      organizationId,
      userId,
      'journal_entry.approved',
      'JournalEntry',
      entry.id,
      { dossierId },
    );
    return saved;
  }

  async reverse(
    organizationId: string,
    dossierId: string,
    entryId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const original = await this.entries.findOne({
      where: { id: entryId, organizationId, dossierId },
      relations: { lines: true },
    });
    if (!original || original.status !== JournalEntryStatus.Posted)
      throw new ConflictException(
        'Seule une écriture comptabilisée peut être extournée.',
      );
    const reversalDate = new Date().toISOString().slice(0, 10);
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      reversalDate,
    );
    return this.dataSource.transaction(async (manager) => {
      const reversal = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: original.journalId,
          entryDate: reversalDate,
          pieceReference: `EXT-${original.pieceReference}`.slice(0, 100),
          description: `Extourne : ${original.description}`.slice(0, 300),
          status: JournalEntryStatus.Posted,
          totalDebit: original.totalCredit,
          totalCredit: original.totalDebit,
          sourceDocumentId: original.sourceDocumentId,
          createdByUserId: userId,
          postedByUserId: userId,
          postedAtUtc: new Date(),
          reversalEntryId: original.id,
        }),
      );
      await manager.save(
        original.lines.map((line) =>
          manager.create(JournalEntryLine, {
            organizationId,
            entryId: reversal.id,
            accountId: line.accountId,
            label: `Extourne : ${line.label}`.slice(0, 300),
            debit: line.credit,
            credit: line.debit,
            thirdPartyName: line.thirdPartyName,
          }),
        ),
      );
      original.status = JournalEntryStatus.Reversed;
      original.reversalEntryId = reversal.id;
      await manager.save(original);
      await this.addAudit(
        organizationId,
        userId,
        'journal_entry.reversed',
        'JournalEntry',
        original.id,
        { dossierId, reversalEntryId: reversal.id },
        manager,
      );
      return manager.findOneOrFail(JournalEntry, {
        where: { id: reversal.id },
        relations: { lines: { account: true }, journal: true },
      });
    });
  }

  async trialBalance(
    organizationId: string,
    dossierId: string,
    userId: string,
    query: ReportQueryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.query<
      Array<{
        accountId: string;
        code: string;
        name: string;
        totalDebit: string;
        totalCredit: string;
        balance: string;
      }>
    >(
      `SELECT a.id AS "accountId", a.code, a.name,
        COALESCE(SUM(l.debit),0)::numeric(15,3) AS "totalDebit",
        COALESCE(SUM(l.credit),0)::numeric(15,3) AS "totalCredit",
        (COALESCE(SUM(l.debit),0)-COALESCE(SUM(l.credit),0))::numeric(15,3) AS balance
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       JOIN accounting.ledger_accounts a ON a.id=l.account_id
       WHERE a.organization_id=$1 AND e.dossier_id=$2
         AND e.entry_date BETWEEN $3 AND $4 AND e.status IN ('COMPTABILISEE','EXTOURNEE')
       GROUP BY a.id,a.code,a.name
       HAVING COALESCE(SUM(l.debit),0) <> 0 OR COALESCE(SUM(l.credit),0) <> 0
       ORDER BY a.code`,
      [organizationId, dossierId, query.from, query.to],
    );
  }

  async generalLedger(
    organizationId: string,
    dossierId: string,
    userId: string,
    query: ReportQueryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.query<
      Array<{
        entryDate: string;
        journalCode: string;
        pieceReference: string;
        accountCode: string;
        accountName: string;
        label: string;
        debit: string;
        credit: string;
        thirdPartyName: string | null;
        entryId: string;
        lineId: string;
        sourceDocumentId: string | null;
        status: JournalEntryStatus;
        letterCode: string | null;
        reconciliationId: string | null;
      }>
    >(
      `SELECT e.entry_date AS "entryDate", j.code AS "journalCode",
        e.piece_reference AS "pieceReference", a.code AS "accountCode",
        a.name AS "accountName", l.label, l.debit, l.credit, l.third_party_name AS "thirdPartyName",
        e.id AS "entryId", l.id AS "lineId", e.source_document_id AS "sourceDocumentId",
        e.status, l.letter_code AS "letterCode", l.reconciliation_id AS "reconciliationId"
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       JOIN accounting.accounting_journals j ON j.id=e.journal_id
       JOIN accounting.ledger_accounts a ON a.id=l.account_id
       WHERE e.organization_id=$1 AND e.dossier_id=$2
         AND e.entry_date BETWEEN $3 AND $4 AND e.status IN ('COMPTABILISEE','EXTOURNEE')
       ORDER BY a.code,e.entry_date,e.created_at_utc`,
      [organizationId, dossierId, query.from, query.to],
    );
  }

  async financialSummary(
    organizationId: string,
    dossierId: string,
    userId: string,
    query: ReportQueryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const rows = await this.dataSource.query<
      Array<{ type: string; debit: string; credit: string }>
    >(
      `SELECT a.type, COALESCE(SUM(l.debit),0)::numeric(15,3) AS debit,
        COALESCE(SUM(l.credit),0)::numeric(15,3) AS credit
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       JOIN accounting.ledger_accounts a ON a.id=l.account_id
       WHERE e.organization_id=$1 AND e.dossier_id=$2
         AND e.entry_date BETWEEN $3 AND $4 AND e.status IN ('COMPTABILISEE','EXTOURNEE')
       GROUP BY a.type`,
      [organizationId, dossierId, query.from, query.to],
    );
    const balances = Object.fromEntries(
      rows.map((row) => {
        const debit = toMillimes(row.debit);
        const credit = toMillimes(row.credit);
        const creditNature = ['Liability', 'Equity', 'Revenue'].includes(
          row.type,
        );
        return [
          row.type,
          fromMillimes(creditNature ? credit - debit : debit - credit),
        ];
      }),
    ) as Record<string, string>;
    const revenue = toMillimes(balances.Revenue ?? '0.000');
    const expense = toMillimes(balances.Expense ?? '0.000');
    return {
      assets: balances.Asset ?? '0.000',
      liabilities: balances.Liability ?? '0.000',
      equity: balances.Equity ?? '0.000',
      revenue: fromMillimes(revenue),
      expenses: fromMillimes(expense),
      netResult: fromMillimes(revenue - expense),
    };
  }

  async agedBalance(
    organizationId: string,
    dossierId: string,
    userId: string,
    query: ReportQueryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.query<
      Array<{
        thirdPartyName: string;
        totalDebit: string;
        totalCredit: string;
        balance: string;
      }>
    >(
      `SELECT l.third_party_name AS "thirdPartyName",
        SUM(l.debit)::numeric(15,3) AS "totalDebit",
        SUM(l.credit)::numeric(15,3) AS "totalCredit",
        (SUM(l.debit)-SUM(l.credit))::numeric(15,3) AS balance
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       WHERE e.organization_id=$1 AND e.dossier_id=$2
         AND e.entry_date BETWEEN $3 AND $4 AND e.status IN ('COMPTABILISEE','EXTOURNEE')
         AND l.third_party_name IS NOT NULL
       GROUP BY l.third_party_name ORDER BY l.third_party_name`,
      [organizationId, dossierId, query.from, query.to],
    );
  }

  async listReconciliations(
    organizationId: string,
    dossierId: string,
    userId: string,
    accountId?: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.reconciliations.find({
      where: accountId
        ? { organizationId, dossierId, accountId }
        : { organizationId, dossierId },
      relations: { account: true, lines: { entry: true } },
      order: { reconciliationDate: 'DESC', createdAtUtc: 'DESC' },
    });
  }

  async reconcile(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateReconciliationDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const uniqueIds = [...new Set(dto.lineIds)];
    if (uniqueIds.length !== dto.lineIds.length)
      throw new BadRequestException(
        'Une ligne ne peut être sélectionnée deux fois.',
      );
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `lettrage:${dossierId}`,
      ]);
      const account = await manager.findOneBy(LedgerAccount, {
        id: dto.accountId,
        organizationId,
        dossierId,
        isActive: true,
      });
      if (!account)
        throw new NotFoundException(
          'Le compte à lettrer est introuvable dans ce dossier.',
        );
      const lines = await manager.find(JournalEntryLine, {
        where: { id: In(uniqueIds), organizationId, accountId: dto.accountId },
        relations: { entry: true },
      });
      if (
        lines.length !== uniqueIds.length ||
        lines.some((line) => line.entry.dossierId !== dossierId)
      )
        throw new BadRequestException(
          'Toutes les lignes doivent appartenir au même compte et au même dossier.',
        );
      if (lines.some((line) => line.reconciliationId))
        throw new ConflictException('Une des lignes est déjà lettrée.');
      if (
        lines.some(
          (line) =>
            ![JournalEntryStatus.Posted, JournalEntryStatus.Reversed].includes(
              line.entry.status,
            ),
        )
      )
        throw new ConflictException(
          'Seules les écritures comptabilisées peuvent être lettrées.',
        );
      const debit = lines.reduce(
        (sum, line) => sum + toMillimes(line.debit),
        0n,
      );
      const credit = lines.reduce(
        (sum, line) => sum + toMillimes(line.credit),
        0n,
      );
      if (debit === 0n || debit !== credit)
        throw new ConflictException(
          'Le lettrage doit équilibrer exactement les débits et les crédits.',
        );
      const count = await manager.count(AccountReconciliation, {
        where: { dossierId },
      });
      const date =
        dto.reconciliationDate ?? new Date().toISOString().slice(0, 10);
      const code = `LET-${date.slice(0, 4)}-${String(count + 1).padStart(6, '0')}`;
      const reconciliation = await manager.save(
        manager.create(AccountReconciliation, {
          organizationId,
          dossierId,
          accountId: dto.accountId,
          code,
          reconciliationDate: date,
          totalDebit: fromMillimes(debit),
          totalCredit: fromMillimes(credit),
          createdByUserId: userId,
        }),
      );
      const now = new Date();
      lines.forEach((line) => {
        line.reconciliationId = reconciliation.id;
        line.letterCode = code;
        line.reconciledAtUtc = now;
      });
      await manager.save(lines);
      await this.addAudit(
        organizationId,
        userId,
        'account_reconciliation.created',
        'AccountReconciliation',
        reconciliation.id,
        {
          dossierId,
          accountId: dto.accountId,
          code,
          lineIds: uniqueIds,
          total: reconciliation.totalDebit,
        },
        manager,
      );
      return manager.findOneOrFail(AccountReconciliation, {
        where: { id: reconciliation.id },
        relations: { account: true, lines: { entry: true } },
      });
    });
  }

  async unreconcile(
    organizationId: string,
    dossierId: string,
    reconciliationId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(AccountReconciliation, {
        where: { id: reconciliationId, organizationId, dossierId },
        relations: { lines: true },
      });
      if (!item) throw new NotFoundException('Le lettrage est introuvable.');
      item.lines.forEach((line) => {
        line.reconciliationId = null;
        line.letterCode = null;
        line.reconciledAtUtc = null;
      });
      await manager.save(item.lines);
      await manager.remove(item);
      await this.addAudit(
        organizationId,
        userId,
        'account_reconciliation.deleted',
        'AccountReconciliation',
        reconciliationId,
        { dossierId, code: item.code },
        manager,
      );
      return { deleted: true };
    });
  }

  async exportReport(
    organizationId: string,
    dossierId: string,
    userId: string,
    report: string,
    query: ExportReportQueryDto,
  ) {
    const definitions: Record<
      string,
      {
        title: string;
        columns: ExportColumn[];
        load: () => Promise<Array<Record<string, unknown>>>;
      }
    > = {
      'trial-balance': {
        title: 'Balance générale',
        columns: [
          { key: 'code', label: 'Compte', width: 12 },
          { key: 'name', label: 'Libellé', width: 36 },
          { key: 'totalDebit', label: 'Débit', width: 16 },
          { key: 'totalCredit', label: 'Crédit', width: 16 },
          { key: 'balance', label: 'Solde', width: 16 },
        ],
        load: async () =>
          this.trialBalance(
            organizationId,
            dossierId,
            userId,
            query,
          ) as unknown as Array<Record<string, unknown>>,
      },
      'general-ledger': {
        title: 'Grand livre',
        columns: [
          { key: 'entryDate', label: 'Date', width: 12 },
          { key: 'journalCode', label: 'Journal', width: 10 },
          { key: 'pieceReference', label: 'Pièce', width: 14 },
          { key: 'accountCode', label: 'Compte', width: 12 },
          { key: 'accountName', label: 'Libellé compte', width: 25 },
          { key: 'label', label: 'Libellé écriture', width: 28 },
          { key: 'debit', label: 'Débit', width: 14 },
          { key: 'credit', label: 'Crédit', width: 14 },
          { key: 'letterCode', label: 'Lettrage', width: 12 },
        ],
        load: async () =>
          this.generalLedger(
            organizationId,
            dossierId,
            userId,
            query,
          ) as unknown as Array<Record<string, unknown>>,
      },
      'aged-balance': {
        title: 'Balance auxiliaire',
        columns: [
          { key: 'thirdPartyName', label: 'Tiers', width: 36 },
          { key: 'totalDebit', label: 'Débit', width: 18 },
          { key: 'totalCredit', label: 'Crédit', width: 18 },
          { key: 'balance', label: 'Solde', width: 18 },
        ],
        load: async () =>
          this.agedBalance(
            organizationId,
            dossierId,
            userId,
            query,
          ) as unknown as Array<Record<string, unknown>>,
      },
      entries: {
        title: 'Journal des écritures',
        columns: [
          { key: 'entryDate', label: 'Date', width: 12 },
          { key: 'journal', label: 'Journal', width: 10 },
          { key: 'pieceReference', label: 'Pièce', width: 14 },
          { key: 'description', label: 'Description', width: 30 },
          { key: 'status', label: 'Statut', width: 16 },
          { key: 'totalDebit', label: 'Débit', width: 14 },
          { key: 'totalCredit', label: 'Crédit', width: 14 },
        ],
        load: async () =>
          (await this.listEntries(organizationId, dossierId, userId)).map(
            (entry) => ({
              entryDate: entry.entryDate,
              journal: entry.journal.code,
              pieceReference: entry.pieceReference,
              description: entry.description,
              status: entry.status,
              totalDebit: entry.totalDebit,
              totalCredit: entry.totalCredit,
            }),
          ),
      },
    };
    const definition = definitions[report];
    if (!definition) throw new BadRequestException('Rapport non exportable.');
    const rows = await definition.load();
    const subtitle = `Période du ${query.from} au ${query.to}`;
    const buffer =
      query.format === 'xlsx'
        ? await this.exports.xlsx(definition.title, definition.columns, rows)
        : await this.exports.pdf(
            definition.title,
            subtitle,
            definition.columns,
            rows,
          );
    await this.addAudit(
      organizationId,
      userId,
      'accounting_report.exported',
      'ClientDossier',
      dossierId,
      {
        dossierId,
        report,
        format: query.format,
        from: query.from,
        to: query.to,
        rowCount: rows.length,
      },
    );
    return {
      buffer,
      contentType:
        query.format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      extension: query.format,
    };
  }

  private async addAudit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown>,
    manager?: EntityManager,
  ) {
    const repository = manager ? manager.getRepository(AuditLog) : this.audits;
    await repository.save(
      repository.create({
        organizationId,
        actorUserId,
        action,
        entityType,
        entityId,
        detailsJson: details,
      }),
    );
  }

  private totals(dto: CreateEntryDto) {
    let debit = 0n;
    let credit = 0n;
    for (const line of dto.lines) {
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
    return { debit: fromMillimes(debit), credit: fromMillimes(credit) };
  }
}
