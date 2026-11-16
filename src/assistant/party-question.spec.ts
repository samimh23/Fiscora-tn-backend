import type { ApprovedExtractionForIndex } from './accounting-rag';
import {
  answerListing,
  detectListingQuestion,
  type ListingQuestion,
  partyKey,
} from './party-question';
import { NO_FILTERS } from './query-filters';
import { isProductHelpQuestion } from './product-help';

const row = (
  id: string,
  category: string,
  supplier: string,
  customer = 'Cabinet SARL',
  issueDate = '2026-01-10',
): ApprovedExtractionForIndex => ({
  document_id: id,
  original_name: `${id}.pdf`,
  category,
  period_year: 2026,
  period_month: Number(issueDate.slice(5, 7)),
  normalized_data: {
    document_number: id.toUpperCase(),
    issue_date: issueDate,
    total_incl_tax: '119.000',
    supplier: { name: supplier },
    customer: { name: customer },
  },
});

const parties = (
  party: 'SUPPLIER' | 'CUSTOMER',
  filters = NO_FILTERS,
): ListingQuestion => ({ kind: 'PARTIES', party, operation: 'COUNT', filters });

describe('detectListingQuestion', () => {
  it.each([
    ['how many suplier we have', 'PARTIES', 'SUPPLIER', 'COUNT'],
    ['Combien de fournisseurs avons-nous ?', 'PARTIES', 'SUPPLIER', 'COUNT'],
    ['Liste des clients du dossier', 'PARTIES', 'CUSTOMER', 'LIST'],
    ['Quels sont nos fourniseurs ?', 'PARTIES', 'SUPPLIER', 'LIST'],
    [
      'Quelles ventes ont été émises en janvier 2026 et à quels clients ?',
      'DOCUMENTS',
      'CUSTOMER',
      'LIST',
    ],
    [
      'Liste les documents d’achat de janvier 2026 avec leur numéro.',
      'DOCUMENTS',
      null,
      'LIST',
    ],
  ])('reads "%s"', (question, kind, party, operation) => {
    expect(detectListingQuestion(question)).toMatchObject({
      kind,
      party,
      operation,
    });
  });

  it.each([
    'How much do we owe our suppliers?',
    'Quel est le solde du fournisseur MYTEK ?',
    'who is the supplier',
    'Combien de clients et de fournisseurs ?',
    'Liste les documents',
    'Combien de factures en mars 2026 ?',
  ])('leaves "%s" to the other tools', (question) => {
    expect(detectListingQuestion(question)).toBeNull();
  });
});

describe('answerListing', () => {
  it('counts distinct suppliers from purchases only, merging spellings', () => {
    const result = answerListing(
      [
        row('a', 'FACTURES_ACHATS', 'Tunisianet SARL'),
        row('b', 'FACTURES_ACHATS', 'TUNISIANET S.A.R.L.'),
        row('c', 'FACTURES_ACHATS', 'Garage Hamdi'),
        row('d', 'FACTURES_VENTES', 'Notre Société', 'Hôtel Bel Azur'),
      ],
      parties('SUPPLIER'),
    );
    expect(result?.answer).toContain('2 fournisseurs distincts');
    expect(result?.answer).toContain('Tunisianet SARL : 2 pièces [S1]');
    expect(result?.answer).not.toContain('Notre Société');
    expect(result?.rows.map((item) => item.document_id)).toEqual(['a', 'c']);
  });

  it('limits parties to the period asked', () => {
    const result = answerListing(
      [
        row('a', 'FACTURES_VENTES', 'Nous', 'Hôtel Bel Azur', '2026-01-10'),
        row('b', 'FACTURES_VENTES', 'Nous', 'Pharmacie Ennour', '2026-02-10'),
      ],
      parties('CUSTOMER', { year: 2026, month: 1, category: null }),
    );
    expect(result?.answer).toContain('en janvier 2026');
    expect(result?.answer).toContain('Hôtel Bel Azur');
    expect(result?.answer).not.toContain('Pharmacie Ennour');
  });

  it('lists the documents of a month with number, party, date and total', () => {
    const result = answerListing(
      [
        row('fa-2', 'FACTURES_ACHATS', 'Garage Hamdi', 'Nous', '2026-01-20'),
        row('fa-1', 'FACTURES_ACHATS', 'Tunisianet', 'Nous', '2026-01-05'),
        row('fa-3', 'FACTURES_ACHATS', 'Tunisianet', 'Nous', '2026-02-05'),
        row('fv-1', 'FACTURES_VENTES', 'Nous', 'Hôtel', '2026-01-07'),
      ],
      {
        kind: 'DOCUMENTS',
        party: null,
        operation: 'LIST',
        filters: { year: 2026, month: 1, category: 'FACTURES_ACHATS' },
      },
    );
    expect(result?.answer.split('\n')).toEqual([
      '2 pièce(s) d’achat validée(s) en janvier 2026 :',
      '- FA-1 — Tunisianet — 2026-01-05 — 119.000 TND TTC [S1]',
      '- FA-2 — Garage Hamdi — 2026-01-20 — 119.000 TND TTC [S2]',
    ]);
  });

  it('returns nothing when no document qualifies', () => {
    expect(answerListing([], parties('SUPPLIER'))).toBeNull();
  });

  it('ignores legal forms and punctuation in the party key', () => {
    expect(partyKey('Sté TUNISIANET S.A.R.L.')).toBe(partyKey('Tunisianet'));
  });
});

describe('product help routing', () => {
  const weakMatch = [{ score: 3 }] as never;
  it('sends "how many" questions to the data, not to the guide', () => {
    expect(isProductHelpQuestion('how many suplier we have', weakMatch)).toBe(
      false,
    );
    expect(isProductHelpQuestion('how do I upload a document', weakMatch)).toBe(
      true,
    );
  });

  it('keeps dossier data questions out of the guides when a dossier is open', () => {
    const strongMatch = [{ score: 12 }] as never;
    const open = { dossierSelected: true };
    expect(
      isProductHelpQuestion(
        'Quelle est la date d’émission du document TTEL-2026-01-1920 ?',
        strongMatch,
        open,
      ),
    ).toBe(false);
    expect(
      isProductHelpQuestion(
        'Quel est le total TTC du document',
        strongMatch,
        open,
      ),
    ).toBe(false);
    expect(
      isProductHelpQuestion('Comment déposer une facture ?', strongMatch, open),
    ).toBe(true);
    expect(
      isProductHelpQuestion(
        'À quoi sert cette page et que dois-je faire ?',
        strongMatch,
        open,
      ),
    ).toBe(true);
  });
});
