import { BillingFrequency, ClientDossier } from '../database/entities';
import { divideRounded, toMillimes } from '../common/money';

/** Current agreed fees, not invoices or receipts. Partial months are prorated. */
export function estimateContractFee(
  dossier: Pick<ClientDossier, 'billingFrequency' | 'monthlyFee' | 'annualFee'>,
  from: string,
  to: string,
): bigint | null {
  const annual = dossier.billingFrequency === BillingFrequency.Annual;
  if (!annual && dossier.billingFrequency !== BillingFrequency.Monthly)
    return null;
  const fee = annual ? dossier.annualFee : dossier.monthlyFee;
  if (fee === null || fee === undefined || fee === '') return null;
  const amount = toMillimes(fee);
  let numerator = 0n;
  let denominator = 1n;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (
    let month = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    month <= end;
    month = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
    )
  ) {
    const next = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
    );
    const segmentFrom = Math.max(start.getTime(), month.getTime());
    const segmentTo = Math.min(end.getTime() + 86_400_000, next.getTime());
    const days = BigInt(Math.round((segmentTo - segmentFrom) / 86_400_000));
    const monthDays = BigInt(
      Math.round((next.getTime() - month.getTime()) / 86_400_000),
    );
    const segmentDenominator = monthDays * (annual ? 12n : 1n);
    numerator = numerator * segmentDenominator + amount * days * denominator;
    denominator *= segmentDenominator;
  }
  return divideRounded(numerator, denominator);
}
