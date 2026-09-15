import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import {
  CabinetInvoice,
  CabinetPayment,
  InvoiceStatus,
  OrganizationMembership,
} from '../database/entities';
import type { DossiersService } from '../dossiers/dossiers.service';
import { BillingService } from './billing.service';

describe('BillingService edit flows', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const dossierId = '22222222-2222-4222-8222-222222222222';
  const invoiceId = '33333333-3333-4333-8333-333333333333';
  const userId = '44444444-4444-4444-8444-444444444444';

  const makeInvoice = (overrides: Partial<CabinetInvoice> = {}) =>
    ({
      id: invoiceId,
      organizationId,
      dossierId,
      status: InvoiceStatus.Draft,
      paidAmount: '0.000',
      ...overrides,
    }) as CabinetInvoice;

  const setup = (invoice: CabinetInvoice) => {
    const save = jest.fn((value: CabinetInvoice) => Promise.resolve(value));
    const invoices = {
      findOneBy: jest.fn().mockResolvedValue(invoice),
      save,
    } as unknown as Repository<CabinetInvoice>;
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue({ id: dossierId }),
    } as unknown as DossiersService;
    const service = new BillingService(
      {} as DataSource,
      invoices,
      {} as Repository<CabinetPayment>,
      {} as Repository<OrganizationMembership>,
      dossiers,
    );
    return { service, save };
  };

  const setupCorrection = (
    invoice: CabinetInvoice,
    payment: CabinetPayment,
  ) => {
    const save = jest.fn((value: CabinetInvoice | CabinetPayment) =>
      Promise.resolve(value),
    );
    const manager = {
      findOne: jest.fn(
        (entity: typeof CabinetInvoice | typeof CabinetPayment) =>
          Promise.resolve(entity === CabinetInvoice ? invoice : payment),
      ),
      save,
    };
    const dataSource = {
      transaction: jest.fn(
        (work: (value: typeof manager) => Promise<unknown>) => work(manager),
      ),
    } as unknown as DataSource;
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue({ id: dossierId }),
    } as unknown as DossiersService;
    const service = new BillingService(
      dataSource,
      {} as Repository<CabinetInvoice>,
      {} as Repository<CabinetPayment>,
      {} as Repository<OrganizationMembership>,
      dossiers,
    );
    return { service, save };
  };

  it('recalculates totals when a draft invoice is edited', async () => {
    const invoice = makeInvoice();
    const { service, save } = setup(invoice);

    const result = await service.update(
      organizationId,
      dossierId,
      invoiceId,
      userId,
      {
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        description: ' Tenue comptable ',
        netAmount: '100.000',
        vatRate: '0.19',
        stampDuty: '1.000',
        notes: ' Septembre ',
      },
    );

    expect(result).toMatchObject({
      description: 'Tenue comptable',
      netAmount: '100.000',
      vatAmount: '19.000',
      totalAmount: '120.000',
      notes: 'Septembre',
    });
    expect(save).toHaveBeenCalledWith(invoice);
  });

  it('refuses to edit an issued invoice', async () => {
    const { service } = setup(makeInvoice({ status: InvoiceStatus.Sent }));

    await expect(
      service.update(organizationId, dossierId, invoiceId, userId, {
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        description: 'Tenue comptable',
        netAmount: '100.000',
        vatRate: '0.19',
        stampDuty: '1.000',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels an unpaid invoice without deleting it', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.Sent });
    const { service } = setup(invoice);

    const result = await service.cancel(
      organizationId,
      dossierId,
      invoiceId,
      userId,
    );

    expect(result.status).toBe(InvoiceStatus.Cancelled);
  });

  it('refuses cancellation after any payment', async () => {
    const { service } = setup(
      makeInvoice({
        status: InvoiceStatus.PartiallyPaid,
        paidAmount: '10.000',
      }),
    );

    await expect(
      service.cancel(organizationId, dossierId, invoiceId, userId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps a payment and records its correction trail', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.Paid,
      totalAmount: '120.000',
      paidAmount: '120.000',
      dueDate: '2026-09-30',
    });
    const payment = {
      id: '55555555-5555-4555-8555-555555555555',
      organizationId,
      invoiceId,
      paymentDate: '2026-09-05',
      amount: '120.000',
      correctionType: null,
    } as CabinetPayment;
    const { service, save } = setupCorrection(invoice, payment);

    const result = await service.correctPayment(
      organizationId,
      dossierId,
      invoiceId,
      payment.id,
      userId,
      {
        correctionType: 'ANNULATION_SAISIE',
        correctionDate: '2026-09-06',
        reason: 'Doublon de saisie',
      },
    );

    expect(result).toMatchObject({
      correctionType: 'ANNULATION_SAISIE',
      correctionDate: '2026-09-06',
      correctionReason: 'Doublon de saisie',
      correctedByUserId: userId,
    });
    expect(invoice).toMatchObject({
      paidAmount: '0.000',
      status: InvoiceStatus.Sent,
    });
    expect(save).toHaveBeenCalledWith(payment);
    expect(save).toHaveBeenCalledWith(invoice);
  });

  it('refuses to correct the same payment twice', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.Sent,
      totalAmount: '120.000',
      paidAmount: '0.000',
    });
    const payment = {
      id: '55555555-5555-4555-8555-555555555555',
      organizationId,
      invoiceId,
      paymentDate: '2026-09-05',
      amount: '120.000',
      correctionType: 'ANNULATION_SAISIE',
    } as CabinetPayment;
    const { service } = setupCorrection(invoice, payment);

    await expect(
      service.correctPayment(
        organizationId,
        dossierId,
        invoiceId,
        payment.id,
        userId,
        {
          correctionType: 'REMBOURSEMENT',
          correctionDate: '2026-09-06',
          reason: 'Second essai',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a meaningful correction reason', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.Paid,
      totalAmount: '120.000',
      paidAmount: '120.000',
    });
    const payment = {
      id: '55555555-5555-4555-8555-555555555555',
      organizationId,
      invoiceId,
      paymentDate: '2026-09-05',
      amount: '120.000',
      correctionType: null,
    } as CabinetPayment;
    const { service } = setupCorrection(invoice, payment);

    await expect(
      service.correctPayment(
        organizationId,
        dossierId,
        invoiceId,
        payment.id,
        userId,
        {
          correctionType: 'ANNULATION_SAISIE',
          correctionDate: '2026-09-06',
          reason: '   ',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
