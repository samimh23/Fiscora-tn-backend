import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AuditLog,
  BankMatchType,
  BankStatement,
  BankStatementStatus,
  BankTransaction,
  BankTransactionStatus,
  DossierStatus,
} from '../database/entities';
import { BankReconciliationService } from './bank-reconciliation.service';
import { UnmatchBankTransactionDto } from './dto';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { PERMISSION_KEY } from '../common/permission.decorator';
import { PermissionNames } from '../database/permissions';

describe('Undo bank reconciliation', () => {
  const org = 'organization';
  const dossier = 'dossier';
  const dto = {
    reason: '  Mauvais règlement  ',
    journalEntryId: 'entry',
    paymentId: 'payment',
  };
  function setup() {
    const statement = { id: 'statement', status: BankStatementStatus.Ready };
    const transaction = {
      id: 'transaction',
      statementId: 'statement',
      statement,
      transactionDate: '2026-09-18',
      amount: '-700.000',
      status: BankTransactionStatus.Matched,
      matchType: BankMatchType.Payment,
      matchConfidence: 90,
      matchedPaymentId: 'payment' as string | null,
      journalEntryId: 'entry' as string | null,
      matchedByUserId: 'original-user' as string | null,
      matchedAtUtc: new Date('2026-10-01T10:00:00Z') as Date | null,
    };
    const audit = {
      create: jest.fn(
        (value: {
          organizationId: string;
          actorUserId: string;
          action: string;
          detailsJson: { reason: string; previous: Record<string, unknown> };
        }) => value,
      ),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    const manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(entity === BankStatement ? statement : transaction),
      ),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      getRepository: jest.fn((entity: unknown) => {
        if (entity !== AuditLog)
          throw new Error('Unexpected repository mutation');
        return audit;
      }),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback(manager),
      ),
    };
    const transactions = { findOne: jest.fn().mockResolvedValue(transaction) };
    const accessible = { status: DossierStatus.Active };
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue(accessible),
    };
    const periods = { assertDateOpen: jest.fn().mockResolvedValue(undefined) };
    const service = new BankReconciliationService(
      dataSource as never,
      {} as never,
      {} as never,
      {} as never,
      transactions as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dossiers as never,
      periods as never,
    );
    return {
      service,
      transaction,
      statement,
      manager,
      audit,
      dossiers,
      accessible,
      periods,
      transactions,
    };
  }

  it.each([
    BankMatchType.Payment,
    BankMatchType.Automatic,
    BankMatchType.JournalEntry,
    BankMatchType.GeneratedEntry,
  ])('removes only the %s link and records its history', async (type) => {
    const s = setup();
    s.transaction.matchType = type;
    const paymentId =
      type === BankMatchType.Payment || type === BankMatchType.Automatic
        ? 'payment'
        : null;
    s.transaction.matchedPaymentId = paymentId;
    await s.service.unmatch(org, dossier, 'transaction', 'actor', {
      ...dto,
      paymentId,
    });
    expect(s.transaction).toMatchObject({
      status: BankTransactionStatus.Unmatched,
      matchType: null,
      matchConfidence: null,
      matchedPaymentId: null,
      journalEntryId: null,
      matchedByUserId: null,
      matchedAtUtc: null,
      amount: '-700.000',
      transactionDate: '2026-09-18',
    });
    expect(s.statement.status).toBe(BankStatementStatus.Imported);
    expect(s.manager.save.mock.calls.map(([entity]) => entity)).toEqual([
      s.transaction,
      s.statement,
    ]);
    const auditValue = s.audit.create.mock.calls[0][0];
    expect(auditValue).toMatchObject({
      organizationId: org,
      actorUserId: 'actor',
      action: 'bank_transaction.unmatched',
    });
    expect(auditValue.detailsJson.reason).toBe('Mauvais règlement');
    expect(auditValue.detailsJson.previous).toMatchObject({
      journalEntryId: 'entry',
      matchedPaymentId: paymentId,
      matchType: type,
    });
    expect(s.periods.assertDateOpen).toHaveBeenCalledWith(
      org,
      dossier,
      '2026-09-18',
      s.manager,
    );
    expect(s.manager.findOne.mock.calls[0]).toEqual([
      BankStatement,
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
        where: { id: 'statement', organizationId: org, dossierId: dossier },
      }),
    ]);
    expect(s.manager.findOne.mock.calls[1][0]).toBe(BankTransaction);
  });

  it('keeps the statement partially matched when other links remain', async () => {
    const s = setup();
    s.manager.count.mockResolvedValue(2);
    await s.service.unmatch(org, dossier, 'transaction', 'actor', dto);
    expect(s.statement.status).toBe(BankStatementStatus.PartiallyMatched);
  });

  it('blocks a validated statement after acquiring its lock', async () => {
    const s = setup();
    s.statement.status = BankStatementStatus.Reconciled;
    await expect(
      s.service.unmatch(org, dossier, 'transaction', 'actor', dto),
    ).rejects.toThrow('validé');
    expect(s.manager.save).not.toHaveBeenCalled();
  });

  it('blocks a closed period without changing the match', async () => {
    const s = setup();
    s.periods.assertDateOpen.mockRejectedValue(new Error('Période clôturée'));
    await expect(
      s.service.unmatch(org, dossier, 'transaction', 'actor', dto),
    ).rejects.toThrow('clôturée');
    expect(s.transaction.matchedPaymentId).toBe('payment');
    expect(s.manager.save).not.toHaveBeenCalled();
  });

  it('blocks an archived dossier', async () => {
    const s = setup();
    s.accessible.status = DossierStatus.Archived;
    await expect(
      s.service.unmatch(org, dossier, 'transaction', 'actor', dto),
    ).rejects.toThrow('lecture seule');
    expect(s.manager.save).not.toHaveBeenCalled();
  });

  it('enforces dossier access before loading transactions', async () => {
    const s = setup();
    s.dossiers.getAccessibleEntity.mockRejectedValue(
      new Error('Not accessible'),
    );
    await expect(
      s.service.unmatch(org, dossier, 'transaction', 'actor', dto),
    ).rejects.toThrow('Not accessible');
    expect(s.transactions.findOne).not.toHaveBeenCalled();
  });

  it.each([BankTransactionStatus.Unmatched, BankTransactionStatus.DraftEntry])(
    'rejects a stale request for status %s',
    async (status) => {
      const s = setup();
      s.transaction.status = status;
      await expect(
        s.service.unmatch(org, dossier, 'transaction', 'actor', dto),
      ).rejects.toThrow('n’est plus rapprochée');
      expect(s.manager.save).not.toHaveBeenCalled();
    },
  );

  it('does not undo a different link changed by another user', async () => {
    const s = setup();
    s.transaction.matchedPaymentId = 'new-payment';
    await expect(
      s.service.unmatch(org, dossier, 'transaction', 'actor', dto),
    ).rejects.toThrow('a changé');
    expect(s.manager.save).not.toHaveBeenCalled();
  });

  it.each(['', '  ', 'ab', 'x'.repeat(501)])(
    'requires a valid audit reason',
    async (reason) => {
      const s = setup();
      await expect(
        s.service.unmatch(org, dossier, 'transaction', 'actor', {
          ...dto,
          reason,
        }),
      ).rejects.toThrow('motif');
      expect(s.manager.save).not.toHaveBeenCalled();
    },
  );

  it('validates and trims the API payload', async () => {
    const payload = plainToInstance(UnmatchBankTransactionDto, {
      reason: '  Mauvaise association  ',
      journalEntryId: '11111111-1111-4111-8111-111111111111',
      paymentId: null,
    });
    expect(await validate(payload)).toEqual([]);
    expect(payload.reason).toBe('Mauvaise association');
    expect(
      await validate(
        plainToInstance(UnmatchBankTransactionDto, { reason: 'ab' }),
      ),
    ).not.toEqual([]);
  });
  it('requires bank management permission on the undo endpoint', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      BankReconciliationController.prototype,
      'unmatch',
    )?.value;
    if (typeof handler !== 'function') {
      throw new Error('Undo endpoint is missing');
    }
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe(
      PermissionNames.BankReconciliationManage,
    );
  });
});
