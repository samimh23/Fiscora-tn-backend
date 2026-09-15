import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CabinetPaymentCorrections1784380000000 implements MigrationInterface {
  name = 'CabinetPaymentCorrections1784380000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."cabinet_payments"
        ADD COLUMN "correction_type" varchar(30),
        ADD COLUMN "correction_date" date,
        ADD COLUMN "correction_reason" varchar(300),
        ADD COLUMN "corrected_at_utc" timestamptz,
        ADD COLUMN "corrected_by_user_id" uuid,
        ADD CONSTRAINT "CHK_cabinet_payment_correction" CHECK (
          ("correction_type" IS NULL AND "correction_date" IS NULL
            AND "correction_reason" IS NULL AND "corrected_at_utc" IS NULL
            AND "corrected_by_user_id" IS NULL)
          OR
          ("correction_type" IN ('ANNULATION_SAISIE','REMBOURSEMENT')
            AND "correction_date" IS NOT NULL
            AND "correction_reason" IS NOT NULL
            AND "corrected_at_utc" IS NOT NULL
            AND "corrected_by_user_id" IS NOT NULL)
        );

      CREATE INDEX "IDX_cabinet_payments_active"
        ON "accounting"."cabinet_payments" ("organization_id", "invoice_id")
        WHERE "correction_type" IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_cabinet_payments_active";
      ALTER TABLE "accounting"."cabinet_payments"
        DROP CONSTRAINT IF EXISTS "CHK_cabinet_payment_correction",
        DROP COLUMN IF EXISTS "corrected_by_user_id",
        DROP COLUMN IF EXISTS "corrected_at_utc",
        DROP COLUMN IF EXISTS "correction_reason",
        DROP COLUMN IF EXISTS "correction_date",
        DROP COLUMN IF EXISTS "correction_type";
    `);
  }
}
