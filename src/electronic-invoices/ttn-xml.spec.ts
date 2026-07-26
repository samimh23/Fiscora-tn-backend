import { buildNeutralTtnPayload, escapeXml, sha256 } from './ttn-xml';

describe('TTN neutral payload', () => {
  it('Ã©chappe les valeurs XML', () => {
    expect(escapeXml('A & B <C>')).toBe('A &amp; B &lt;C&gt;');
  });

  it('produit un hash SHA-256 stable', () => {
    expect(sha256('facture')).toHaveLength(64);
    expect(sha256('facture')).toBe(sha256('facture'));
  });

  it('gÃ©nÃ¨re une enveloppe neutre clairement non officielle', () => {
    const xml = buildNeutralTtnPayload(
      { legalName: 'SociÃ©tÃ© & Co', taxIdentifier: '123' } as never,
      {
        number: 'FV-1',
        invoiceDate: '2026-07-20',
        kind: 'FACTURE',
        thirdPartyName: 'Client <Test>',
        thirdPartyTaxIdentifier: '456',
        thirdParty: { address: 'Tunis' },
        netAmount: '100.000',
        vatAmount: '19.000',
        stampDuty: '1.000',
        grossAmount: '120.000',
        withholdingAmount: '0.000',
        netPayable: '120.000',
        lines: [{
          description: 'Service & support',
          quantity: '1.000',
          unitPrice: '100.000',
          netAmount: '100.000',
          vatRate: '19.00000',
          vatAmount: '19.000',
        }],
      } as never,
      'COMPTA-TN-ADAPTER-1.0',
    );
    expect(xml).toContain('ADAPTATEUR_INTERNE_NON_OFFICIEL');
    expect(xml).toContain('SociÃ©tÃ© &amp; Co');
    expect(xml).toContain('Service &amp; support');
  });
});
