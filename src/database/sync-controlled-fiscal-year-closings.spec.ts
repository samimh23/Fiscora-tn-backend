import type { QueryRunner } from 'typeorm';
import { SyncControlledFiscalYearClosings1790726400000 } from './migrations/1790726400000-sync-controlled-fiscal-year-closings';

describe('Controlled fiscal-year closure repair', () => {
  it('repairs only open years matching an authoritative closure in the same dossier', async () => {
    const query = jest.fn<Promise<void>, [string]>().mockResolvedValue();
    const migration = new SyncControlledFiscalYearClosings1790726400000();
    await migration.up({ query } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    for (const condition of [
      'closing.organization_id = fiscal.organization_id',
      'closing.dossier_id = fiscal.dossier_id',
      'closing.starts_on = fiscal.starts_on',
      'closing.ends_on = fiscal.ends_on',
      "closing.status = 'CLOTUREE'",
      "fiscal.status = 'Open'",
    ]) {
      expect(sql).toContain(condition);
    }
    expect(sql).toContain("SET status = 'Closed'");
    expect(sql).toContain('closed_at_utc = closing.closed_at_utc');
    expect(sql).toContain('closed_by_user_id = closing.closed_by_user_id');
    expect(sql).not.toContain('DELETE');
  });

  it('does not reopen properly closed years on rollback', async () => {
    const migration = new SyncControlledFiscalYearClosings1790726400000();
    await expect(migration.down()).resolves.toBeUndefined();
  });
});
