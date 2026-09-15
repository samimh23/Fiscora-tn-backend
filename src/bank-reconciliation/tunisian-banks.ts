/**
 * Établissements bancaires agréés en Tunisie.
 *
 * Source : « Liste des banques adhérentes au titre de l'année 2025 », Fonds de
 * Garantie des Dépôts Bancaires (fgdb.gov.tn). Les dénominations sociales sont
 * reprises telles qu'elles y figurent ; `name` retient l'appellation courante,
 * celle que le comptable tape réellement.
 *
 * `bankCode` (code établissement BCT, présent dans l'IBAN) est volontairement
 * absent : il n'a pas été renseigné faute de source officielle vérifiée. Le
 * remplir permettra plus tard de déduire la banque depuis l'IBAN.
 */
export const TUNISIAN_BANKS: Array<{ name: string; legalName: string }> = [
  { name: 'Al Baraka Bank', legalName: 'Al Baraka Bank Tunisia' },
  {
    name: 'Alubaf',
    legalName: 'Alubaf International Bank - Tunis',
  },
  { name: 'Amen Bank', legalName: 'Amen Bank' },
  { name: 'ATB', legalName: 'Arab Tunisian Bank' },
  { name: 'Attijari Bank', legalName: 'Banque Attijari de Tunisie' },
  { name: 'Bank ABC Tunisie', legalName: 'Arab Banking Corporation Tunis' },
  {
    name: 'BFPME',
    legalName: 'Banque de Financement des Petites et Moyennes Entreprises',
  },
  { name: 'BH Bank', legalName: 'BH Bank' },
  { name: 'BIAT', legalName: 'Banque Internationale Arabe de Tunisie' },
  { name: 'BNA', legalName: 'Banque Nationale Agricole' },
  { name: 'BT', legalName: 'Banque de Tunisie' },
  { name: 'BTE', legalName: 'Banque de Tunisie et des Emirats' },
  { name: 'BTK', legalName: 'Banque Tuniso-Koweitienne' },
  { name: 'BTL', legalName: 'Banque Tuniso-Libyenne' },
  { name: 'BTS Bank', legalName: 'Banque Tunisienne de Solidarité' },
  { name: 'Citi Bank', legalName: 'Citi Bank N.A. Tunis' },
  { name: 'NAIB', legalName: 'North Africa International Bank' },
  { name: 'QNB', legalName: 'Qatar National Bank - Tunisia' },
  { name: 'STB', legalName: 'Société Tunisienne de Banque' },
  { name: 'TFBank', legalName: 'Tunisian Foreign Bank - TFBank' },
  { name: 'TIB', legalName: 'Tunis International Bank' },
  { name: 'TSB', legalName: 'Tunisian Saudi Bank' },
  {
    name: 'UBCI',
    legalName: "Union Bancaire pour le Commerce et l'Industrie",
  },
  { name: 'UIB', legalName: 'Union Internationale de Banques' },
  { name: 'Wifak Bank', legalName: 'Wifak International Bank' },
  { name: 'Banque Zitouna', legalName: 'Banque Zitouna' },
];
