import { isEntityFollowUp, resolveFollowUp } from './conversation-follow-up';

const doc = '00000000-0000-4000-8000-000000000001';
const documentSource = {
  sourceId: doc,
  sourceName: 'Invoice scan.png',
  chunkId: doc,
  kind: 'DOCUMENT',
};
const invoiceSource = {
  sourceId: 'invoice-id',
  sourceName: 'Facture A-001',
  chunkId: 'live:invoice',
  kind: 'BUSINESS_INVOICE',
};

describe('conversation entity references', () => {
  it('resolves only the sources actually cited in the preceding answer', () => {
    const result = resolveFollowUp('And its VAT?', {
      question: 'Describe a document',
      answer: 'This document is an invoice [S1].',
      citations: [
        { ...documentSource, label: 'S1' },
        { ...documentSource, label: 'S2', sourceId: doc.replace(/1$/, '2') },
      ],
    });
    expect(result.sourceId).toBe(doc);
  });
  it('resolves an invoice pronoun using canonical citations even on a second follow-up', () => {
    expect(
      resolveFollowUp('And its remaining balance?', {
        question: 'And its VAT?',
        citations: [invoiceSource],
      }).question,
    ).toContain('facture A-001');
  });
  it('pins a document search to a single cited document, not to all dossier chunks', () => {
    const result = resolveFollowUp('What about its line items?', {
      question: 'Describe this scan',
      citations: [documentSource, documentSource],
    });
    expect(result.sourceId).toBe(doc);
    expect(result.question).toContain('Invoice scan.png');
  });
  it.each(['What about invoice B-002?', 'Et la facture 1 ?'])(
    'keeps explicit new references: %s',
    (question) => {
      expect(
        resolveFollowUp(question, {
          question: 'Facture A-001',
          citations: [invoiceSource],
        }),
      ).toEqual({ question });
    },
  );
  it('asks for clarification with no source, several documents, or several invoices', () => {
    for (const citations of [
      [],
      [documentSource, { ...documentSource, sourceId: doc.replace(/1$/, '2') }],
      [invoiceSource, { ...invoiceSource, sourceId: 'second' }],
    ]) {
      expect(
        resolveFollowUp('And its VAT?', {
          question: 'Facture A-001',
          citations,
        }).clarification,
      ).toBeTruthy();
    }
    expect(resolveFollowUp('Et son solde ?').clarification).toBeTruthy();
  });
  it('does not resolve unrelated standalone questions or payment source IDs as invoices', () => {
    expect(isEntityFollowUp('Describe invoice A-001')).toBe(false);
    expect(
      resolveFollowUp('And its balance?', {
        question: 'invoice A-001',
        citations: [{ ...invoiceSource, kind: 'PAYMENT' }],
      }).clarification,
    ).toBeTruthy();
  });
});
