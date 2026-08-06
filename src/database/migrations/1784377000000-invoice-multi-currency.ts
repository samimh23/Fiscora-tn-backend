import { MigrationInterface, QueryRunner } from 'typeorm';

// Standard sales/purchase invoices can now be issued in a foreign currency
// (EUR/USD/GBP...): line amounts are stored converted to TND as before
// (the ledger is always TND), with currency_code/exchange_rate/
// foreign_gross_amount kept for display and audit of the original amount.
export class InvoiceMultiCurrency1784377000000 implements MigrationInterface {
  name = 'InvoiceMultiCurrency1784377000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."business_invoices"
        ADD COLUMN "currency_code" varchar(3) NOT NULL DEFAULT 'TND',
        ADD COLUMN "exchange_rate" numeric(18,8) NOT NULL DEFAULT 1,
        ADD COLUMN "foreign_gross_amount" numeric(18,3);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."business_invoices"
        DROP COLUMN IF EXISTS "currency_code",
        DROP COLUMN IF EXISTS "exchange_rate",
        DROP COLUMN IF EXISTS "foreign_gross_amount";
    `);
  }
}
