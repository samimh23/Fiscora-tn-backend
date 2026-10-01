import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  AccountReconciliation,
  AuditLog,
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceStatus,
  JournalEntryLine,
  JournalEntryStatus,
  PaymentAllocation,
  ThirdPartyPaymentStatus,
} from '../database/entities';
import { PeriodLockService } from '../period-closing/period-lock.service';
import { autoLetterInvoice, releaseEntryLettrage } from './invoice-lettrage';

function setup() {
  const invoice = {
    id: 'invoice',
    organizationId: 'org',
    dossierId: 'dossier',
    thirdPartyId: 'party',
    thirdPartyName: 'Sahel',
    thirdPartyAccountId: '4011',
    journalEntryId: 'invoice-entry',
    kind: BusinessInvoiceKind.Invoice,
    status: BusinessInvoiceStatus.Posted,
    outstandingAmount: '0.000',
  } as BusinessInvoice;
  const payment = {
    organizationId: 'org',
    dossierId: 'dossier',
    thirdPartyId: 'party',
    thirdPartyAccountId: '4011',
    journalEntryId: 'payment-entry',
    status: ThirdPartyPaymentStatus.Posted,
    allocations: [{ invoiceId: 'invoice' }],
  };
  const allocations = [{ payment }] as PaymentAllocation[];
  const credits: BusinessInvoice[] = [];
  const line = (entryId: string, debit: string, credit: string) =>
    ({
      id: entryId,
      organizationId: 'org',
      entryId,
      accountId: '4011',
      debit,
      credit,
      thirdPartyName: 'Sahel',
      reconciliationId: null,
      letterCode: null,
      entry: {
        dossierId: 'dossier',
        status: JournalEntryStatus.Posted,
        entryDate: '2026-09-24',
      },
    }) as JournalEntryLine;
  const lines = [
    line('invoice-entry', '0.000', '65.200'),
    line('payment-entry', '65.200', '0.000'),
  ];
  const group = {
    id: 'group',
    organizationId: 'org',
    dossierId: 'dossier',
    code: 'LET-existing',
    lines,
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    find: jest.fn((entity: unknown) =>
      Promise.resolve(
        entity === PaymentAllocation
          ? allocations
          : entity === BusinessInvoice
            ? credits
            : lines,
      ),
    ),
    findOne: jest.fn().mockResolvedValue(group),
    create: jest.fn((entity: unknown, value: Record<string, unknown>) =>
      entity === AccountReconciliation ? { ...value, id: 'group' } : value,
    ),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    remove: jest.fn().mockResolvedValue(group),
  };
  const locks = { assertDateOpen: jest.fn().mockResolvedValue(undefined) };
  const run = () =>
    autoLetterInvoice(
      manager as unknown as EntityManager,
      invoice,
      'user',
      locks as unknown as PeriodLockService,
    );
  const release = () =>
    releaseEntryLettrage(
      manager as unknown as EntityManager,
      'org',
      'dossier',
      [lines[1]],
      'user',
      locks as unknown as PeriodLockService,
    );
  return {
    invoice,
    payment,
    allocations,
    credits,
    line,
    lines,
    group,
    manager,
    locks,
    run,
    release,
  };
}

