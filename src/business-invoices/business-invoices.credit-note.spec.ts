import {
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceStatus,
  BusinessInvoiceType,
  JournalEntryStatus,
  InvoiceSettlementStatus,
} from '../database/entities';
import { EntityManager } from 'typeorm';
import { BusinessInvoicesService } from './business-invoices.service';

describe('Credit-note original invoice identity', () => {
  const original = Object.assign(new BusinessInvoice(), {
    id: 'original',
    type: BusinessInvoiceType.Purchase,
    kind: BusinessInvoiceKind.Invoice,
    status: BusinessInvoiceStatus.Posted,
    thirdPartyId: 'supplier-a',
    thirdPartyName: 'Supplier A',
    thirdPartyTaxIdentifier: '123/A',
    currencyCode: 'TND',
    outstandingAmount: '100.000',
    netPayable: '100.000',
    creditedAmount: '0.000',
    paidAmount: '0.000',
    thirdPartyAccountId: 'party-account',
    vatAccountId: null,
    lines: [],
  });
  function setup() {
    const invoices = { findOneBy: jest.fn().mockResolvedValue(original) };
    const transaction = jest.fn();
    const service = new BusinessInvoicesService(
      { transaction } as never,
      invoices as never,
      {} as never,
      {
        findBy: jest
          .fn()
          .mockResolvedValue([{ id: 'party-account', code: '4011' }]),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getAccessibleEntity: jest.fn() } as never,
      {} as never,
      { assertDateOpen: jest.fn() } as never,
    );
    return { service, invoices, transaction };
  }
  const credit = () =>
    Object.assign(new BusinessInvoice(), {
      ...original,
      id: 'credit',
      originalInvoiceId: 'original',
      kind: BusinessInvoiceKind.CreditNote,
      status: BusinessInvoiceStatus.Draft,
      netPayable: '10.000',
      invoiceDate: '2026-09-30',
    });
  it('accepts only the same scoped, posted original invoice', async () => {
    const { service, invoices } = setup();
    await expect(
      service['validateOriginalInvoice']('org', 'dossier', credit(), '10.000'),
    ).resolves.toBe(original);
    expect(invoices.findOneBy).toHaveBeenCalledWith({
      id: 'original',
      organizationId: 'org',
      dossierId: 'dossier',
      type: BusinessInvoiceType.Purchase,
      kind: BusinessInvoiceKind.Invoice,
      status: BusinessInvoiceStatus.Posted,
    });
  });
  it.each([
    { thirdPartyId: 'supplier-b' },
    { thirdPartyTaxIdentifier: '999/B' },
    { currencyCode: 'EUR' },
  ])('rejects a mismatched party or currency: %j', async (change) => {
    const { service } = setup();
    await expect(
      service['validateOriginalInvoice'](
        'org',
        'dossier',
        Object.assign(credit(), change),
        '10.000',
      ),
    ).rejects.toThrow();
  });
  it('rejects invalid legacy drafts again at validation, before creating entries', async () => {
    const { service, transaction } = setup();
    jest
      .spyOn(service as never, 'find')
      .mockResolvedValue(
        Object.assign(credit(), { thirdPartyId: 'supplier-b' }) as never,
      );
    await expect(
      service.validate('org', 'dossier', 'credit', 'user'),
    ).rejects.toThrow('même tiers');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('checks names when both invoices have no registered third party', () => {
    const { service } = setup();
    const unlinked = Object.assign(new BusinessInvoice(), original, {
      thirdPartyId: null,
    });
    const same = Object.assign(credit(), {
      thirdPartyId: null,
      thirdPartyName: ' supplier   a ',
    });
    expect(() =>
      service['assertCreditNoteIdentity'](same, unlinked),
    ).not.toThrow();
    same.thirdPartyName = 'Supplier B';
    expect(() => service['assertCreditNoteIdentity'](same, unlinked)).toThrow(
      'même tiers',
    );
  });
  it('caps credits by the amount not yet credited', async () => {
    const { service } = setup();
    await expect(
      service['validateOriginalInvoice']('org', 'dossier', credit(), '100.001'),
    ).rejects.toThrow('dépasse');
  });

  it.each([{ thirdPartyId: 'supplier-b' }, { originalInvoiceId: null }])(
    'rechecks legacy validated credit notes before posting anything: %j',
    async (change) => {
      const { service, transaction } = setup();
      const invoice = Object.assign(credit(), change, {
        status: BusinessInvoiceStatus.Validated,
        journalEntryId: 'entry',
      });
      const manager = {
        findOne: jest.fn().mockResolvedValue(invoice),
        findOneBy: jest.fn().mockResolvedValue({
          status: JournalEntryStatus.Draft,
          entryDate: '2026-09-30',
        }),
        findOneOrFail: jest.fn().mockResolvedValue(original),
        save: jest.fn(),
      };
      transaction.mockImplementation((run: (m: EntityManager) => unknown) =>
        run(manager as unknown as EntityManager),
      );
      jest.spyOn(service as never, 'find').mockResolvedValue(invoice);
      await expect(
        service.post('org', 'dossier', 'credit', 'user'),
      ).rejects.toThrow();
      expect(manager.save).not.toHaveBeenCalled();
      if (invoice.originalInvoiceId) {
        expect(manager.findOneOrFail).toHaveBeenCalledWith(
          BusinessInvoice,
          expect.objectContaining({
            lock: { mode: 'pessimistic_write' },
          }),
        );
      }
    },
  );

  it('allows a credit on a fully paid invoice', async () => {
    const { service, invoices } = setup();
    const paid = Object.assign(new BusinessInvoice(), original, {
      paidAmount: '100.000',
      outstandingAmount: '0.000',
    });
    invoices.findOneBy.mockResolvedValue(paid);
    await expect(
      service['validateOriginalInvoice']('org', 'dossier', credit(), '25.000'),
    ).resolves.toBe(paid);
    paid.creditedAmount = '80.000';
    await expect(
      service['validateOriginalInvoice']('org', 'dossier', credit(), '25.000'),
    ).rejects.toThrow('dépasse');
  });

  it('posts a paid-invoice credit as an auditable refund balance', async () => {
    const { service, transaction } = setup();
    const paid = Object.assign(new BusinessInvoice(), original, {
      paidAmount: '100.000',
      outstandingAmount: '0.000',
    });
    const note = Object.assign(credit(), {
      status: BusinessInvoiceStatus.Validated,
      journalEntryId: 'entry',
      netPayable: '25.000',
    });
    const entry = { status: JournalEntryStatus.Draft, entryDate: '2026-09-30' };
    const manager = {
      findOne: jest.fn().mockResolvedValue(note),
      findOneBy: jest.fn().mockResolvedValue(entry),
      findOneOrFail: jest.fn(
        (_entity: unknown, options: { where: { id: string } }) =>
          Promise.resolve(options.where.id === 'original' ? paid : note),
      ),
      save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    transaction.mockImplementation((run: (m: EntityManager) => unknown) =>
      run(manager as unknown as EntityManager),
    );
    jest.spyOn(service as never, 'find').mockResolvedValue(note);
    await service.post('org', 'dossier', 'credit', 'user');
    expect(paid).toMatchObject({
      paidAmount: '100.000',
      creditedAmount: '25.000',
      outstandingAmount: '-25.000',
      settlementStatus: InvoiceSettlementStatus.RefundDue,
    });
    expect(note).toMatchObject({
      status: BusinessInvoiceStatus.Posted,
      outstandingAmount: '0.000',
    });
    await expect(
      service.post('org', 'dossier', 'credit', 'user'),
    ).rejects.toThrow();
  });
});
