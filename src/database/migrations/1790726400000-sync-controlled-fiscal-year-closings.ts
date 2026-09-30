import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncControlledFiscalYearClosings1790726400000 implements MigrationInterface {
  name = 'SyncControlledFiscalYearClosings1790726400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Repair only years with an authoritative controlled closure record.
    // Legacy status-only closures are not reopened automatically.
    await queryRunner.query(`
      UPDATE accounting.fiscal_years AS fiscal
      SET status = 'Closed', closed_at_utc = closing.closed_at_utc,
          closed_by_user_id = closing.closed_by_user_id
      FROM accounting.accounting_year_closings AS closing
      WHERE closing.organization_id = fiscal.organization_id
        AND closing.dossier_id = fiscal.dossier_id
        AND closing.starts_on = fiscal.starts_on
        AND closing.ends_on = fiscal.ends_on
        AND closing.status = 'CLOTUREE'
        AND fiscal.status = 'Open'
    `);
  }

  async down(): Promise<void> {
    // Data repair is intentionally irreversible: a rollback must not reopen
    // an accounting year that has already been properly closed.
  }
}
