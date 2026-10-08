import {
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceLine,
  BusinessInvoiceStatus,
  BusinessInvoiceType,
  JournalEntryStatus,
} from '../database/entities';
import { BusinessInvoicesService } from './business-invoices.service';

describe('Posting a locked invoice', () => {
  function setup(type = BusinessInvoiceType.Purchase) {
    const header = {
      id: 'invoice',
      organizationId: 'org',
      dossierId: 'dossier',
      type,
      kind: BusinessInvoiceKind.Invoice,
      status: BusinessInvoiceStatus.Validated,
      journalEntryId: 'entry',
      thirdPartyAccountId: 'party',
      vatAccountId: null,
    };
    const lines = [
      Object.assign(new BusinessInvoiceLine(), {
        organizationId: 'org',
        invoiceId: 'invoice',
        accountId: 'expense',
      }),
    ];
    const loaded = Object.assign(new BusinessInvoice(), header, { lines });
    // Real TypeORM entities declare unloaded relations as undefined, unlike
    // plain-object mocks. A header reload must not erase the invoice lines.
    const locked = Object.assign(new BusinessInvoice(), header);
    const entry = {
      status: JournalEntryStatus.Draft,
      entryDate: '2026-05-26',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(locked),
      find: jest.fn().mockResolvedValue(lines),
      findOneBy: jest.fn().mockResolvedValue(entry),
      save: jest
        .fn()
        .mockImplementation((value: unknown) => Promise.resolve(value)),
      findOneOrFail: jest.fn().mockResolvedValue(loaded),
    };
    const accounts = {
      findBy: jest.fn().mockResolvedValue([
        {
          id: 'party',
          code: type === BusinessInvoiceType.Purchase ? '4011' : '411',
        },
        {
          id: 'expense',
          code: type === BusinessInvoiceType.Purchase ? '604' : '705',
        },
      ]),
    };
    const periodLocks = { assertDateOpen: jest.fn() };
    const service = new BusinessInvoicesService(
      {
        transaction: (work: (m: typeof manager) => Promise<unknown>) =>
          work(manager),
      } as never,
      { findOne: jest.fn().mockResolvedValue(loaded) } as never,
      {} as never,
      accounts as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getAccessibleEntity: jest.fn() } as never,
      {} as never,
      periodLocks as never,
    );
    return {
      service,
      manager,
      loaded,
      locked,
      entry,
      lines,
      accounts,
      periodLocks,
    };
  }

  it.each([BusinessInvoiceType.Purchase, BusinessInvoiceType.Sale])(
    'loads lines inside the transaction before posting a %s invoice',
    async (type) => {
      const { service, manager, locked, entry, lines } = setup(type);
      expect(locked.lines).toBeUndefined();
      await service.post('org', 'dossier', 'invoice', 'user');
      expect(manager.findOne).toHaveBeenCalledWith(BusinessInvoice, {
        where: { id: 'invoice', organizationId: 'org', dossierId: 'dossier' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.find).toHaveBeenCalledWith(BusinessInvoiceLine, {
        where: { invoiceId: 'invoice', organizationId: 'org' },
      });
      expect(locked.lines).toBe(lines);
      expect(entry).toMatchObject({
        status: JournalEntryStatus.Posted,
        postedByUserId: 'user',
      });
      expect(manager.save).toHaveBeenCalledWith(locked);
      expect(locked.status).toBe(BusinessInvoiceStatus.Posted);
    },
  );

  it('validates current transaction lines rather than stale pre-lock lines', async () => {
    const { service, manager, accounts } = setup();
    manager.find.mockResolvedValue([
      Object.assign(new BusinessInvoiceLine(), { accountId: 'missing' }),
    ]);
    accounts.findBy.mockResolvedValue([{ id: 'party', code: '4011' }]);
    await expect(
      service.post('org', 'dossier', 'invoice', 'user'),
    ).rejects.toThrow('Un compte');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not post an invoice whose status changed before the lock', async () => {
    const { service, manager, locked } = setup();
    locked.status = BusinessInvoiceStatus.Posted;
    await expect(
      service.post('org', 'dossier', 'invoice', 'user'),
    ).rejects.toThrow('ne peut plus');
    expect(manager.find).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('keeps closed-period checks before any accounting writes', async () => {
    const { service, manager, periodLocks } = setup();
    periodLocks.assertDateOpen.mockRejectedValue(new Error('Période clôturée'));
    await expect(
      service.post('org', 'dossier', 'invoice', 'user'),
    ).rejects.toThrow('Période clôturée');
    expect(manager.save).not.toHaveBeenCalled();
  });
});
