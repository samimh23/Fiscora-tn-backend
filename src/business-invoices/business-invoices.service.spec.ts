import { validateSync } from 'class-validator';
import {
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceNature,
  BusinessInvoiceStatus,
  BusinessInvoiceType,
} from '../database/entities';
import { toMillimes } from '../common/money';
import { BusinessInvoiceLineDto, SaveBusinessInvoiceDto } from './dto';
import { BusinessInvoicesService } from './business-invoices.service';

describe('Business invoice adjustment lines', () => {
  const accountId = '11111111-1111-4111-8111-111111111111';
  const dto = (): SaveBusinessInvoiceDto => ({
    type: BusinessInvoiceType.Purchase,
    nature: BusinessInvoiceNature.Services,
    kind: BusinessInvoiceKind.Invoice,
    number: '20261966543',
    invoiceDate: '2026-05-26',
    thirdPartyName: 'TOPNET',
    journalId: accountId,
    thirdPartyAccountId: accountId,
    stampDuty: '1.000',
    lines: ['-38.941', '94.374'].map((unitPrice, index) => ({
      accountId,
      description: index ? 'SMART FIBRE 50M Nv' : 'SMART FIBRE 20M',
      quantity: '1.000',
      unitPrice,
      discountRate: '0.00000',
      vatRate: '0.07000',
    })),
  });

  const service = new BusinessInvoicesService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it.each([
    ['0.00000', '19.190', '121.190'],
    ['0.10000', '21.090', '133.090'],
  ])(
    'keeps FODEC separate from excise and includes both in VAT (%s)',
    async (exciseRate, vat, gross) => {
      const input = {
        ...dto(),
        lines: [
          {
            ...dto().lines[1],
            unitPrice: '100.000',
            vatRate: '0.19000',
            fodecRate: '0.01000',
            exciseRate,
          },
        ],
      };
      const result = await service['calculate']('organization', input);
      expect(result.header.fodecAmount).toBe('1.000');
      expect(result.header.exciseAmount).toBe(
        exciseRate === '0.10000' ? '10.000' : '0.000',
      );
      expect(result.header.vatAmount).toBe(vat);
      expect(result.header.grossAmount).toBe(gross);
      expect(result.lines[0]).toMatchObject({
        fodecRate: '0.01000',
        fodecAmount: '1.000',
      });
      const invoice = {
        ...input,
        ...result.header,
        lines: result.lines,
        vatAccountId: 'vat',
        stampAccountId: 'stamp',
        exciseAccountId: 'excise',
        fodecAccountId: 'fodec',
      } as unknown as BusinessInvoice;
      const posted = service['accountingLines'](invoice);
      expect(posted).toContainEqual(
        expect.objectContaining({
          accountId: 'fodec',
          label: 'FODEC',
          debit: '1.000',
        }),
      );
      expect(
        posted.reduce(
          (sum, line) => sum + toMillimes(line.debit) - toMillimes(line.credit),
          0n,
        ),
      ).toBe(0n);
      if (exciseRate === '0.10000')
        expect(posted).toContainEqual(
          expect.objectContaining({
            accountId: 'excise',
            label: 'Droit de consommation',
            debit: '10.000',
          }),
        );
      invoice.kind = BusinessInvoiceKind.CreditNote;
      expect(service['accountingLines'](invoice)).toContainEqual(
        expect.objectContaining({
          accountId: 'fodec',
          debit: '0.000',
          credit: '1.000',
        }),
      );
    },
  );

  it('accepts signed unit prices but keeps quantities and rates unsigned', () => {
    const line = Object.assign(new BusinessInvoiceLineDto(), dto().lines[0]);
    expect(validateSync(line)).toEqual([]);
    line.unitPrice = '-38.9412';
    expect(validateSync(line).map((error) => error.property)).toContain(
      'unitPrice',
    );
    line.unitPrice = '-38.941';
    line.quantity = '-1';
    line.vatRate = '-0.07';
    expect(validateSync(line).map((error) => error.property)).toEqual(
      expect.arrayContaining(['quantity', 'vatRate']),
    );
  });

  it('calculates the printed TOPNET lines with symmetric millime rounding', async () => {
    const result = await service['calculate']('organization', dto());
    expect(result.lines.map((line) => line.unitPrice)).toEqual([
      '-38.941',
      '94.374',
    ]);
    expect(result.lines.map((line) => line.netAmount)).toEqual([
      '-38.941',
      '94.374',
    ]);
    expect(result.lines.map((line) => line.vatAmount)).toEqual([
      '-2.726',
      '6.606',
    ]);
    expect(result.header.netAmount).toBe('55.433');
    expect(result.header.vatAmount).toBe('3.880');
    expect(result.header.netPayable).toBe('60.313');
  });

  it.each([BusinessInvoiceType.Purchase, BusinessInvoiceType.Sale])(
    'posts adjustments on the opposite side without negative debit/credit (%s)',
    async (type) => {
      const input = { ...dto(), type };
      const result = await service['calculate']('organization', input);
      const invoice = {
        ...input,
        ...result.header,
        lines: result.lines,
        vatAccountId: 'vat',
        stampAccountId: 'stamp',
      } as unknown as BusinessInvoice;
      const lines = service['accountingLines'](invoice);
      expect(lines[0]).toMatchObject(
        type === BusinessInvoiceType.Purchase
          ? { debit: '0.000', credit: '38.941' }
          : { debit: '38.941', credit: '0.000' },
      );
      expect(
        lines.every(
          (line) =>
            toMillimes(line.debit) >= 0n && toMillimes(line.credit) >= 0n,
        ),
      ).toBe(true);
      const sum = (field: 'debit' | 'credit') =>
        lines.reduce((total, line) => total + toMillimes(line[field]), 0n);
      expect(sum('debit')).toBe(99254n);
      expect(sum('credit')).toBe(sum('debit'));
      const creditLines = service['accountingLines']({
        ...invoice,
        kind: BusinessInvoiceKind.CreditNote,
      });
      expect(creditLines).toEqual(
        lines.map((line) => ({
          ...line,
          debit: line.credit,
          credit: line.debit,
        })),
      );
    },
  );

  it('stores journal totals from the actual balanced posting lines', async () => {
    const input = dto();
    const result = await service['calculate']('organization', input);
    const invoice = {
      ...input,
      ...result.header,
      lines: result.lines,
      id: 'invoice',
      status: BusinessInvoiceStatus.Draft,
      vatAccountId: 'vat',
      stampAccountId: 'stamp',
    } as unknown as BusinessInvoice;
    const manager = {
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
      findOneOrFail: jest.fn().mockResolvedValue(invoice),
    };
    const transaction = jest.fn(
      (work: (value: typeof manager) => Promise<unknown>) => work(manager),
    );
    const instance = new BusinessInvoicesService(
      { transaction } as never,
      { findOne: jest.fn().mockResolvedValue(invoice) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getAccessibleEntity: jest.fn() } as never,
      {} as never,
      { assertDateOpen: jest.fn() } as never,
    );
    await instance.validate('organization', 'dossier', 'invoice', 'user');
    expect(manager.create.mock.calls[0][1]).toMatchObject({
      totalDebit: '99.254',
      totalCredit: '99.254',
    });
  });

  it('rejects negative invoice totals, zero quantities and excessive discounts', async () => {
    const negative = dto();
    negative.lines = [negative.lines[0]];
    await expect(
      service['calculate']('organization', negative),
    ).rejects.toThrow('avoir');
    const zero = dto();
    zero.lines[0].quantity = '0.000';
    await expect(service['calculate']('organization', zero)).rejects.toThrow(
      'quantité',
    );
    const discount = dto();
    discount.lines[0].discountRate = '1.10000';
    await expect(
      service['calculate']('organization', discount),
    ).rejects.toThrow('100 %');
  });
});
