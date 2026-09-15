import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AccountingJournal,
  AuditLog,
  BankStatement,
  BankStatementStatus,
  BankTransaction,
  BankTransactionStatus,
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceStatus,
  BusinessInvoiceType,
  InvoiceSettlementStatus,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  JournalType,
  LedgerAccount,
  PaymentAllocation,
  PaymentDirection,
  PaymentInstrumentStatus,
  ThirdParty,
  ThirdPartyPayment,
  ThirdPartyPaymentCorrectionType,
  ThirdPartyPaymentStatus,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  CorrectThirdPartyPaymentDto,
  CreateThirdPartyDto,
  CreateThirdPartyPaymentDto,
} from './dto';
import { PeriodLockService } from '../period-closing/period-lock.service';

@Injectable()
export class SettlementsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ThirdParty)
    private readonly thirdParties: Repository<ThirdParty>,
    @InjectRepository(ThirdPartyPayment)
    private readonly payments: Repository<ThirdPartyPayment>,
    @InjectRepository(BusinessInvoice)
    private readonly invoices: Repository<BusinessInvoice>,
    @InjectRepository(AccountingJournal)
    private readonly journals: Repository<AccountingJournal>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    private readonly dossiers: DossiersService,
    private readonly periodLocks: PeriodLockService,
  ) {}

  async listThirdParties(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const parties = await this.thirdParties.find({
      where: { organizationId, dossierId, isActive: true },
      order: { name: 'ASC' },
    });
    const balances = await this.dataSource.query<
      Array<{
        thirdPartyId: string;
        receivable: string;
        payable: string;
      }>
    >(
      `SELECT third_party_id AS "thirdPartyId",
        COALESCE(SUM(CASE WHEN type='VENTE' THEN outstanding_amount ELSE 0 END),0)::numeric(15,3) AS receivable,
        COALESCE(SUM(CASE WHEN type='ACHAT' THEN outstanding_amount ELSE 0 END),0)::numeric(15,3) AS payable
       FROM accounting.business_invoices
       WHERE organization_id=$1 AND dossier_id=$2 AND third_party_id IS NOT NULL
         AND kind='FACTURE' AND status='COMPTABILISEE'
       GROUP BY third_party_id`,
      [organizationId, dossierId],
    );
    const byParty = new Map(balances.map((item) => [item.thirdPartyId, item]));
    return parties.map((party) => ({
      ...party,
      receivableBalance: byParty.get(party.id)?.receivable ?? '0.000',
      payableBalance: byParty.get(party.id)?.payable ?? '0.000',
    }));
  }

  async createThirdParty(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateThirdPartyDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const duplicate = await this.thirdParties
      .createQueryBuilder('party')
      .where('party.dossier_id = :dossierId', { dossierId })
      .andWhere('party.type = :type', { type: dto.type })
      .andWhere('UPPER(party.name) = UPPER(:name)', { name: dto.name.trim() })
      .getExists();
    if (duplicate)
      throw new ConflictException('Ce client ou fournisseur existe déjà.');
    await this.validateAccountIds(organizationId, dossierId, [
      dto.receivableAccountId,
      dto.payableAccountId,
    ]);
    return this.thirdParties.save(
      this.thirdParties.create({
        organizationId,
        dossierId,
        type: dto.type,
        name: dto.name.trim(),
        taxIdentifier: dto.taxIdentifier?.trim() || null,
        rneNumber: dto.rneNumber?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        receivableAccountId: dto.receivableAccountId ?? null,
        payableAccountId: dto.payableAccountId ?? null,
        isActive: true,
      }),
    );
  }

  async updateThirdParty(
    organizationId: string,
    dossierId: string,
    thirdPartyId: string,
    userId: string,
    dto: CreateThirdPartyDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const party = await this.thirdParties.findOneBy({
      id: thirdPartyId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!party)
      throw new NotFoundException('Le client ou fournisseur est introuvable.');
    const duplicate = await this.thirdParties
      .createQueryBuilder('candidate')
      .where('candidate.dossier_id = :dossierId', { dossierId })
      .andWhere('candidate.type = :type', { type: dto.type })
      .andWhere('UPPER(candidate.name) = UPPER(:name)', {
        name: dto.name.trim(),
      })
      .andWhere('candidate.id != :thirdPartyId', { thirdPartyId })
      .getExists();
    if (duplicate)
      throw new ConflictException('Ce client ou fournisseur existe déjà.');
    await this.validateAccountIds(organizationId, dossierId, [
      dto.receivableAccountId,
      dto.payableAccountId,
    ]);
    Object.assign(party, {
      type: dto.type,
      name: dto.name.trim(),
      taxIdentifier: dto.taxIdentifier?.trim() || null,
      rneNumber: dto.rneNumber?.trim() || null,
      email: dto.email?.trim().toLowerCase() || null,
      phone: dto.phone?.trim() || null,
      address: dto.address?.trim() || null,
      receivableAccountId: dto.receivableAccountId ?? null,
      payableAccountId: dto.payableAccountId ?? null,
    });
    return this.thirdParties.save(party);
  }

  async listPayments(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.payments.find({
      where: { organizationId, dossierId },
      relations: { thirdParty: true, allocations: { invoice: true } },
      order: { paymentDate: 'DESC', createdAtUtc: 'DESC' },
      take: 500,
    });
  }

  async createPayment(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateThirdPartyPaymentDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.periodLocks.assertDateOpen(
      organizationId,
      dossierId,
      dto.paymentDate,
    );
    const thirdParty = await this.thirdParties.findOneBy({
      id: dto.thirdPartyId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (!thirdParty)
      throw new NotFoundException('Le client ou fournisseur est introuvable.');
    const journal = await this.journals.findOneBy({
      id: dto.journalId,
      organizationId,
      dossierId,
      isActive: true,
    });
    if (
      !journal ||
      ![JournalType.Bank, JournalType.Cash].includes(journal.type)
    )
      throw new BadRequestException(
        'Le règlement doit utiliser un journal de banque ou de caisse.',
      );
    await this.validateAccountIds(organizationId, dossierId, [
      dto.cashAccountId,
      dto.thirdPartyAccountId,
    ]);

    const allocationIds = dto.allocations.map((item) => item.invoiceId);
    if (new Set(allocationIds).size !== allocationIds.length)
      throw new BadRequestException(
        'Une facture ne peut être affectée qu’une fois par règlement.',
      );
    const invoices = await this.invoices.findBy({
      id: In(allocationIds),
      organizationId,
      dossierId,
      kind: BusinessInvoiceKind.Invoice,
      status: BusinessInvoiceStatus.Posted,
    });
    if (invoices.length !== allocationIds.length)
      throw new BadRequestException(
        'Une facture affectée est inexistante ou non comptabilisée.',
      );
    const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    let allocated = 0n;
    for (const allocation of dto.allocations) {
      const invoice = byId.get(allocation.invoiceId)!;
      const expectedType =
        dto.direction === PaymentDirection.Receipt
          ? BusinessInvoiceType.Sale
          : BusinessInvoiceType.Purchase;
      if (invoice.type !== expectedType)
        throw new BadRequestException(
          'Le sens du règlement ne correspond pas au type de facture.',
        );
      if (invoice.thirdPartyId && invoice.thirdPartyId !== thirdParty.id)
        throw new BadRequestException(
          'Toutes les factures doivent appartenir au tiers sélectionné.',
        );
      const amount = toMillimes(allocation.amount, 'Montant affecté');
      if (amount <= 0n || amount > toMillimes(invoice.outstandingAmount))
        throw new BadRequestException(
          `L’affectation dépasse le solde de la facture ${invoice.number}.`,
        );
      allocated += amount;
    }
    const paymentAmount = toMillimes(dto.amount, 'Montant du règlement');
    if (paymentAmount <= 0n || allocated !== paymentAmount)
      throw new BadRequestException(
        'La somme des affectations doit être égale au montant du règlement.',
      );

    return this.dataSource.transaction(async (manager) => {
      const entry = await manager.save(
        manager.create(JournalEntry, {
          organizationId,
          dossierId,
          journalId: dto.journalId,
          entryDate: dto.paymentDate,
          pieceReference: (dto.reference || `REG-${Date.now()}`).slice(0, 100),
          description:
            `${dto.direction === PaymentDirection.Receipt ? 'Encaissement' : 'Décaissement'} - ${thirdParty.name}`.slice(
              0,
              300,
            ),
          status: JournalEntryStatus.Draft,
          totalDebit: fromMillimes(paymentAmount),
          totalCredit: fromMillimes(paymentAmount),
          sourceDocumentId: null,
          createdByUserId: userId,
          postedByUserId: null,
          postedAtUtc: null,
          reversalEntryId: null,
        }),
      );
      const receipt = dto.direction === PaymentDirection.Receipt;
      await manager.save([
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: entry.id,
          accountId: dto.cashAccountId,
          label: dto.method.trim(),
          debit: receipt ? fromMillimes(paymentAmount) : '0.000',
          credit: receipt ? '0.000' : fromMillimes(paymentAmount),
          thirdPartyName: thirdParty.name,
        }),
        manager.create(JournalEntryLine, {
          organizationId,
          entryId: entry.id,
          accountId: dto.thirdPartyAccountId,
          label: `Règlement ${thirdParty.name}`,
          debit: receipt ? '0.000' : fromMillimes(paymentAmount),
          credit: receipt ? fromMillimes(paymentAmount) : '0.000',
          thirdPartyName: thirdParty.name,
        }),
      ]);
      const isInstrument = this.isInstrumentMethod(dto.method);
      const payment = await manager.save(
        manager.create(ThirdPartyPayment, {
          organizationId,
          dossierId,
          thirdPartyId: thirdParty.id,
          direction: dto.direction,
          paymentDate: dto.paymentDate,
          amount: fromMillimes(paymentAmount),
          method: dto.method.trim(),
          reference: dto.reference?.trim() || null,
          journalId: dto.journalId,
          cashAccountId: dto.cashAccountId,
          thirdPartyAccountId: dto.thirdPartyAccountId,
          journalEntryId: entry.id,
          status: ThirdPartyPaymentStatus.Draft,
          createdByUserId: userId,
          postedByUserId: null,
          postedAtUtc: null,
          instrumentNumber: isInstrument
            ? dto.instrumentNumber?.trim() || null
            : null,
          instrumentBank: isInstrument
            ? dto.instrumentBank?.trim() || null
            : null,
          instrumentDueDate: isInstrument
            ? (dto.instrumentDueDate ?? null)
            : null,
          instrumentStatus: isInstrument
            ? PaymentInstrumentStatus.Received
            : null,
          instrumentDepositedAtUtc: null,
          instrumentClearedAtUtc: null,
        }),
      );
      await manager.save(
        dto.allocations.map((allocation) =>
          manager.create(PaymentAllocation, {
            organizationId,
            paymentId: payment.id,
            invoiceId: allocation.invoiceId,
            amount: fromMillimes(toMillimes(allocation.amount)),
          }),
        ),
      );
      return manager.findOneOrFail(ThirdPartyPayment, {
        where: { id: payment.id },
        relations: { thirdParty: true, allocations: { invoice: true } },
      });
    });
  }

  async postPayment(
    organizationId: string,
    dossierId: string,
    paymentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(ThirdPartyPayment, {
        where: { id: paymentId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment)
        throw new NotFoundException('Le règlement est introuvable.');
      if (payment.status !== ThirdPartyPaymentStatus.Draft)
        throw new ConflictException('Le règlement est déjà comptabilisé.');
      const allocations = await manager.find(PaymentAllocation, {
        where: { paymentId: payment.id, organizationId },
      });
      for (const allocation of allocations) {
        const invoice = await manager.findOne(BusinessInvoice, {
          where: {
            id: allocation.invoiceId,
            organizationId,
            dossierId,
            status: BusinessInvoiceStatus.Posted,
          },
          lock: { mode: 'pessimistic_write' },
        });
        const amount = toMillimes(allocation.amount);
        if (!invoice || amount > toMillimes(invoice.outstandingAmount))
          throw new ConflictException(
            'Le solde d’une facture a changé. Vérifiez les affectations.',
          );
        invoice.paidAmount = fromMillimes(
          toMillimes(invoice.paidAmount) + amount,
        );
        const outstanding = toMillimes(invoice.outstandingAmount) - amount;
        invoice.outstandingAmount = fromMillimes(outstanding);
        invoice.settlementStatus =
          outstanding === 0n
            ? InvoiceSettlementStatus.Paid
            : InvoiceSettlementStatus.PartiallyPaid;
        await manager.save(invoice);
      }
      const entry = await manager.findOneByOrFail(JournalEntry, {
        id: payment.journalEntryId,
        organizationId,
        dossierId,
        status: JournalEntryStatus.Draft,
      });
      await this.periodLocks.assertDateOpen(
        organizationId,
        dossierId,
        entry.entryDate,
        manager,
      );
      entry.status = JournalEntryStatus.Posted;
      entry.postedByUserId = userId;
      entry.postedAtUtc = new Date();
      await manager.save(entry);
      payment.status = ThirdPartyPaymentStatus.Posted;
      payment.postedByUserId = userId;
      payment.postedAtUtc = new Date();
      await manager.save(payment);
      return manager.findOneOrFail(ThirdPartyPayment, {
        where: { id: payment.id },
        relations: { thirdParty: true, allocations: { invoice: true } },
      });
    });
  }

  async correctPayment(
    organizationId: string,
    dossierId: string,
    paymentId: string,
    userId: string,
    dto: CorrectThirdPartyPaymentDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const reason = dto.reason.trim();
    if (reason.length < 3)
      throw new BadRequestException(
        'Le motif de correction doit contenir au moins 3 caractères.',
      );

    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(ThirdPartyPayment, {
        where: { id: paymentId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment)
        throw new NotFoundException('Le règlement est introuvable.');
      if (payment.status === ThirdPartyPaymentStatus.Cancelled)
        throw new ConflictException('Ce règlement a déjà été corrigé.');
      if (dto.correctionDate < payment.paymentDate)
        throw new BadRequestException(
          'La date de correction ne peut pas précéder le règlement.',
        );
      if (
        payment.status === ThirdPartyPaymentStatus.Draft &&
        dto.correctionType === ThirdPartyPaymentCorrectionType.Refund
      )
        throw new ConflictException(
          'Un brouillon non comptabilisé ne peut pas être remboursé. Annulez sa saisie.',
        );

      let reversalEntryId: string | null = null;
      const restoredInvoiceIds: string[] = [];
      if (payment.status === ThirdPartyPaymentStatus.Posted) {
        reversalEntryId = await this.reversePostedPayment(
          manager,
          payment,
          userId,
          dto.correctionDate,
          reason,
        );
        restoredInvoiceIds.push(
          ...(await this.restorePaymentAllocations(
            manager,
            payment,
            organizationId,
            dossierId,
          )),
        );
      } else {
        const entry = await manager.findOne(JournalEntry, {
          where: {
            id: payment.journalEntryId,
            organizationId,
            dossierId,
            status: JournalEntryStatus.Draft,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (entry) {
          entry.status = JournalEntryStatus.Rejected;
          entry.reviewedByUserId = userId;
          entry.reviewedAtUtc = new Date();
          entry.reviewComment = `Règlement annulé : ${reason}`;
          await manager.save(entry);
        }
      }

      const releasedTransactions = await this.releaseBankMatches(
        manager,
        payment,
        organizationId,
        dossierId,
      );
      payment.status = ThirdPartyPaymentStatus.Cancelled;
      payment.correctionType = dto.correctionType;
      payment.correctionDate = dto.correctionDate;
      payment.correctionReason = reason;
      payment.correctedByUserId = userId;
      payment.correctedAtUtc = new Date();
      payment.reversalJournalEntryId = reversalEntryId;
      await manager.save(payment);

      const audits = manager.getRepository(AuditLog);
      await audits.save(
        audits.create({
          organizationId,
          actorUserId: userId,
          action: 'third_party_payment.corrected',
          entityType: 'ThirdPartyPayment',
          entityId: payment.id,
          detailsJson: {
            dossierId,
            correctionType: dto.correctionType,
            correctionDate: dto.correctionDate,
            reason,
            reversalEntryId,
            restoredInvoiceIds,
            releasedBankTransactionIds: releasedTransactions,
          },
        }),
      );
      return manager.findOneOrFail(ThirdPartyPayment, {
        where: { id: payment.id },
        relations: { thirdParty: true, allocations: { invoice: true } },
      });
    });
  }

  private async reversePostedPayment(
    manager: EntityManager,
    payment: ThirdPartyPayment,
    userId: string,
    correctionDate: string,
    reason: string,
  ) {
    await this.periodLocks.assertDateOpen(
      payment.organizationId,
      payment.dossierId,
      correctionDate,
      manager,
    );
    const entry = await manager.findOne(JournalEntry, {
      where: {
        id: payment.journalEntryId,
        organizationId: payment.organizationId,
        dossierId: payment.dossierId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entry || entry.status !== JournalEntryStatus.Posted)
      throw new ConflictException(
        'L’écriture du règlement ne peut plus être extournée automatiquement.',
      );
    const originalLines = await manager.find(JournalEntryLine, {
      where: { entryId: entry.id, organizationId: payment.organizationId },
    });
    if (!originalLines.length)
      throw new ConflictException(
        'L’écriture du règlement ne contient aucune ligne à extourner.',
      );
    const reversal = await manager.save(
      manager.create(JournalEntry, {
        organizationId: payment.organizationId,
        dossierId: payment.dossierId,
        journalId: entry.journalId,
        entryDate: correctionDate,
        pieceReference: `EXT-${entry.pieceReference}`.slice(0, 100),
        description: `Correction règlement : ${reason}`.slice(0, 300),
        status: JournalEntryStatus.Posted,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
        sourceDocumentId: null,
        createdByUserId: userId,
        postedByUserId: userId,
        postedAtUtc: new Date(),
        submittedByUserId: null,
        submittedAtUtc: null,
        reviewedByUserId: null,
        reviewedAtUtc: null,
        reviewComment: null,
        reversalEntryId: entry.id,
      }),
    );
    await manager.save(
      originalLines.map((line) =>
        manager.create(JournalEntryLine, {
          organizationId: payment.organizationId,
          entryId: reversal.id,
          accountId: line.accountId,
          label: `Extourne : ${line.label}`.slice(0, 300),
          debit: line.credit,
          credit: line.debit,
          thirdPartyName: line.thirdPartyName,
          costCenterId: line.costCenterId,
          reconciliationId: null,
          letterCode: null,
          reconciledAtUtc: null,
        }),
      ),
    );
    entry.status = JournalEntryStatus.Reversed;
    entry.reversalEntryId = reversal.id;
    await manager.save(entry);
    return reversal.id;
  }

  private async restorePaymentAllocations(
    manager: EntityManager,
    payment: ThirdPartyPayment,
    organizationId: string,
    dossierId: string,
  ) {
    const allocations = await manager.find(PaymentAllocation, {
      where: { paymentId: payment.id, organizationId },
    });
    const invoiceIds: string[] = [];
    for (const allocation of allocations) {
      const invoice = await manager.findOne(BusinessInvoice, {
        where: { id: allocation.invoiceId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice)
        throw new ConflictException(
          'Une facture affectée au règlement est introuvable.',
        );
      const amount = toMillimes(allocation.amount);
      const paid = toMillimes(invoice.paidAmount);
      if (amount > paid)
        throw new ConflictException(
          `Le montant réglé de la facture ${invoice.number} est incohérent.`,
        );
      const nextPaid = paid - amount;
      const nextOutstanding = toMillimes(invoice.outstandingAmount) + amount;
      invoice.paidAmount = fromMillimes(nextPaid);
      invoice.outstandingAmount = fromMillimes(nextOutstanding);
      invoice.settlementStatus =
        nextOutstanding === 0n
          ? InvoiceSettlementStatus.Paid
          : nextPaid === 0n
            ? InvoiceSettlementStatus.Unpaid
            : InvoiceSettlementStatus.PartiallyPaid;
      await manager.save(invoice);
      invoiceIds.push(invoice.id);
    }
    return invoiceIds;
  }

  private async releaseBankMatches(
    manager: EntityManager,
    payment: ThirdPartyPayment,
    organizationId: string,
    dossierId: string,
  ) {
    const transactions = await manager.find(BankTransaction, {
      where: [
        { organizationId, dossierId, matchedPaymentId: payment.id },
        {
          organizationId,
          dossierId,
          journalEntryId: payment.journalEntryId,
          status: BankTransactionStatus.Matched,
        },
      ],
      lock: { mode: 'pessimistic_write' },
    });
    if (!transactions.length) return [];
    const statementIds = [
      ...new Set(transactions.map((item) => item.statementId)),
    ];
    for (const transaction of transactions) {
      transaction.status = BankTransactionStatus.Unmatched;
      transaction.matchType = null;
      transaction.matchConfidence = null;
      transaction.matchedPaymentId = null;
      transaction.journalEntryId = null;
      transaction.matchedByUserId = null;
      transaction.matchedAtUtc = null;
    }
    await manager.save(transactions);
    for (const statementId of statementIds) {
      const statement = await manager.findOne(BankStatement, {
        where: { id: statementId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!statement) continue;
      const [total, matched] = await Promise.all([
        manager.count(BankTransaction, { where: { statementId } }),
        manager.count(BankTransaction, {
          where: { statementId, status: BankTransactionStatus.Matched },
        }),
      ]);
      statement.status =
        matched === total
          ? BankStatementStatus.Ready
          : matched > 0
            ? BankStatementStatus.PartiallyMatched
            : BankStatementStatus.Imported;
      statement.bookClosingBalance = null;
      statement.difference = null;
      statement.reconciledByUserId = null;
      statement.reconciledAtUtc = null;
      await manager.save(statement);
    }
    return transactions.map((item) => item.id);
  }

  async depositInstrument(
    organizationId: string,
    dossierId: string,
    paymentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const payment = await this.payments.findOneBy({
      id: paymentId,
      organizationId,
      dossierId,
    });
    if (!payment) throw new NotFoundException('Le règlement est introuvable.');
    if (payment.instrumentStatus !== PaymentInstrumentStatus.Received)
      throw new ConflictException(
        'Seul un effet à l’état « Reçu » peut être déposé en banque.',
      );
    payment.instrumentStatus = PaymentInstrumentStatus.Deposited;
    payment.instrumentDepositedAtUtc = new Date();
    await this.payments.save(payment);
    return payment;
  }

  async clearInstrument(
    organizationId: string,
    dossierId: string,
    paymentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const payment = await this.payments.findOneBy({
      id: paymentId,
      organizationId,
      dossierId,
    });
    if (!payment) throw new NotFoundException('Le règlement est introuvable.');
    if (payment.instrumentStatus !== PaymentInstrumentStatus.Deposited)
      throw new ConflictException(
        'Seul un effet à l’état « Déposé » peut être marqué encaissé.',
      );
    payment.instrumentStatus = PaymentInstrumentStatus.Cleared;
    payment.instrumentClearedAtUtc = new Date();
    await this.payments.save(payment);
    return payment;
  }

  async rejectInstrument(
    organizationId: string,
    dossierId: string,
    paymentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(ThirdPartyPayment, {
        where: { id: paymentId, organizationId, dossierId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment)
        throw new NotFoundException('Le règlement est introuvable.');
      if (payment.instrumentStatus !== PaymentInstrumentStatus.Deposited)
        throw new ConflictException(
          'Seul un effet à l’état « Déposé » peut être déclaré impayé.',
        );
      const correctionDate = new Date().toISOString().slice(0, 10);
      const correctionReason = 'Effet déclaré impayé';
      let reversalEntryId: string | null = null;
      let restoredInvoiceIds: string[] = [];
      if (payment.status === ThirdPartyPaymentStatus.Posted) {
        reversalEntryId = await this.reversePostedPayment(
          manager,
          payment,
          userId,
          correctionDate,
          correctionReason,
        );
        restoredInvoiceIds = await this.restorePaymentAllocations(
          manager,
          payment,
          organizationId,
          dossierId,
        );
      }
      const releasedTransactions = await this.releaseBankMatches(
        manager,
        payment,
        organizationId,
        dossierId,
      );
      payment.status = ThirdPartyPaymentStatus.Cancelled;
      payment.instrumentStatus = PaymentInstrumentStatus.Rejected;
      payment.correctionType = ThirdPartyPaymentCorrectionType.EntryReversal;
      payment.correctionDate = correctionDate;
      payment.correctionReason = correctionReason;
      payment.correctedByUserId = userId;
      payment.correctedAtUtc = new Date();
      payment.reversalJournalEntryId = reversalEntryId;
      await manager.save(payment);
      const audits = manager.getRepository(AuditLog);
      await audits.save(
        audits.create({
          organizationId,
          actorUserId: userId,
          action: 'third_party_payment.instrument_rejected',
          entityType: 'ThirdPartyPayment',
          entityId: payment.id,
          detailsJson: {
            dossierId,
            correctionDate,
            reason: correctionReason,
            reversalEntryId,
            restoredInvoiceIds,
            releasedBankTransactionIds: releasedTransactions,
          },
        }),
      );
      return payment;
    });
  }

  private isInstrumentMethod(method: string) {
    const normalized = method.trim().toLowerCase();
    return (
      normalized.includes('chèque') ||
      normalized.includes('cheque') ||
      normalized.includes('traite')
    );
  }

  private async validateAccountIds(
    organizationId: string,
    dossierId: string,
    values: Array<string | undefined>,
  ) {
    const ids = [
      ...new Set(values.filter((value): value is string => !!value)),
    ];
    if (!ids.length) return;
    const found = await this.accounts.findBy({
      id: In(ids),
      organizationId,
      dossierId,
      isActive: true,
      allowsPosting: true,
    });
    if (found.length !== ids.length)
      throw new BadRequestException(
        'Un compte est inexistant, inactif ou non mouvementable.',
      );
  }
}
