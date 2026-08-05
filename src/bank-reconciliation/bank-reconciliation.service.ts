import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AccountingJournal,
  BankAccount,
  BankMatchType,
  BankReconciliationRule,
  BankRuleDirection,
  BankRuleMatchType,
  BankStatement,
  BankStatementStatus,
  BankTransaction,
  BankTransactionStatus,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  JournalType,
  LedgerAccount,
  PaymentDirection,
  ThirdPartyPayment,
  ThirdPartyPaymentStatus,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { parseBankFile } from './bank-file.parser';
import {
  CreateBankRuleDto,
  CreateBankAccountDto,
  GenerateBankEntryDto,
  ImportBankStatementDto,
} from './dto';
import { PeriodLockService } from '../period-closing/period-lock.service';

@Injectable()
export class BankReconciliationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BankAccount)
    private readonly bankAccounts: Repository<BankAccount>,
    @InjectRepository(BankStatement)
    private readonly statements: Repository<BankStatement>,
    @InjectRepository(BankTransaction)
    private readonly transactions: Repository<BankTransaction>,
    @InjectRepository(BankReconciliationRule)
    private readonly rules: Repository<BankReconciliationRule>,
    @InjectRepository(AccountingJournal)
    private readonly journals: Repository<AccountingJournal>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(ThirdPartyPayment)
    private readonly payments: Repository<ThirdPartyPayment>,
    @InjectRepository(JournalEntry)
    private readonly entries: Repository<JournalEntry>,
    private readonly dossiers: DossiersService,
    private readonly periodLocks: PeriodLockService,
  ) {}

  async listBankAccounts(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.bankAccounts.find({
      where: { organizationId, dossierId, isActive: true },
      relations: { ledgerAccount: true, journal: true },
      order: { name: 'ASC' },
    });
  }

  async createBankAccount(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateBankAccountDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const [account, journal] = await Promise.all([
      this.accounts.findOneBy({
        id: dto.ledgerAccountId,
        organizationId,
        dossierId,
        isActive: true,
        allowsPosting: true,
      }),
      this.journals.findOneBy({
        id: dto.journalId,
        organizationId,
        dossierId,
        isActive: true,
      }),
    ]);
    if (!account)
      throw new BadRequestException(
        'Le compte comptable de banque est invalide.',
      );
    if (!journal || journal.type !== JournalType.Bank)
      throw new BadRequestException('Sélectionnez un journal de banque.');
    const duplicate = await this.bankAccounts
      .createQueryBuilder('bank')
      .where('bank.dossier_id = :dossierId', { dossierId })
      .andWhere('UPPER(bank.name) = UPPER(:name)', { name: dto.name.trim() })
      .getExists();
    if (duplicate)
      throw new ConflictException('Ce compte bancaire existe déjà.');
    return this.bankAccounts.save(
      this.bankAccounts.create({
        organizationId,
        dossierId,
        name: dto.name.trim(),
        bankName: dto.bankName.trim(),
        iban: dto.iban?.replace(/\s/g, '').toUpperCase() || null,
        ledgerAccountId: account.id,
        journalId: journal.id,
        currency: (dto.currency || 'TND').toUpperCase(),
        isActive: true,
      }),
    );
  }

  async listRules(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.rules.find({
      where: { organizationId, dossierId, isActive: true },
      relations: { suggestedAccount: true, suggestedThirdParty: true },
      order: { label: 'ASC' },
    });
  }

  async createRule(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateBankRuleDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const account = await this.accounts.findOneBy({
      id: dto.suggestedAccountId,
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (!account)
      throw new BadRequestException('Le compte suggéré est invalide.');
    const label = dto.label.trim();
    const pattern = dto.pattern.trim();
    if (!label || !pattern)
      throw new BadRequestException('Le libellé et le motif sont requis.');
    const duplicate = await this.rules
      .createQueryBuilder('rule')
      .where('rule.dossier_id = :dossierId', { dossierId })
      .andWhere('UPPER(rule.label) = UPPER(:label)', { label })
      .andWhere('rule.is_active = true')
      .getExists();
    if (duplicate)
      throw new ConflictException('Une règle porte déjà ce nom dans ce dossier.');
    return this.rules.save(
      this.rules.create({
        organizationId,
        dossierId,
        label,
        pattern,
        matchType: dto.matchType || BankRuleMatchType.Contains,
        direction: dto.direction || BankRuleDirection.Any,
        suggestedAccountId: account.id,
        suggestedThirdPartyId: dto.suggestedThirdPartyId || null,
        isActive: true,
        lastUsedAtUtc: null,
      }),
    );
  }

  async listStatements(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.statements.find({
      where: { organizationId, dossierId },
      relations: { bankAccount: true },
      order: { periodEnd: 'DESC', createdAtUtc: 'DESC' },
      take: 200,
    });
  }

  async getStatement(
    organizationId: string,
    dossierId: string,
    statementId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const statement = await this.findStatement(
      organizationId,
      dossierId,
      statementId,
    );
    const bookBalance = await this.bookBalance(
      organizationId,
      dossierId,
      statement.bankAccount.ledgerAccountId,
      statement.periodEnd,
    );
    const matchedCount = statement.transactions.filter(
      (item) => item.status === BankTransactionStatus.Matched,
    ).length;
    return {
      ...statement,
      transactions: await this.withRuleSuggestions(
        organizationId,
        dossierId,
        statement.transactions,
      ),
      matchedCount,
      unmatchedCount: statement.transactions.length - matchedCount,
      currentBookClosingBalance: fromMillimes(bookBalance),
      currentDifference: fromMillimes(
        toMillimes(statement.closingBalance) - bookBalance,
      ),
    };
  }

  async importStatement(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: ImportBankStatementDto,
    file?: Express.Multer.File,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    if (!file)
      throw new BadRequestException('Le fichier du relevé est requis.');
    if (dto.periodStart > dto.periodEnd)
      throw new BadRequestException('La période du relevé est invalide.');
    const bankAccount = await this.bankAccounts.findOneBy({
      id: dto.bankAccountId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!bankAccount)
      throw new NotFoundException('Le compte bancaire est introuvable.');
    if (
      await this.statements.existsBy({
        bankAccountId: bankAccount.id,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
      })
    )
      throw new ConflictException(
        'Un relevé existe déjà pour ce compte et cette période.',
      );

    const rows = await parseBankFile(file);
    const outsidePeriod = rows.find(
      (row) =>
        row.transactionDate < dto.periodStart ||
        row.transactionDate > dto.periodEnd,
    );
    if (outsidePeriod)
      throw new BadRequestException(
        `L’opération du ${outsidePeriod.transactionDate} est hors de la période du relevé.`,
      );
    const expectedClosing = rows.reduce(
      (total, row) => total + toMillimes(row.amount),
      toMillimes(dto.openingBalance, 'Solde initial'),
    );
    if (expectedClosing !== toMillimes(dto.closingBalance, 'Solde final'))
      throw new BadRequestException(
        `Le solde final est incohérent : ${fromMillimes(expectedClosing)} TND attendu selon les opérations.`,
      );
    const fingerprints = rows.map((row) => row.fingerprint);
    if (
      await this.transactions.existsBy({
        bankAccountId: bankAccount.id,
        fingerprint: In(fingerprints),
      })
    )
      throw new ConflictException(
        'Le fichier contient au moins une opération déjà importée.',
      );

    const statement = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(BankStatement, {
          organizationId,
          dossierId,
          bankAccountId: bankAccount.id,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          openingBalance: fromMillimes(toMillimes(dto.openingBalance)),
          closingBalance: fromMillimes(toMillimes(dto.closingBalance)),
          bookClosingBalance: null,
          difference: null,
          sourceFileName: file.originalname.slice(0, 300),
          rowCount: rows.length,
          status: BankStatementStatus.Imported,
          importedByUserId: userId,
          reconciledByUserId: null,
          reconciledAtUtc: null,
        }),
      );
      await manager.save(
        rows.map((row) =>
          manager.create(BankTransaction, {
            organizationId,
            dossierId,
            bankAccountId: bankAccount.id,
            statementId: created.id,
            ...row,
            status: BankTransactionStatus.Unmatched,
            matchType: null,
            matchConfidence: null,
            matchedPaymentId: null,
            journalEntryId: null,
            matchedByUserId: null,
            matchedAtUtc: null,
          }),
        ),
      );
      return created;
    });
    return this.getStatement(organizationId, dossierId, statement.id, userId);
  }

  async autoMatch(
    organizationId: string,
    dossierId: string,
    statementId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const statement = await this.findStatement(
      organizationId,
      dossierId,
      statementId,
    );
    this.ensureOpen(statement);
    const from = shiftDate(statement.periodStart, -3);
    const to = shiftDate(statement.periodEnd, 3);
    const payments = await this.payments.find({
      where: {
        organizationId,
        dossierId,
        status: ThirdPartyPaymentStatus.Posted,
        paymentDate: Between(from, to),
      },
      relations: { thirdParty: true },
    });
    const usedPayments = new Set(
      (
        await this.transactions.find({
          where: {
            organizationId,
            dossierId,
            matchedPaymentId: Not(IsNull()),
          },
          select: { matchedPaymentId: true },
        })
      )
        .map((item) => item.matchedPaymentId)
        .filter((id): id is string => !!id),
    );
    let matched = 0;
    for (const transaction of statement.transactions.filter(
      (item) => item.status === BankTransactionStatus.Unmatched,
    )) {
      const amount = toMillimes(transaction.amount);
      const expectedDirection =
        amount > 0n ? PaymentDirection.Receipt : PaymentDirection.Disbursement;
      const candidates = payments
        .filter(
          (payment) =>
            !usedPayments.has(payment.id) &&
            payment.direction === expectedDirection &&
            toMillimes(payment.amount) === (amount < 0n ? -amount : amount),
        )
        .map((payment) => ({
          payment,
          score: this.paymentMatchScore(transaction, payment),
        }))
        .sort((a, b) => b.score - a.score);
      if (
        !candidates.length ||
        candidates[0].score < 80 ||
        (candidates[1] && candidates[1].score === candidates[0].score)
      )
        continue;
      const candidate = candidates[0];
      transaction.status = BankTransactionStatus.Matched;
      transaction.matchType = BankMatchType.Automatic;
      transaction.matchConfidence = candidate.score;
      transaction.matchedPaymentId = candidate.payment.id;
      transaction.journalEntryId = candidate.payment.journalEntryId;
      transaction.matchedByUserId = userId;
      transaction.matchedAtUtc = new Date();
      await this.transactions.save(transaction);
      usedPayments.add(candidate.payment.id);
      matched += 1;
    }
    await this.refreshStatementStatus(statement.id);
    return {
      matched,
      statement: await this.getStatement(
        organizationId,
        dossierId,
        statementId,
        userId,
      ),
    };
  }

  async matchPayment(
    organizationId: string,
    dossierId: string,
    transactionId: string,
    paymentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const transaction = await this.findTransaction(
      organizationId,
      dossierId,
      transactionId,
    );
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      transaction.transactionDate,
    );
    this.ensureOpen(transaction.statement);
    const payment = await this.payments.findOneBy({
      id: paymentId,
      organizationId,
      dossierId,
      status: ThirdPartyPaymentStatus.Posted,
    });
    if (!payment)
      throw new NotFoundException('Le règlement comptabilisé est introuvable.');
    const amount = toMillimes(transaction.amount);
    const direction =
      amount > 0n ? PaymentDirection.Receipt : PaymentDirection.Disbursement;
    if (
      payment.direction !== direction ||
      toMillimes(payment.amount) !== (amount < 0n ? -amount : amount)
    )
      throw new BadRequestException(
        'Le sens ou le montant du règlement ne correspond pas à l’opération bancaire.',
      );
    if (
      await this.transactions.existsBy({
        matchedPaymentId: payment.id,
        id: Not(transaction.id),
      })
    )
      throw new ConflictException(
        'Ce règlement est déjà rapproché avec une autre opération.',
      );
    transaction.status = BankTransactionStatus.Matched;
    transaction.matchType = BankMatchType.Payment;
    transaction.matchConfidence = 100;
    transaction.matchedPaymentId = payment.id;
    transaction.journalEntryId = payment.journalEntryId;
    transaction.matchedByUserId = userId;
    transaction.matchedAtUtc = new Date();
    await this.transactions.save(transaction);
    await this.refreshStatementStatus(transaction.statementId);
    return this.findTransaction(organizationId, dossierId, transaction.id);
  }

  async matchEntry(
    organizationId: string,
    dossierId: string,
    transactionId: string,
    journalEntryId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const transaction = await this.findTransaction(
      organizationId,
      dossierId,
      transactionId,
    );
    this.ensureOpen(transaction.statement);
    const entry = await this.entries.findOne({
      where: {
        id: journalEntryId,
        organizationId,
        dossierId,
        status: JournalEntryStatus.Posted,
      },
      relations: { lines: true },
    });
    if (!entry)
      throw new NotFoundException('L’écriture comptabilisée est introuvable.');
    const bankAmount = entry.lines
      .filter(
        (line) =>
          line.accountId === transaction.statement.bankAccount.ledgerAccountId,
      )
      .reduce(
        (total, line) =>
          total + toMillimes(line.debit) - toMillimes(line.credit),
        0n,
      );
    if (bankAmount !== toMillimes(transaction.amount))
      throw new BadRequestException(
        'Le mouvement du compte bancaire dans cette écriture ne correspond pas à l’opération.',
      );
    if (
      await this.transactions.existsBy({
        journalEntryId: entry.id,
        status: BankTransactionStatus.Matched,
        id: Not(transaction.id),
      })
    )
      throw new ConflictException(
        'Cette écriture est déjà rapprochée avec une autre opération.',
      );
    transaction.status = BankTransactionStatus.Matched;
    transaction.matchType =
      transaction.journalEntryId === entry.id
        ? BankMatchType.GeneratedEntry
        : BankMatchType.JournalEntry;
    transaction.matchConfidence = 100;
    transaction.matchedPaymentId = null;
    transaction.journalEntryId = entry.id;
    transaction.matchedByUserId = userId;
    transaction.matchedAtUtc = new Date();
    await this.transactions.save(transaction);
    await this.refreshStatementStatus(transaction.statementId);
    return this.findTransaction(organizationId, dossierId, transaction.id);
  }

  async generateEntry(
    organizationId: string,
    dossierId: string,
    transactionId: string,
    userId: string,
    dto: GenerateBankEntryDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const transaction = await this.findTransaction(
      organizationId,
      dossierId,
      transactionId,
    );
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      transaction.transactionDate,
    );
    this.ensureOpen(transaction.statement);
    if (transaction.status !== BankTransactionStatus.Unmatched)
      throw new ConflictException(
        'Seule une opération non rapprochée peut générer une écriture.',
      );
    const counterpart = await this.accounts.findOneBy({
      id: dto.counterpartAccountId,
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (!counterpart)
      throw new BadRequestException('Le compte de contrepartie est invalide.');
    if (counterpart.id === transaction.statement.bankAccount.ledgerAccountId)
      throw new BadRequestException(
        'Le compte de contrepartie doit être différent du compte bancaire.',
      );
    const amount = toMillimes(transaction.amount);
    const absolute = amount < 0n ? -amount : amount;
    const entry = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: transaction.statement.bankAccount.journalId,
          entryDate: transaction.transactionDate,
          pieceReference: (
            dto.pieceReference ||
            transaction.reference ||
            `BANQ-${transaction.id.slice(0, 8)}`
          ).slice(0, 100),
          description: (dto.description || transaction.description).slice(
            0,
            300,
          ),
          status: JournalEntryStatus.Draft,
          totalDebit: fromMillimes(absolute),
          totalCredit: fromMillimes(absolute),
          sourceDocumentId: null,
          createdByUserId: userId,
          postedByUserId: null,
          postedAtUtc: null,
          reversalEntryId: null,
        }),
      );
      const receipt = amount > 0n;
      await manager.save([
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: created.id,
          accountId: transaction.statement.bankAccount.ledgerAccountId,
          label: transaction.description.slice(0, 300),
          debit: receipt ? fromMillimes(absolute) : '0.000',
          credit: receipt ? '0.000' : fromMillimes(absolute),
          thirdPartyName: null,
        }),
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: created.id,
          accountId: counterpart.id,
          label: (dto.description || transaction.description).slice(0, 300),
          debit: receipt ? '0.000' : fromMillimes(absolute),
          credit: receipt ? fromMillimes(absolute) : '0.000',
          thirdPartyName: null,
        }),
      ]);
      transaction.status = BankTransactionStatus.DraftEntry;
      transaction.matchType = BankMatchType.GeneratedEntry;
      transaction.matchConfidence = null;
      transaction.journalEntryId = created.id;
      transaction.matchedPaymentId = null;
      transaction.matchedByUserId = userId;
      transaction.matchedAtUtc = null;
      await manager.save(transaction);
      if (dto.rememberRule) {
        await this.createOrTouchRule(
          manager,
          organizationId,
          dossierId,
          dto,
          transaction,
          counterpart.id,
        );
      }
      return created;
    });
    await this.refreshStatementStatus(transaction.statementId);
    return entry;
  }

  async reconcile(
    organizationId: string,
    dossierId: string,
    statementId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.transaction(async (manager) => {
      const statement = await manager.findOne(BankStatement, {
        where: { id: statementId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!statement)
        throw new NotFoundException('Le relevé bancaire est introuvable.');
      if (statement.status === BankStatementStatus.Reconciled)
        throw new ConflictException('Ce relevé est déjà rapproché.');
      const unmatched = await manager.count(BankTransaction, {
        where: {
          statementId: statement.id,
          status: Not(BankTransactionStatus.Matched),
        },
      });
      if (unmatched)
        throw new ConflictException(
          `${unmatched} opération(s) restent à rapprocher ou à comptabiliser.`,
        );
      const bankAccount = await manager.findOneByOrFail(BankAccount, {
        id: statement.bankAccountId,
        organizationId,
        dossierId,
      });
      const bookBalance = await this.bookBalance(
        organizationId,
        dossierId,
        bankAccount.ledgerAccountId,
        statement.periodEnd,
        manager,
      );
      const difference = toMillimes(statement.closingBalance) - bookBalance;
      if (difference !== 0n)
        throw new ConflictException(
          `Le solde bancaire ${statement.closingBalance} TND diffère du solde comptable ${fromMillimes(bookBalance)} TND de ${fromMillimes(difference)} TND.`,
        );
      statement.bookClosingBalance = fromMillimes(bookBalance);
      statement.difference = '0.000';
      statement.status = BankStatementStatus.Reconciled;
      statement.reconciledByUserId = userId;
      statement.reconciledAtUtc = new Date();
      return manager.save(statement);
    });
  }

  private async findStatement(
    organizationId: string,
    dossierId: string,
    statementId: string,
  ) {
    const statement = await this.statements.findOne({
      where: { id: statementId, organizationId, dossierId },
      relations: {
        bankAccount: { ledgerAccount: true, journal: true },
        transactions: {
          matchedPayment: { thirdParty: true },
          journalEntry: true,
        },
      },
      order: { transactions: { transactionDate: 'ASC', createdAtUtc: 'ASC' } },
    });
    if (!statement)
      throw new NotFoundException('Le relevé bancaire est introuvable.');
    return statement;
  }

  private async findTransaction(
    organizationId: string,
    dossierId: string,
    transactionId: string,
  ) {
    const transaction = await this.transactions.findOne({
      where: { id: transactionId, organizationId, dossierId },
      relations: {
        statement: { bankAccount: { ledgerAccount: true, journal: true } },
        matchedPayment: { thirdParty: true },
        journalEntry: true,
      },
    });
    if (!transaction)
      throw new NotFoundException('L’opération bancaire est introuvable.');
    return transaction;
  }

  private ensureOpen(statement: BankStatement) {
    if (statement.status === BankStatementStatus.Reconciled)
      throw new ConflictException(
        'Un rapprochement validé ne peut plus être modifié.',
      );
  }

  private paymentMatchScore(
    transaction: BankTransaction,
    payment: ThirdPartyPayment,
  ) {
    const days = Math.abs(
      (Date.parse(transaction.transactionDate) -
        Date.parse(payment.paymentDate)) /
        86400000,
    );
    let score = days === 0 ? 90 : days <= 1 ? 85 : 80;
    const transactionText = normalizeText(
      `${transaction.reference || ''} ${transaction.description}`,
    );
    const paymentReference = normalizeText(payment.reference || '');
    if (paymentReference && transactionText.includes(paymentReference))
      score = 100;
    else if (
      payment.thirdParty?.name &&
      transactionText.includes(normalizeText(payment.thirdParty.name))
    )
      score = Math.max(score, 95);
    return score;
  }

  private async refreshStatementStatus(statementId: string) {
    const [total, matched] = await Promise.all([
      this.transactions.countBy({ statementId }),
      this.transactions.countBy({
        statementId,
        status: BankTransactionStatus.Matched,
      }),
    ]);
    const status =
      matched === total
        ? BankStatementStatus.Ready
        : matched > 0
          ? BankStatementStatus.PartiallyMatched
          : BankStatementStatus.Imported;
    await this.statements.update(
      { id: statementId, status: Not(BankStatementStatus.Reconciled) },
      { status },
    );
  }

  private async bookBalance(
    organizationId: string,
    dossierId: string,
    ledgerAccountId: string,
    throughDate: string,
    manager = this.dataSource.manager,
  ) {
    const rows = await manager.query<Array<{ balance: string }>>(
      `SELECT COALESCE(SUM(l.debit - l.credit),0)::numeric(15,3) AS balance
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id=l.entry_id
       WHERE l.organization_id=$1 AND e.dossier_id=$2 AND l.account_id=$3
         AND e.status='COMPTABILISEE' AND e.entry_date <= $4`,
      [organizationId, dossierId, ledgerAccountId, throughDate],
    );
    return toMillimes(rows[0]?.balance ?? '0.000');
  }

  private async withRuleSuggestions(
    organizationId: string,
    dossierId: string,
    transactions: BankTransaction[],
  ) {
    const rules = await this.rules.find({
      where: { organizationId, dossierId, isActive: true },
      relations: { suggestedAccount: true, suggestedThirdParty: true },
      order: { updatedAtUtc: 'DESC' },
    });
    return transactions.map((transaction) => {
      if (transaction.status !== BankTransactionStatus.Unmatched)
        return { ...transaction, ruleSuggestion: null };
      const suggestion = rules
        .map((rule) => ({
          rule,
          confidence: this.ruleScore(transaction, rule),
        }))
        .filter((candidate) => candidate.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (!suggestion) return { ...transaction, ruleSuggestion: null };
      return {
        ...transaction,
        ruleSuggestion: {
          ruleId: suggestion.rule.id,
          label: suggestion.rule.label,
          confidence: suggestion.confidence,
          accountId: suggestion.rule.suggestedAccountId,
          accountCode: suggestion.rule.suggestedAccount.code,
          accountName: suggestion.rule.suggestedAccount.name,
          thirdPartyId: suggestion.rule.suggestedThirdPartyId,
          thirdPartyName: suggestion.rule.suggestedThirdParty?.name ?? null,
        },
      };
    });
  }

  private ruleScore(transaction: BankTransaction, rule: BankReconciliationRule) {
    const amount = toMillimes(transaction.amount);
    if (rule.direction === BankRuleDirection.Debit && amount >= 0n) return 0;
    if (rule.direction === BankRuleDirection.Credit && amount <= 0n) return 0;
    const text = normalizeText(`${transaction.reference || ''} ${transaction.description}`);
    const pattern = normalizeText(rule.pattern);
    if (!pattern) return 0;
    if (rule.matchType === BankRuleMatchType.Exact)
      return text === pattern ? 98 : 0;
    if (rule.matchType === BankRuleMatchType.StartsWith)
      return text.startsWith(pattern) ? 92 : 0;
    return text.includes(pattern) ? Math.min(96, 70 + Math.min(pattern.length, 26)) : 0;
  }

  private async createOrTouchRule(
    manager: EntityManager,
    organizationId: string,
    dossierId: string,
    dto: GenerateBankEntryDto,
    transaction: BankTransaction,
    accountId: string,
  ) {
    const pattern = (dto.rulePattern || transaction.description)
      .trim()
      .slice(0, 500);
    const label = (dto.ruleLabel || pattern).trim().slice(0, 150);
    if (!label || !pattern) return;
    const existing = await manager.findOne(BankReconciliationRule, {
      where: { organizationId, dossierId, label, isActive: true },
    });
    if (existing) {
      existing.pattern = pattern;
      existing.suggestedAccountId = accountId;
      existing.direction =
        toMillimes(transaction.amount) < 0n
          ? BankRuleDirection.Debit
          : BankRuleDirection.Credit;
      existing.lastUsedAtUtc = new Date();
      await manager.save(existing);
      return;
    }
    await manager.save(
      manager.create(BankReconciliationRule, {
        organizationId,
        dossierId,
        label,
        pattern,
        matchType: BankRuleMatchType.Contains,
        direction:
          toMillimes(transaction.amount) < 0n
            ? BankRuleDirection.Debit
            : BankRuleDirection.Credit,
        suggestedAccountId: accountId,
        suggestedThirdPartyId: null,
        isActive: true,
        lastUsedAtUtc: new Date(),
      }),
    );
  }
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
