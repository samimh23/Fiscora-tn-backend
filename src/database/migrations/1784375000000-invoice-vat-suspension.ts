import { MigrationInterface, QueryRunner } from 'typeorm';

// Allows a purchase invoice to reference the dossier's own VAT suspension
// certificate (totalement exportatrice regime buying domestically without
// VAT), separate from the existing foreign-trade import usage.
export class InvoiceVatSuspension1784375000000 implements MigrationInterface {
  name = 'InvoiceVatSuspension1784375000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."business_invoices"
        ADD COLUMN "vat_suspension_certificate_id" uuid,
        ADD CONSTRAINT "FK_business_invoice_vat_suspension"
          FOREIGN KEY ("vat_suspension_certificate_id") REFERENCES "accounting"."vat_suspension_certificates"("id") ON DELETE SET NULL;
      CREATE INDEX "IDX_business_invoices_vat_suspension"
        ON "accounting"."business_invoices" ("vat_suspension_certificate_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_business_invoices_vat_suspension";
      ALTER TABLE "accounting"."business_invoices"
        DROP CONSTRAINT IF EXISTS "FK_business_invoice_vat_suspension",
        DROP COLUMN IF EXISTS "vat_suspension_certificate_id";
    `);
  }
}
