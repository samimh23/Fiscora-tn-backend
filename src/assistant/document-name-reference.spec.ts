import {
  findNamedDocuments,
  mayNameADocument,
} from './document-name-reference';

const documents = [
  { id: 'd2', original_name: 'test2.jpg' },
  { id: 'd5', original_name: 'test5.png' },
  { id: 'd10', original_name: 'test10.png' },
  { id: 'dm', original_name: 'Facture MYTEK mars.pdf' },
  { id: 'da', original_name: 'achat-2026-01-ttel-1920.pdf' },
];

const ids = (question: string) =>
  findNamedDocuments(question, documents).matches.map((item) => item.id);

describe('findNamedDocuments', () => {
  it.each([
    ['how much vat for test 5', ['d5']],
    ['TVA de test5.png ?', ['d5']],
    ['total of TEST_2', ['d2']],
    ['date de test 10', ['d10']],
    ['montant de facture mytek mars.pdf', ['dm']],
    ['fournisseur de achat 2026 01 ttel 1920', ['da']],
  ])('finds "%s"', (question, expected) => {
    expect(ids(question)).toEqual(expected);
  });

  it('does not confuse test1 with test10 or read plain words as names', () => {
    expect(ids('how much vat for test 1')).toEqual([]);
    expect(ids('Quelle est la TVA de la facture ?')).toEqual([]);
    expect(ids('ventes de 2026')).toEqual([]);
  });

  it('reports a file name that matches nothing', () => {
    expect(
      findNamedDocuments('how much vat for test 1', documents).missing,
    ).toBe('test 1');
    expect(findNamedDocuments('TVA de scan9.pdf', documents).missing).toBe(
      'scan9.pdf',
    );
    expect(
      findNamedDocuments('TVA de la facture 2026', documents).missing,
    ).toBeNull();
  });
});

describe('mayNameADocument', () => {
  it.each([
    ['how much vat for test 1', true],
    ['TVA de scan5', true],
    ['facture mytek.pdf ?', true],
    ['Quel est le total TTC pour 2026 ?', false],
    ['Quel est le total TTC du document FV-2026-013 ?', false],
    ['Facture 25043855', false],
  ])('"%s" → %s', (question, expected) => {
    expect(mayNameADocument(question)).toBe(expected);
  });
});
