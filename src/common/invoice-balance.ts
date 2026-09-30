import {
  BusinessInvoiceType,
  InvoiceSettlementStatus,
  PaymentDirection,
} from '../database/entities';

export function invoiceSettlementStatus(
  outstanding: bigint,
  paid: bigint,
): InvoiceSettlementStatus {
  if (outstanding < 0n) return InvoiceSettlementStatus.RefundDue;
  if (outstanding === 0n) return InvoiceSettlementStatus.Paid;
  return paid === 0n
    ? InvoiceSettlementStatus.Unpaid
    : InvoiceSettlementStatus.PartiallyPaid;
}

// A purchase refund is a receipt; a sale refund is a disbursement.
export function paymentAllocationSign(
  type: BusinessInvoiceType,
  direction: PaymentDirection,
): bigint {
  const normal =
    type === BusinessInvoiceType.Sale
      ? PaymentDirection.Receipt
      : PaymentDirection.Disbursement;
  return direction === normal ? 1n : -1n;
}
