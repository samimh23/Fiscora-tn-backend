import { BadRequestException } from '@nestjs/common';
import { parseMt940, parseRows } from './bank-file.parser';

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

describe('parseMt940', () => {
  it('analyse un relevé SWIFT MT940 avec débit et crédit', () => {
    const statement = [
      ':20:STARTUMSE',
      ':25:TN5904018104003691234567/TND',
      ':28C:1/1',
      ':60F:C260101TND10000,000',
      ':61:2601150115D500,000NTRFENC-001',
      ':86:Virement client Meditel',
      ':61:2601160116C12,500NCHGFB-01',
      ':86:Frais bancaires',
      ':62F:C260131TND9487,500',
    ].join('\r\n');

    const rows = parseMt940(statement);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      transactionDate: '2026-01-15',
      amount: '-500.000',
      description: 'Virement client Meditel',
      reference: 'ENC-001',
    });
    expect(rows[1]).toMatchObject({
      transactionDate: '2026-01-16',
      amount: '12.500',
      description: 'Frais bancaires',
    });
    expect(rows[0].fingerprint).toHaveLength(64);
  });

  it('rejette un relevé sans balise :61:', () => {
    expect(() => parseMt940(':20:STARTUMSE\r\n:25:ACC/TND\r\n')).toThrow(
      BadRequestException,
    );
  });
});
