import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserMfa1784389000000 implements MigrationInterface {
  name = 'UserMfa1784389000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."users"
        ADD COLUMN "mfa_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN "mfa_secret_encrypted" text,
        ADD COLUMN "mfa_pending_secret_encrypted" text,
        ADD COLUMN "mfa_recovery_code_hashes" jsonb,
        ADD COLUMN "mfa_last_accepted_step" bigint,
        ADD COLUMN "mfa_failed_attempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN "mfa_locked_until_utc" timestamptz,
        ADD COLUMN "mfa_enabled_at_utc" timestamptz;

      ALTER TABLE "accounting"."users"
        ADD CONSTRAINT "CHK_users_mfa_recovery_hashes_array"
        CHECK (
          "mfa_recovery_code_hashes" IS NULL
          OR jsonb_typeof("mfa_recovery_code_hashes") = 'array'
        );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."users"
        DROP CONSTRAINT IF EXISTS "CHK_users_mfa_recovery_hashes_array",
        DROP COLUMN IF EXISTS "mfa_enabled_at_utc",
        DROP COLUMN IF EXISTS "mfa_locked_until_utc",
        DROP COLUMN IF EXISTS "mfa_failed_attempts",
        DROP COLUMN IF EXISTS "mfa_last_accepted_step",
        DROP COLUMN IF EXISTS "mfa_recovery_code_hashes",
        DROP COLUMN IF EXISTS "mfa_pending_secret_encrypted",
        DROP COLUMN IF EXISTS "mfa_secret_encrypted",
        DROP COLUMN IF EXISTS "mfa_enabled";
    `);
  }
}
