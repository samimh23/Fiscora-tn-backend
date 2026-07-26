import { fromMillimes, toMillimes } from '../common/money';
import { DepreciationMethod } from '../database/entities';

export interface DepreciationPlanInput {
  acquisitionCost: string;
  residualValue: string;
  serviceDate: string;
  accountingMethod: DepreciationMethod;
  usefulLifeMonths: number;
  accountingDecliningRate?: string | null;
  fiscalMethod: DepreciationMethod;
  fiscalUsefulLifeMonths: number;
  fiscalDecliningRate?: string | null;
  openingAccountingDepreciation?: string;
  openingFiscalDepreciation?: string;
}

export interface DepreciationPlanLine {
  periodYear: number;
  periodMonth: number;
  periodEnd: string;
  accountingAmount: string;
  fiscalAmount: string;
  temporaryDifference: string;
  accumulatedAccounting: string;
  accumulatedFiscal: string;
  netBookValue: string;
}

export function generateDepreciationPlan(
  input: DepreciationPlanInput,
): DepreciationPlanLine[] {
  const acquisition = toMillimes(input.acquisitionCost);
  const residual = toMillimes(input.residualValue);
  const base = acquisition - residual;
  const openingAccounting = toMillimes(
    input.openingAccountingDepreciation ?? '0.000',
  );
  const openingFiscal = toMillimes(input.openingFiscalDepreciation ?? '0.000');
  if (base <= 0n) throw new Error('La base amortissable doit être positive.');
  if (
    openingAccounting < 0n ||
    openingFiscal < 0n ||
    openingAccounting > base ||
    openingFiscal > base
  )
    throw new Error('Les amortissements antérieurs sont invalides.');
  validateMethod(
    input.accountingMethod,
    input.usefulLifeMonths,
    input.accountingDecliningRate,
  );
  validateMethod(
    input.fiscalMethod,
    input.fiscalUsefulLifeMonths,
    input.fiscalDecliningRate,
  );

  const accounting = calculateAmounts(
    base - openingAccounting,
    input.accountingMethod,
    input.usefulLifeMonths,
    input.accountingDecliningRate,
  );
  const fiscal = calculateAmounts(
    base - openingFiscal,
    input.fiscalMethod,
    input.fiscalUsefulLifeMonths,
    input.fiscalDecliningRate,
  );
  const count = Math.max(accounting.length, fiscal.length);
  let accumulatedAccounting = openingAccounting;
  let accumulatedFiscal = openingFiscal;
  const start = new Date(`${input.serviceDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()))
    throw new Error('Date de mise en service invalide.');

  return Array.from({ length: count }, (_, index) => {
    const accountingAmount = accounting[index] ?? 0n;
    const fiscalAmount = fiscal[index] ?? 0n;
    accumulatedAccounting += accountingAmount;
    accumulatedFiscal += fiscalAmount;
    const date = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index + 1, 0),
    );
    return {
      periodYear: date.getUTCFullYear(),
      periodMonth: date.getUTCMonth() + 1,
      periodEnd: date.toISOString().slice(0, 10),
      accountingAmount: fromMillimes(accountingAmount),
      fiscalAmount: fromMillimes(fiscalAmount),
      temporaryDifference: fromMillimes(accountingAmount - fiscalAmount),
      accumulatedAccounting: fromMillimes(accumulatedAccounting),
      accumulatedFiscal: fromMillimes(accumulatedFiscal),
      netBookValue: fromMillimes(acquisition - accumulatedAccounting),
    };
  });
}

function calculateAmounts(
  remainingBase: bigint,
  method: DepreciationMethod,
  months: number,
  decliningRate?: string | null,
) {
  const amounts: bigint[] = [];
  let remaining = remainingBase;
  const scaledRate = decliningRate ? rateToScaled(decliningRate) : null;
  for (let index = 0; index < months; index += 1) {
    const periodsLeft = BigInt(months - index);
    let amount: bigint;
    if (index === months - 1) amount = remaining;
    else if (method === DepreciationMethod.StraightLine)
      amount = remaining / periodsLeft;
    else amount = (remaining * scaledRate! + 600000n) / 1200000n;
    if (amount <= 0n && remaining > 0n) amount = 1n;
    if (amount > remaining) amount = remaining;
    amounts.push(amount);
    remaining -= amount;
  }
  return amounts;
}

function validateMethod(
  method: DepreciationMethod,
  months: number,
  rate?: string | null,
) {
  if (!Number.isInteger(months) || months <= 0 || months > 1200)
    throw new Error('La durée doit être comprise entre 1 et 1200 mois.');
  if (method === DepreciationMethod.DecliningBalance && !rate)
    throw new Error('Le taux dégressif est obligatoire.');
  if (rate) rateToScaled(rate);
}

function rateToScaled(rate: string) {
  if (!/^0(\.\d{1,5})?$|^1(\.0{1,5})?$/.test(rate))
    throw new Error('Le taux doit être compris entre 0 et 1.');
  const [whole, fraction = ''] = rate.split('.');
  const scaled = BigInt(whole) * 100000n + BigInt(fraction.padEnd(5, '0'));
  if (scaled <= 0n || scaled > 100000n)
    throw new Error('Le taux doit être compris entre 0 et 1.');
  return scaled;
}
