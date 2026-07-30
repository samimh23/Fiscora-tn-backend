import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformAdminControls1784357000000 implements MigrationInterface {
  name = 'PlatformAdminControls1784357000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."organizations"
        ADD COLUMN "suspended_at_utc" timestamptz,
        ADD COLUMN "suspension_reason" text,
        ADD COLUMN "suspended_by_user_id" uuid;

      ALTER TABLE "accounting"."users"
        ADD COLUMN "disabled_at_utc" timestamptz,
        ADD COLUMN "disabled_reason" text,
        ADD COLUMN "disabled_by_user_id" uuid;

      CREATE INDEX "IDX_organizations_suspended"
        ON "accounting"."organizations" ("suspended_at_utc")
        WHERE "suspended_at_utc" IS NOT NULL;

      CREATE INDEX "IDX_users_disabled"
        ON "accounting"."users" ("disabled_at_utc")
        WHERE "disabled_at_utc" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_users_disabled";
      DROP INDEX IF EXISTS "accounting"."IDX_organizations_suspended";

      ALTER TABLE "accounting"."users"
        DROP COLUMN IF EXISTS "disabled_by_user_id",
        DROP COLUMN IF EXISTS "disabled_reason",
        DROP COLUMN IF EXISTS "disabled_at_utc";

      ALTER TABLE "accounting"."organizations"
        DROP COLUMN IF EXISTS "suspended_by_user_id",
        DROP COLUMN IF EXISTS "suspension_reason",
        DROP COLUMN IF EXISTS "suspended_at_utc";
    `);
  }
}
