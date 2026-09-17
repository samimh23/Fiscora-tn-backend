import {
  buildProductHelpContext,
  findProductHelp,
  isProductHelpQuestion,
  productHelpEntries,
} from './product-help';

describe('product help retrieval', () => {
  const allPermissions = new Set(
    productHelpEntries.flatMap((entry) =>
      entry.permission ? [entry.permission] : [],
    ),
  );

  it('retrieves the document workflow for an upload question', () => {
    const matches = findProductHelp(
      'Comment déposer une facture et la lire avec l’IA ?',
      '/documents',
      allPermissions,
    );
    expect(matches[0].entry.id).toBe('document-collection');
    expect(
      isProductHelpQuestion('Comment déposer une facture ?', matches),
    ).toBe(true);
  });

  it('uses the current route to resolve an ambiguous page question', () => {
    const matches = findProductHelp(
      'À quoi sert cette page et que dois-je faire ?',
      '/banque',
      allPermissions,
    );
    expect(matches[0].entry.id).toBe('banking');
  });

  it('explains account-free client document requests', () => {
    const matches = findProductHelp(
      'Comment demander une pièce à un client sans compte ?',
      '/documents',
      allPermissions,
    );
    expect(matches[0].entry.id).toBe('document-request-public-link');
  });

  it('never returns a page the member cannot access', () => {
    const matches = findProductHelp(
      'Comment inviter un collaborateur ?',
      '/equipe',
      new Set(['documents.view']),
    );
    expect(matches.some((match) => match.entry.id === 'team-access')).toBe(
      false,
    );
  });

  it('formats numbered, citable product sources', () => {
    const matches = findProductHelp(
      'Comment importer un relevé bancaire ?',
      '/banque',
      allPermissions,
    );
    expect(buildProductHelpContext(matches)).toContain('[S1] GUIDE_FISCORA');
    expect(buildProductHelpContext(matches)).toContain('Page: /banque');
  });

  it('keeps catalog identifiers and paths well formed', () => {
    expect(new Set(productHelpEntries.map((entry) => entry.id)).size).toBe(
      productHelpEntries.length,
    );
    expect(
      productHelpEntries.every((entry) => entry.path.startsWith('/')),
    ).toBe(true);
  });
});
