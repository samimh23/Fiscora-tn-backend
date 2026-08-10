import { fromMillimes, toMillimes } from '../common/money';

/**
 * Classement des règlements candidats pour une opération bancaire.
 *
 * Isolé du service (et sans accès base) pour rester testable : c'est ce score
 * qui décide de ce que le comptable voit en face d'une ligne de relevé, une
 * erreur ici produit des rapprochements faux.
 */

export interface SuggestionTransaction {
  transactionDate: string;
  description: string;
  reference?: string | null;
  /** Signé : positif à l'encaissement, négatif au décaissement. */
  amount: string;
}

export interface SuggestionPayment {
  paymentDate: string;
  amount: string;
  reference?: string | null;
  thirdPartyName?: string | null;
}

export interface SuggestionScore {
  confidence: number;
  exactAmount: boolean;
  reasons: string[];
}

/** Au-delà de cet écart relatif, ce n'est plus le même règlement. */
const MAX_AMOUNT_GAP_RATIO = 50n; // 1/50 = 2 %

export function normalizeMatchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function daysBetween(left: string, right: string) {
  return Math.round(
    Math.abs((Date.parse(left) - Date.parse(right)) / 86400000),
  );
}

/**
 * Retourne `null` quand le règlement est trop éloigné pour être proposé.
 * Un montant différent n'est jamais présenté comme certain : score bas et
 * motif explicite, la décision reste humaine.
 */
export function scorePaymentSuggestion(
  transaction: SuggestionTransaction,
  payment: SuggestionPayment,
): SuggestionScore | null {
  const signed = toMillimes(transaction.amount);
  const absolute = signed < 0n ? -signed : signed;
  const paid = toMillimes(payment.amount);
  const exactAmount = paid === absolute;
  const gap = paid > absolute ? paid - absolute : absolute - paid;
  if (!exactAmount && gap * MAX_AMOUNT_GAP_RATIO > absolute) return null;

  const reasons: string[] = [];
  let score = exactAmount ? 70 : 30;
  reasons.push(
    exactAmount ? 'Montant identique' : `Écart de ${fromMillimes(gap)} TND`,
  );

  const days = daysBetween(transaction.transactionDate, payment.paymentDate);
  if (days === 0) {
    score += 20;
    reasons.push('Même date');
  } else {
    if (days <= 3) score += 12;
    else if (days <= 7) score += 6;
    reasons.push(`${days} j d’écart`);
  }

  const haystack = normalizeMatchText(
    `${transaction.reference || ''} ${transaction.description}`,
  );
  const reference = normalizeMatchText(payment.reference || '');
  const thirdParty = normalizeMatchText(payment.thirdPartyName || '');
  if (reference && haystack.includes(reference)) {
    score += 10;
    reasons.push('Référence retrouvée');
  } else if (thirdParty && haystack.includes(thirdParty)) {
    score += 8;
    reasons.push('Tiers retrouvé');
  }

  return { confidence: Math.min(100, score), exactAmount, reasons };
}
