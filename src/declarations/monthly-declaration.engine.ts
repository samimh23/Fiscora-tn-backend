export interface VatPosition {
  vatDue: bigint;
  vatCreditNext: bigint;
}

export function calculateVatPosition(
  collected: bigint,
  deductible: bigint,
  previousCredit: bigint,
): VatPosition {
  const balance = collected - deductible - previousCredit;
  return {
    vatDue: balance > 0n ? balance : 0n,
    vatCreditNext: balance < 0n ? -balance : 0n,
  };
}

export function calculateDeclarationTotal(values: {
  vatDue: bigint;
  withholdingTax: bigint;
  tfpDue: bigint;
  foprolosDue: bigint;
  tclDue: bigint;
  stampDuty: bigint;
}) {
  return (
    values.vatDue +
    values.withholdingTax +
    values.tfpDue +
    values.foprolosDue +
    values.tclDue +
    values.stampDuty
  );
}

export function previousPeriod(year: number, month: number) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}
