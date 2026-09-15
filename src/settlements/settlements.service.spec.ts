import { ConflictException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import {
  AccountingJournal,
  AuditLog,
  BankStatement,
  BankStatementStatus,
  BankTransaction,
  BankTransactionStatus,
  BusinessInvoice,
  InvoiceSettlementStatus,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  LedgerAccount,
  PaymentAllocation,
  PaymentInstrumentStatus,
  ThirdParty,
  ThirdPartyPayment,
  ThirdPartyPaymentCorrectionType,
  ThirdPartyPaymentStatus,
} from '../database/entities';
import type { DossiersService } from '../dossiers/dossiers.service';
import type { PeriodLockService } from '../period-closing/period-lock.service';
import { SettlementsService } from './settlements.service';

describe('SettlementsService payment corrections', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const dossierId = '22222222-2222-4222-8222-222222222222';
  const paymentId = '33333333-3333-4333-8333-333333333333';
  const entryId = '44444444-4444-4444-8444-444444444444';
  const reversalId = '55555555-5555-4555-8555-555555555555';
  const invoiceId = '66666666-6666-4666-8666-666666666666';
  const statementId = '77777777-7777-4777-8777-777777777777';
  const transactionId = '88888888-8888-4888-8888-888888888888';
  const userId = '99999999-9999-4999-8999-999999999999';

  const makeService = (payment: ThirdPartyPayment) => {
    const entry = {
      id: entryId,
      organizationId,
      dossierId,
      journalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      entryDate: '2026-09-01',
      pieceReference: 'REG-001',
      description: 'Encaissement client',
      status: JournalEntryStatus.Posted,
      totalDebit: '100.000',
      totalCredit: '100.000',
      reversalEntryId: null,
    } as JournalEntry;
    const lines = [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        organizationId,
        entryId,
        accountId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        label: 'Banque',
        debit: '100.000',
        credit: '0.000',
        thirdPartyName: 'Client Démo',
        costCenterId: null,
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        organizationId,
        entryId,
        accountId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        label: 'Client',
        debit: '0.000',
        credit: '100.000',
        thirdPartyName: 'Client Démo',
        costCenterId: null,
      },
    ] as JournalEntryLine[];
    const allocation = {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      organizationId,
      paymentId,
      invoiceId,
      amount: '100.000',
    } as PaymentAllocation;
    const invoice = {
      id: invoiceId,
      organizationId,
      dossierId,
      number: 'FV-001',
      paidAmount: '100.000',
      outstandingAmount: '0.000',
      settlementStatus: InvoiceSettlementStatus.Paid,
    } as BusinessInvoice;
    const transaction = {
      id: transactionId,
      organizationId,
      dossierId,
      statementId,
      status: BankTransactionStatus.Matched,
      matchType: 'PAIEMENT',
      matchConfidence: '1.000',
      matchedPaymentId: paymentId,
      journalEntryId: entryId,
      matchedByUserId: userId,
      matchedAtUtc: new Date(),
    } as BankTransaction;
    const statement = {
      id: statementId,
      organizationId,
      dossierId,
      status: BankStatementStatus.Reconciled,
      bookClosingBalance: '100.000',
      difference: '0.000',
      reconciledByUserId: userId,
      reconciledAtUtc: new Date(),
    } as BankStatement;
    let savedAudit: AuditLog | null = null;
    const auditSave = jest.fn((value: AuditLog) => {
      savedAudit = value;
      return Promise.resolve(value);
    });
    const save = jest.fn((value: unknown) => {
      if (
        !Array.isArray(value) &&
        value &&
        typeof value === 'object' &&
        'description' in value &&
        String(value.description).startsWith('Correction règlement') &&
        !('id' in value)
      ) {
        Object.assign(value, { id: reversalId });
      }
      return Promise.resolve(value);
    });
    const manager = {
      findOne: jest.fn((entity: unknown) => {
        if (entity === ThirdPartyPayment) return Promise.resolve(payment);
        if (entity === JournalEntry) return Promise.resolve(entry);
        if (entity === BusinessInvoice) return Promise.resolve(invoice);
        if (entity === BankStatement) return Promise.resolve(statement);
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: unknown) => {
        if (entity === JournalEntryLine) return Promise.resolve(lines);
        if (entity === PaymentAllocation) return Promise.resolve([allocation]);
        if (entity === BankTransaction) return Promise.resolve([transaction]);
        return Promise.resolve([]);
      }),
      count: jest.fn(
        (_entity: unknown, options: { where?: { status?: string } }) =>
          Promise.resolve(options.where?.status ? 0 : 1),
      ),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save,
      findOneOrFail: jest.fn().mockResolvedValue(payment),
      getRepository: jest.fn((entity: unknown) => {
        if (entity !== AuditLog) throw new Error('Unexpected repository');
        return { create: (value: AuditLog) => value, save: auditSave };
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        (work: (value: typeof manager) => Promise<unknown>) => work(manager),
      ),
    } as unknown as DataSource;
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue({ id: dossierId }),
    } as unknown as DossiersService;
    const assertDateOpen = jest.fn().mockResolvedValue(undefined);
    const periodLocks = { assertDateOpen } as unknown as PeriodLockService;
    const service = new SettlementsService(
      dataSource,
      {} as Repository<ThirdParty>,
      {} as Repository<ThirdPartyPayment>,
      {} as Repository<BusinessInvoice>,
      {} as Repository<AccountingJournal>,
      {} as Repository<LedgerAccount>,
      dossiers,
      periodLocks,
    );
    return {
      service,
      entry,
      invoice,
      transaction,
      statement,
      auditSave,
      getSavedAudit: () => savedAudit,
      assertDateOpen,
    };
  };

  const postedPayment = () =>
    ({
      id: paymentId,
      organizationId,
      dossierId,
      paymentDate: '2026-09-01',
      amount: '100.000',
      journalEntryId: entryId,
      status: ThirdPartyPaymentStatus.Posted,
      correctionType: null,
    }) as ThirdPartyPayment;

  it('reverses accounting, restores invoices and reopens bank matching', async () => {
    const payment = postedPayment();
    const context = makeService(payment);

    await context.service.correctPayment(
      organizationId,
      dossierId,
      paymentId,
      userId,
      {
        correctionType: ThirdPartyPaymentCorrectionType.EntryReversal,
        correctionDate: '2026-09-05',
        reason: 'Doublon de saisie',
      },
    );

    expect(context.assertDateOpen).toHaveBeenCalledWith(
      organizationId,
      dossierId,
      '2026-09-05',
      expect.anything(),
    );
    expect(context.entry).toMatchObject({
      status: JournalEntryStatus.Reversed,
      reversalEntryId: reversalId,
    });
    expect(context.invoice).toMatchObject({
      paidAmount: '0.000',
      outstandingAmount: '100.000',
      settlementStatus: InvoiceSettlementStatus.Unpaid,
    });
    expect(context.transaction).toMatchObject({
      status: BankTransactionStatus.Unmatched,
      matchedPaymentId: null,
      journalEntryId: null,
    });
    expect(context.statement).toMatchObject({
      status: BankStatementStatus.Imported,
      bookClosingBalance: null,
      difference: null,
      reconciledByUserId: null,
    });
    expect(payment).toMatchObject({
      status: ThirdPartyPaymentStatus.Cancelled,
      correctionReason: 'Doublon de saisie',
      correctedByUserId: userId,
      reversalJournalEntryId: reversalId,
    });
    expect(context.auditSave).toHaveBeenCalledTimes(1);
    expect(context.getSavedAudit()).toMatchObject({
      action: 'third_party_payment.corrected',
      entityId: paymentId,
      detailsJson: {
        restoredInvoiceIds: [invoiceId],
        releasedBankTransactionIds: [transactionId],
      },
    });
  });

  it('refuses to label an unposted draft as a refund', async () => {
    const payment = postedPayment();
    payment.status = ThirdPartyPaymentStatus.Draft;
    const context = makeService(payment);

    await expect(
      context.service.correctPayment(
        organizationId,
        dossierId,
        paymentId,
        userId,
        {
          correctionType: ThirdPartyPaymentCorrectionType.Refund,
          correctionDate: '2026-09-05',
          reason: 'Remboursement demandé',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(context.assertDateOpen).not.toHaveBeenCalled();
  });

  it('uses the same auditable reversal when a deposited instrument is unpaid', async () => {
    const payment = postedPayment();
    payment.instrumentStatus = PaymentInstrumentStatus.Deposited;
    const context = makeService(payment);

    await context.service.rejectInstrument(
      organizationId,
      dossierId,
      paymentId,
      userId,
    );

    expect(payment).toMatchObject({
      status: ThirdPartyPaymentStatus.Cancelled,
      instrumentStatus: PaymentInstrumentStatus.Rejected,
      correctionType: ThirdPartyPaymentCorrectionType.EntryReversal,
      correctionReason: 'Effet déclaré impayé',
      correctedByUserId: userId,
      reversalJournalEntryId: reversalId,
    });
    expect(context.invoice).toMatchObject({
      paidAmount: '0.000',
      outstandingAmount: '100.000',
      settlementStatus: InvoiceSettlementStatus.Unpaid,
    });
    expect(context.transaction.status).toBe(BankTransactionStatus.Unmatched);
    expect(context.getSavedAudit()).toMatchObject({
      action: 'third_party_payment.instrument_rejected',
      entityId: paymentId,
    });
  });
});
