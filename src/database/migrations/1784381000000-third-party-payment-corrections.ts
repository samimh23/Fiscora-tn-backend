import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ThirdPartyPaymentCorrections1784381000000 implements MigrationInterface {
  name = 'ThirdPartyPaymentCorrections1784381000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."third_party_payments"
        ADD COLUMN "correction_type" varchar(30),
        ADD COLUMN "correction_date" date,
        ADD COLUMN "correction_reason" varchar(300),
        ADD COLUMN "corrected_by_user_id" uuid,
        ADD COLUMN "corrected_at_utc" timestamptz,
        ADD COLUMN "reversal_journal_entry_id" uuid,
        ADD CONSTRAINT "CHK_third_party_payment_correction" CHECK (
          ("correction_type" IS NULL AND "correction_date" IS NULL
            AND "correction_reason" IS NULL AND "corrected_by_user_id" IS NULL
            AND "corrected_at_utc" IS NULL AND "reversal_journal_entry_id" IS NULL)
          OR
          ("correction_type" IN ('ANNULATION_SAISIE','REMBOURSEMENT')
            AND "correction_date" IS NOT NULL
            AND "correction_reason" IS NOT NULL
            AND "corrected_by_user_id" IS NOT NULL
            AND "corrected_at_utc" IS NOT NULL)
        ),
        ADD CONSTRAINT "FK_third_party_payment_reversal_entry"
          FOREIGN KEY ("reversal_journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE RESTRICT;

      CREATE INDEX "IDX_third_party_payment_corrections"
        ON "accounting"."third_party_payments"
          ("organization_id", "dossier_id", "correction_date")
        WHERE "correction_type" IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_third_party_payment_corrections";
      ALTER TABLE "accounting"."third_party_payments"
        DROP CONSTRAINT IF EXISTS "FK_third_party_payment_reversal_entry",
        DROP CONSTRAINT IF EXISTS "CHK_third_party_payment_correction",
        DROP COLUMN IF EXISTS "reversal_journal_entry_id",
        DROP COLUMN IF EXISTS "corrected_at_utc",
        DROP COLUMN IF EXISTS "corrected_by_user_id",
        DROP COLUMN IF EXISTS "correction_reason",
        DROP COLUMN IF EXISTS "correction_date",
        DROP COLUMN IF EXISTS "correction_type";
    `);
  }
}
