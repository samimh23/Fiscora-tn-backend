import { BookkeepingService } from './bookkeeping.service';
import type { DataSource } from 'typeorm';

describe('Auxiliary balance account scope', () => {
  it('limits the report to client/supplier accounts and includes posted reversals', async () => {
    const rows = [
      {
        thirdPartyName: 'Atlas',
        totalDebit: '2381.000',
        totalCredit: '1000.000',
        balance: '1381.000',
      },
      {
        thirdPartyName: 'Carthage',
        totalDebit: '2100.000',
        totalCredit: '2591.000',
        balance: '-491.000',
      },
      {
        thirdPartyName: 'Sahel',
        totalDebit: '65.200',
        totalCredit: '65.200',
        balance: '0.000',
      },
    ];
    const dataSource = { query: jest.fn().mockResolvedValue(rows) };
    const dossiers = { getAccessibleEntity: jest.fn().mockResolvedValue({}) };
    const service = new BookkeepingService(
      dataSource as unknown as DataSource,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dossiers as never,
      {} as never,
      {} as never,
    );
    expect(
      await service.agedBalance('org', 'dossier', 'user', {
        from: '2026-01-01',
        to: '2026-12-31',
      }),
    ).toEqual(rows);
    const [sql, params] = dataSource.query.mock.calls[0] as [string, string[]];
    expect(sql).toContain(
      'JOIN accounting.ledger_accounts a ON a.id=l.account_id',
    );
    expect(sql).toContain("a.code LIKE '401%' OR a.code LIKE '411%'");
    expect(sql).toContain('a.organization_id=$1 AND a.dossier_id=$2');
    expect(sql).toContain("e.status IN ('COMPTABILISEE','EXTOURNEE')");
    expect(params).toEqual(['org', 'dossier', '2026-01-01', '2026-12-31']);
    expect(dossiers.getAccessibleEntity).toHaveBeenCalledWith(
      'org',
      'dossier',
      'user',
    );
  });
});
