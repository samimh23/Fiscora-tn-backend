import { MigrationInterface, QueryRunner } from 'typeorm';

// Droit de consommation (Tunisian excise duty): a per-line rate applied on
// top of the net amount and included in the VAT taxable base, matching the
// legal treatment of "droit de consommation" under Tunisian tax law.
export class ExciseTax1784372000000 implements MigrationInterface {
  name = 'ExciseTax1784372000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."business_invoices"
        ADD COLUMN "excise_account_id" uuid,
        ADD COLUMN "excise_amount" numeric(15,3) NOT NULL DEFAULT 0;
      ALTER TABLE "accounting"."business_invoices"
        ADD CONSTRAINT "FK_business_invoice_excise_account"
        FOREIGN KEY ("excise_account_id") REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT;

      ALTER TABLE "accounting"."business_invoice_lines"
        ADD COLUMN "excise_rate" numeric(8,5),
        ADD COLUMN "excise_amount" numeric(15,3) NOT NULL DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."business_invoice_lines"
        DROP COLUMN "excise_rate",
        DROP COLUMN "excise_amount";
      ALTER TABLE "accounting"."business_invoices"
        DROP CONSTRAINT "FK_business_invoice_excise_account",
        DROP COLUMN "excise_account_id",
        DROP COLUMN "excise_amount";
    `);
  }
}
