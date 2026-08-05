export function normalizeIdentifier(value: string | null | undefined) {
  return (value ?? '').replace(/[\s.\-_/]/g, '').toUpperCase();
}

export function isTunisianTaxIdentifier(value: string | null | undefined) {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return true;
  return /^\d{7,8}[A-Z]{2}\d{3}$/.test(normalized);
}

export function isRneNumber(value: string | null | undefined) {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return true;
  return /^[A-Z0-9]{5,25}$/.test(normalized);
}

export function isTunisianIbanOrRib(value: string | null | undefined) {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return true;
  return /^TN\d{22}$/.test(normalized) || /^\d{20}$/.test(normalized);
}
