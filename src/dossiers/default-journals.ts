import { JournalType } from '../database/entities';

/**
 * Journaux créés automatiquement à l'ouverture d'un dossier.
 *
 * Sans au moins un journal de ventes et un journal d'achats, aucune facture
 * ne peut être enregistrée : le journal est obligatoire sur la facture. Les
 * créer d'office évite qu'un dossier neuf soit bloqué dès la première saisie.
 * Le comptable reste libre de les renommer, les désactiver ou en ajouter.
 */
export const DEFAULT_DOSSIER_JOURNALS: Array<{
  code: string;
  name: string;
  type: JournalType;
}> = [
  { code: 'VT', name: 'Journal des ventes', type: JournalType.Sales },
  { code: 'AC', name: 'Journal des achats', type: JournalType.Purchases },
  { code: 'BQ', name: 'Journal de banque', type: JournalType.Bank },
  { code: 'CA', name: 'Journal de caisse', type: JournalType.Cash },
  {
    code: 'OD',
    name: 'Opérations diverses',
    type: JournalType.Miscellaneous,
  },
  { code: 'PA', name: 'Journal de paie', type: JournalType.Payroll },
];
