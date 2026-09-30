import type { QueryRunner } from 'typeorm';
import { WorkflowIntegrity1790784000000 } from './migrations/1790784000000-workflow-integrity';

describe('Workflow integrity migration', () => {
  it('preserves tax identity and scopes the draft-entry repair to its payment', async () => {
    const query = jest.fn((sql: string) => Promise.resolve(sql));
    await new WorkflowIntegrity1790784000000().up({
      query,
    } as unknown as QueryRunner);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('fodec_account_id');
    expect(sql).toContain('fodec_rate');
    expect(sql).toContain('A_REMBOURSER');
    expect(sql).toContain('payment.organization_id = entry.organization_id');
    expect(sql).toContain('payment.dossier_id = entry.dossier_id');
    expect(sql).toContain(
      "payment.status = 'ANNULE' AND entry.status = 'BROUILLON'",
    );
  });
  it('refuses to silently erase financial tax and refund data on rollback', async () => {
    await expect(new WorkflowIntegrity1790784000000().down()).rejects.toThrow(
      'migration corrective',
    );
  });
});
