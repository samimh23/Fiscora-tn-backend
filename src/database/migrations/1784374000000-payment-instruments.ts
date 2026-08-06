import { MigrationInterface, QueryRunner } from 'typeorm';

// Chèque/traite portfolio tracking: layered on top of third_party_payments
// as an operational lifecycle (Reçu -> Déposé -> Encaissé/Impayé), separate
// from the accounting posting status.
export class PaymentInstruments1784374000000 implements MigrationInterface {
  name = 'PaymentInstruments1784374000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."third_party_payments"
        ADD COLUMN "instrument_number" varchar(60),
        ADD COLUMN "instrument_bank" varchar(150),
        ADD COLUMN "instrument_due_date" date,
        ADD COLUMN "instrument_status" varchar(20),
        ADD COLUMN "instrument_deposited_at_utc" timestamptz,
        ADD COLUMN "instrument_cleared_at_utc" timestamptz,
        ADD CONSTRAINT "CHK_payment_instrument_status" CHECK (
          "instrument_status" IS NULL OR "instrument_status" IN ('RECU','DEPOSE','ENCAISSE','IMPAYE')
        );
      CREATE INDEX "IDX_third_party_payments_instrument_status"
        ON "accounting"."third_party_payments" ("organization_id","dossier_id","instrument_status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_third_party_payments_instrument_status";
      ALTER TABLE "accounting"."third_party_payments"
        DROP CONSTRAINT IF EXISTS "CHK_payment_instrument_status",
        DROP COLUMN IF EXISTS "instrument_number",
        DROP COLUMN IF EXISTS "instrument_bank",
        DROP COLUMN IF EXISTS "instrument_due_date",
        DROP COLUMN IF EXISTS "instrument_status",
        DROP COLUMN IF EXISTS "instrument_deposited_at_utc",
        DROP COLUMN IF EXISTS "instrument_cleared_at_utc";
    `);
  }
}
