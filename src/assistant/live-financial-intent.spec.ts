import {
  isLiveFinancialFollowUp,
  assertRouteReferencesQuestion,
  isLiveFinancialCandidate,
  parseLiveFinancialIntent,
} from './live-financial-intent';

const route = {
  operation: 'BALANCES',
  partyName: 'MYTEK',
  partyType: 'SUPPLIER',
  invoiceNumber: null,
  paymentReference: null,
  year: null,
  unsupportedPeriod: false,
};

describe('live financial routing boundaries', () => {
  it.each([
    'how much do we owe MYTEK?',
    'Combien nous doit ABC ?',
    'What is the finances for 2026?',
    'Explique les paiements de la facture A-001',
    'Quel est le résultat net 2026 ?',
    'Quel est le résumé financier pour 2026 ?',
    'Combien je dois à MYTEK ?',
    'Show invoice A-001',
  ])('recognizes a live-data candidate: %s', (question) => {
    expect(isLiveFinancialCandidate(question)).toBe(true);
  });
  it('recognizes a short explicit clarification reply', () => {
    expect(isLiveFinancialFollowUp('2026')).toBe(true);
    expect(isLiveFinancialFollowUp('INV-001')).toBe(true);
    expect(isLiveFinancialFollowUp('What are my finances?')).toBe(false);
  });
  it.each([
    'How to pay an invoice?',
    'Comment enregistrer un règlement ?',
    'Quel est le total TTC pour septembre 2026 ?',
    'Comment créer une facture ?',
  ])('preserves guides/calculator: %s', (question) => {
    expect(isLiveFinancialCandidate(question)).toBe(false);
  });
  it('accepts only explicitly declared read-only operations', () => {
    expect(parseLiveFinancialIntent(route)).toEqual(route);
    expect(() =>
      parseLiveFinancialIntent({ ...route, operation: 'EXECUTE_SQL' }),
    ).toThrow();
    expect(() =>
      parseLiveFinancialIntent({ ...route, operation: 'POST_PAYMENT' }),
    ).toThrow();
  });
  it.each([
    { year: '2026' },
    { year: 1990 },
    { year: 2026.5 },
    { partyType: 'ADMIN' },
    { partyName: '' },
    { unsupportedPeriod: 'false' },
    { invoiceNumber: 'x'.repeat(81) },
  ])('rejects invalid model filters: %j', (change) => {
    expect(() => parseLiveFinancialIntent({ ...route, ...change })).toThrow();
  });
  it('rejects invented parties, invoice numbers, payment references and years', () => {
    const valid = parseLiveFinancialIntent(route);
    expect(() =>
      assertRouteReferencesQuestion(valid, 'How much do we owe MYTEK?'),
    ).not.toThrow();
    expect(() =>
      assertRouteReferencesQuestion(valid, 'How much do we owe ABC?'),
    ).toThrow();
    expect(() =>
      assertRouteReferencesQuestion(
        { ...valid, partyName: null, invoiceNumber: 'INV-1' },
        'show my invoice',
      ),
    ).toThrow();
    expect(() =>
      assertRouteReferencesQuestion(
        { ...valid, partyName: null, paymentReference: 'VIR-1' },
        'show payment',
      ),
    ).toThrow();
    expect(() =>
      assertRouteReferencesQuestion(
        { ...valid, partyName: null, year: 2026 },
        'financial summary',
      ),
    ).toThrow();
  });
});
