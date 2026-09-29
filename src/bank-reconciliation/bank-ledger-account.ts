/**
 * A standard company bank account is posted to Tunisian chart account 532
 * (or one of its subdivisions, for example 5321 or 53201).
 */
export function isBankLedgerAccountCode(code: string) {
  const normalizedCode = code.trim().replace(/\s+/g, '').toUpperCase();
  return normalizedCode.startsWith('532');
}
