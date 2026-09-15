import { MigrationInterface, QueryRunner } from 'typeorm';

// Hardens the audit trail: the application's own DB role can INSERT and
// SELECT audit_logs rows (every action logging path does exactly this,
// via repository.create()+save(), never update/delete), but loses the
// ability to UPDATE or DELETE them - even a bug or a compromised app
// credential can no longer alter or erase history. A trigger blocks the
// same for the table owner/superuser too, since REVOKE alone doesn't
// bind a superuser or the table owner.
//
// Retention: rows are kept indefinitely by default (no scheduled purge
// job exists). Tunisian commercial law requires accounting records be
// kept for a minimum retention period - if/when a purge policy is
// introduced, it must go through a superuser/migration path, never
// through the application role.
export class AuditLogImmutability1784376000000 implements MigrationInterface {
  name = 'AuditLogImmutability1784376000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        EXECUTE format(
          'REVOKE UPDATE, DELETE, TRUNCATE ON "accounting"."audit_logs" FROM %I',
          current_user
        );
      END
      $$;

      CREATE OR REPLACE FUNCTION accounting.prevent_audit_log_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is immutable: % is not permitted', TG_OP;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_audit_logs_immutable
        BEFORE UPDATE OR DELETE ON "accounting"."audit_logs"
        FOR EACH ROW EXECUTE FUNCTION accounting.prevent_audit_log_mutation();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON "accounting"."audit_logs";
      DROP FUNCTION IF EXISTS accounting.prevent_audit_log_mutation();
      DO $$
      BEGIN
        EXECUTE format(
          'GRANT UPDATE, DELETE, TRUNCATE ON "accounting"."audit_logs" TO %I',
          current_user
        );
      END
      $$;
    `);
  }
}
