import { BadRequestException } from '@nestjs/common';
import { parseRows } from './bank-file.parser';

describe('parseRows', () => {
  it('analyse les colonnes tunisiennes débit/crédit et les virgules', () => {
    const rows = parseRows([
      ['Date opération', 'Libellé', 'Référence', 'Débit', 'Crédit', 'Solde'],
      ['15/02/2026', 'Virement client', 'ENC-001', '', '500,000', '500,000'],
      ['16/02/2026', 'Frais bancaires', 'FB-01', '12,500', '', '487,500'],
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      transactionDate: '2026-02-15',
      amount: '500.000',
      balance: '500.000',
    });
    expect(rows[1].amount).toBe('-12.500');
    expect(rows[0].fingerprint).toHaveLength(64);
  });

  it('refuse les lignes invalides au lieu de les ignorer', () => {
    expect(() =>
      parseRows([
        ['Date', 'Description', 'Montant'],
        ['31/02/2026', 'Impossible', '10,000'],
      ]),
    ).toThrow(BadRequestException);
  });
});