describe('Automatic invoice lettrage', () => {
  it('letters a fully settled invoice and its payment only, with an audit trail', async () => {
    const s = setup();
    await s.run();
    expect(s.lines.map((line) => line.reconciliationId)).toEqual([
      'group',
      'group',
    ]);
    expect(s.manager.create).toHaveBeenCalledWith(
      AccountReconciliation,
      expect.objectContaining({
        totalDebit: '65.200',
        totalCredit: '65.200',
        accountId: '4011',
      }),
    );
    expect(s.manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({
        action: 'account_reconciliation.auto_created',
      }),
    );
    const lineCall = s.manager.find.mock.calls.find(
      ([entity]) => entity === JournalEntryLine,
    );
    expect(lineCall).toBeDefined();
  });
  it('is retry-safe once lines are already matched', async () => {
    const s = setup();
    await s.run();
    s.manager.save.mockClear();
    await s.run();
    expect(s.manager.save).not.toHaveBeenCalled();
  });
  it('does not letter a partial payment', async () => {
    const s = setup();
    s.invoice.outstandingAmount = '10.000';
    await s.run();
    expect(s.manager.query).not.toHaveBeenCalled();
    expect(s.manager.save).not.toHaveBeenCalled();
  });
  it('combines multiple posted partial payments when the last settles the invoice', async () => {
    const s = setup();
    s.lines[1].debit = '40.000';
    s.allocations.push({
      payment: { ...s.payment, journalEntryId: 'second-payment' },
    } as PaymentAllocation);
    s.lines.push(s.line('second-payment', '25.200', '0.000'));
    await s.run();
    expect(s.lines.every((line) => line.reconciliationId === 'group')).toBe(
      true,
    );
  });
  it('includes a posted credit note in exact settlement', async () => {
    const s = setup();
    s.lines[1].debit = '55.200';
    s.credits.push({
      journalEntryId: 'credit-entry',
      thirdPartyId: 'party',
      thirdPartyAccountId: '4011',
    } as BusinessInvoice);
    s.lines.push(s.line('credit-entry', '10.000', '0.000'));
    await s.run();
    expect(s.lines.every((line) => line.reconciliationId === 'group')).toBe(
      true,
    );
  });
  it.each([
    'party',
    'account',
    'multi-invoice',
    'unbalanced',
    'existing',
    'name',
    'reversed',
    'missing-entry',
    'draft',
  ])('leaves %s cases manual', async (condition) => {
    const s = setup();
    if (condition === 'party') s.payment.thirdPartyId = 'another';
    if (condition === 'account')
      s.payment.thirdPartyAccountId = 'other-account';
    if (condition === 'multi-invoice')
      s.payment.allocations.push({ invoiceId: 'another' });
    if (condition === 'unbalanced') s.lines[1].debit = '65.199';
    if (condition === 'existing') s.lines[0].reconciliationId = 'manual-group';
    if (condition === 'name') s.lines[1].thirdPartyName = 'Another supplier';
    if (condition === 'reversed')
      s.lines[1].entry.status = JournalEntryStatus.Reversed;
    if (condition === 'missing-entry') s.lines.pop();
    if (condition === 'draft') s.payment.status = ThirdPartyPaymentStatus.Draft;
    await s.run();
    expect(s.manager.save).not.toHaveBeenCalled();
  });
  it('keeps a closed historical period untouched without failing payment posting', async () => {
    const s = setup();
    s.locks.assertDateOpen.mockRejectedValue(new ConflictException('closed'));
    await s.run();
    expect(s.manager.save).not.toHaveBeenCalled();
  });
  it('does not hide infrastructure errors', async () => {
    const s = setup();
    s.locks.assertDateOpen.mockRejectedValue(new Error('database unavailable'));
    await expect(s.run()).rejects.toThrow('database unavailable');
  });
});

describe('Lettrage during corrections', () => {
  it('releases all related lines, including the invoice, and audits the removal', async () => {
    const s = setup();
    for (const line of s.lines) line.reconciliationId = 'group';
    await s.release();
    expect(s.lines.every((line) => line.reconciliationId === null)).toBe(true);
    expect(s.manager.remove).toHaveBeenCalledWith(s.group);
    expect(s.manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({
        action: 'account_reconciliation.released_for_correction',
      }),
    );
  });
  it('does nothing for an unmatched entry', async () => {
    const s = setup();
    await s.release();
    expect(s.manager.query).not.toHaveBeenCalled();
  });
  it('blocks changes to a group containing closed-period lines', async () => {
    const s = setup();
    s.lines[1].reconciliationId = 'group';
    s.locks.assertDateOpen.mockRejectedValue(new ConflictException('closed'));
    await expect(s.release()).rejects.toThrow('closed');
    expect(s.manager.save).not.toHaveBeenCalled();
  });
});
