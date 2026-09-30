import {
  invoiceSettlementStatus,
  paymentAllocationSign,
} from './invoice-balance';
import {
  BusinessInvoiceType,
  InvoiceSettlementStatus,
  PaymentDirection,
} from '../database/entities';

describe('Invoice credit balances', () => {
  it.each([
    [-25000n, 100000n, InvoiceSettlementStatus.RefundDue],
    [0n, 75000n, InvoiceSettlementStatus.Paid],
    [25000n, 0n, InvoiceSettlementStatus.Unpaid],
    [25000n, 75000n, InvoiceSettlementStatus.PartiallyPaid],
  ])(
    'classifies outstanding %s with paid %s',
    (outstanding, paid, expected) => {
      expect(invoiceSettlementStatus(outstanding, paid)).toBe(expected);
    },
  );
  it.each([
    [BusinessInvoiceType.Sale, PaymentDirection.Receipt, 1n],
    [BusinessInvoiceType.Sale, PaymentDirection.Disbursement, -1n],
    [BusinessInvoiceType.Purchase, PaymentDirection.Disbursement, 1n],
    [BusinessInvoiceType.Purchase, PaymentDirection.Receipt, -1n],
  ])(
    'keeps normal payments and refunds distinct (%s, %s)',
    (type, direction, expected) => {
      expect(paymentAllocationSign(type, direction)).toBe(expected);
    },
  );
});
