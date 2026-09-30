import {
  uniqueFinancialDocuments,
  type InvoiceIdentity,
} from './financial-source-deduplication';
import type { ApprovedExtractionForIndex } from './accounting-rag';

describe('Financial source identity', () => {
  const invoice: InvoiceIdentity = {
    number: 'INV-001',
    invoice_date: '2026-09-01',
    kind: 'FACTURE',
    type: 'ACHAT',
    third_party_name: 'Supplier SARL',
    third_party_tax_identifier: '123/A',
    currency_code: 'TND',
    gross_amount: '119.000',
    source_document_id: null,
  };
  const document = (
    data: Record<string, unknown> = {},
  ): ApprovedExtractionForIndex => ({
    document_id: 'pdf',
    original_name: 'invoice.pdf',
    category: null,
    period_year: 2026,
    period_month: 9,
    normalized_data: {
      document_type: 'invoice',
      document_number: 'INV-001',
      supplier: { name: 'Supplier SARL', tax_id: '123/A' },
      issue_date: '01/09/2026',
      currency: 'DT',
      total_incl_tax: '119,000',
      ...data,
    },
  });
  it('counts an unlinked PDF and a matching manual invoice only once', () => {
    expect(uniqueFinancialDocuments([document()], [invoice])).toEqual([]);
  });
  it.each([
    'MF 9000931/A/M/000',
    'MF:9000931/A/M/000',
    'M.F. : 9000931/A/M/000',
    'Matricule fiscal - 9000931/A/M/000',
  ])('ignores a delimited OCR tax-ID label: %s', (taxId) => {
    const manual = {
      ...invoice,
      number: 'AUD-S-001',
      gross_amount: '108.000',
      third_party_tax_identifier: '9000931/A/M/000',
    };
    const pdf = document({
      document_number: 'AUD-S-001',
      total_incl_tax: '108.000',
      supplier: { name: 'Supplier SARL', tax_id: taxId },
    });
    expect(uniqueFinancialDocuments([pdf], [manual])).toEqual([]);
  });
  it('normalizes tax-ID labels on either source', () => {
    expect(
      uniqueFinancialDocuments(
        [document()],
        [{ ...invoice, third_party_tax_identifier: 'MF 123/A' }],
      ),
    ).toEqual([]);
  });
  it.each(['MF123/A', 'MF 999/B', 'OTHER 123/A'])(
    'preserves genuine or conflicting tax IDs despite equal names: %s',
    (taxId) => {
      expect(
        uniqueFinancialDocuments(
          [document({ supplier: { name: 'Supplier SARL', tax_id: taxId } })],
          [invoice],
        ),
      ).toHaveLength(1);
    },
  );
  it('still rejects amount conflicts after removing a tax-ID label', () => {
    expect(() =>
      uniqueFinancialDocuments(
        [
          document({
            supplier: { name: 'Supplier SARL', tax_id: 'MF 123/A' },
            total_incl_tax: '120.000',
          }),
        ],
        [invoice],
      ),
    ).toThrow('ambiguë');
  });
  it('prefers an explicit document link and removes repeated extraction jobs', () => {
    expect(
      uniqueFinancialDocuments(
        [document(), document()],
        [{ ...invoice, source_document_id: 'pdf' }],
      ),
    ).toEqual([]);
    expect(uniqueFinancialDocuments([document(), document()], [])).toHaveLength(
      1,
    );
  });
  it('never merges amount-only matches or different suppliers', () => {
    expect(
      uniqueFinancialDocuments(
        [document({ document_number: 'INV-002' })],
        [invoice],
      ),
    ).toHaveLength(1);
    expect(
      uniqueFinancialDocuments(
        [document({ supplier: { name: 'Supplier SARL', tax_id: '999/B' } })],
        [invoice],
      ),
    ).toHaveLength(1);
  });
  it.each([
    { total_incl_tax: '120.000' },
    { issue_date: '2026-09-02' },
    { currency: 'EUR' },
  ])(
    'refuses an exact aggregate for conflicting duplicate identities: %j',
    (data) => {
      expect(() =>
        uniqueFinancialDocuments([document(data)], [invoice]),
      ).toThrow('ambiguë');
    },
  );
  it('refuses multiple possible business matches', () => {
    expect(() =>
      uniqueFinancialDocuments([document()], [invoice, invoice]),
    ).toThrow('ambiguë');
  });
  it('matches sales against the customer, not the supplier', () => {
    const sale = { ...invoice, type: 'VENTE' as const };
    expect(uniqueFinancialDocuments([document()], [sale])).toHaveLength(1);
    expect(
      uniqueFinancialDocuments(
        [document({ customer: { name: 'Supplier SARL', tax_id: '123/A' } })],
        [sale],
      ),
    ).toEqual([]);
  });
});
