import { ConflictException } from '@nestjs/common';
import { toMillimes } from '../common/money';
import type { ApprovedExtractionForIndex } from './accounting-rag';

export interface InvoiceIdentity {
  number: string;
  invoice_date: string;
  kind: 'FACTURE' | 'AVOIR';
  type: 'ACHAT' | 'VENTE';
  third_party_name: string;
  third_party_tax_identifier: string | null;
  currency_code: string;
  gross_amount: string;
  source_document_id: string | null;
}

const text = (value: unknown) =>
  typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
    : '';
const identity = (value: unknown) =>
  text(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Z0-9]/g, '');
const currency = (value: unknown) => {
  const normalized = text(value);
  return ['DT', 'DNT', 'DINAR', 'DINARS', 'TND'].includes(normalized)
    ? 'TND'
    : normalized;
};
const amount = (value: unknown): bigint | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  try {
    return toMillimes(String(value).replace(',', '.'));
  } catch {
    return null;
  }
};
const date = (value: unknown) => {
  const normalized = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : '';
};

// Inputs must already be scoped to the same organization and dossier.
// Amount alone is never evidence that two sources describe the same invoice.
export function uniqueFinancialDocuments(
  documents: ApprovedExtractionForIndex[],
  invoices: InvoiceIdentity[],
): ApprovedExtractionForIndex[] {
  const linked = new Set(invoices.map((row) => row.source_document_id));
  const seen = new Set<string>();
  return documents.filter((document) => {
    if (seen.has(document.document_id)) return false;
    seen.add(document.document_id);
    if (linked.has(document.document_id)) return false;
    const data = document.normalized_data;
    const candidates = invoices.filter((invoice) => {
      if (
        !text(data.document_number) ||
        text(data.document_number) !== text(invoice.number)
      )
        return false;
      const partyValue =
        data[invoice.type === 'ACHAT' ? 'supplier' : 'customer'];
      const party =
        partyValue && typeof partyValue === 'object'
          ? (partyValue as Record<string, unknown>)
          : {};
      const invoiceTax = identity(invoice.third_party_tax_identifier);
      const documentTax = identity(party.tax_id);
      if (invoiceTax && documentTax) return invoiceTax === documentTax;
      const name = identity(party.name);
      return Boolean(name) && name === identity(invoice.third_party_name);
    });
    if (!candidates.length) return true;
    const matches = candidates.filter((invoice) => {
      const gross = amount(data.total_incl_tax);
      return (
        date(data.issue_date) !== '' &&
        date(data.issue_date) === date(invoice.invoice_date) &&
        currency(data.currency) !== '' &&
        currency(data.currency) === currency(invoice.currency_code) &&
        gross !== null &&
        gross === amount(invoice.gross_amount) &&
        text(data.document_type) ===
          (invoice.kind === 'AVOIR' ? 'CREDIT_NOTE' : 'INVOICE')
      );
    });
    if (candidates.length === 1 && matches.length === 1) return false;
    throw new ConflictException(
      `Le document « ${document.original_name} » et une facture métier portent le même numéro et le même tiers, mais leur correspondance est ambiguë. Vérifiez la date, la devise et les montants avant de calculer un total.`,
    );
  });
}
