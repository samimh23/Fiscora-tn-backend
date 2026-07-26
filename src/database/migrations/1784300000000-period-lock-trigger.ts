import { MigrationInterface, QueryRunner } from 'typeorm';

export class PeriodLockTrigger1784300000000 implements MigrationInterface {
  name = 'PeriodLockTrigger1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION accounting.reject_locked_period_entry()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF COALESCE(current_setting('app.allow_closed_period', true), 'off') <> 'on'
           AND EXISTS (
             SELECT 1
             FROM accounting.accounting_periods p
             WHERE p.organization_id = NEW.organization_id
               AND p.dossier_id = NEW.dossier_id
               AND p.period_year = EXTRACT(YEAR FROM NEW.entry_date)::integer
               AND p.period_month = EXTRACT(MONTH FROM NEW.entry_date)::integer
               AND p.status IN ('VERROUILLEE','CLOTUREE')
           )
        THEN
          RAISE EXCEPTION 'La période comptable % est verrouillée ou clôturée.',
            TO_CHAR(NEW.entry_date, 'MM/YYYY')
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER "TRG_reject_locked_period_entry"
      BEFORE INSERT OR UPDATE OF organization_id, dossier_id, entry_date, status
      ON accounting.journal_entries
      FOR EACH ROW EXECUTE FUNCTION accounting.reject_locked_period_entry();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_reject_locked_period_entry"
        ON accounting.journal_entries;
      DROP FUNCTION IF EXISTS accounting.reject_locked_period_entry();
    `);
  }
}
