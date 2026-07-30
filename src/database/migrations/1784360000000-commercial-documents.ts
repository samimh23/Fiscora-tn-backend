import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialDocuments1784360000000 implements MigrationInterface {
  name = 'CommercialDocuments1784360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."commercial_documents" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "direction" varchar(20) NOT NULL,
        "kind" varchar(30) NOT NULL,
        "status" varchar(25) NOT NULL DEFAULT 'BROUILLON',
        "number" varchar(80) NOT NULL,
        "issue_date" date NOT NULL,
        "valid_until" date,
        "third_party_id" uuid NOT NULL,
        "currency_code" varchar(3) NOT NULL DEFAULT 'TND',
        "net_amount" numeric(15,3) NOT NULL,
        "vat_amount" numeric(15,3) NOT NULL,
        "gross_amount" numeric(15,3) NOT NULL,
        "source_document_id" uuid,
        "converted_to_document_id" uuid,
        "business_invoice_id" uuid,
        "notes" text,
        "created_by_user_id" uuid NOT NULL,
        "confirmed_by_user_id" uuid,
        "confirmed_at_utc" timestamptz,
        CONSTRAINT "UQ_commercial_document_number"
          UNIQUE ("dossier_id","direction","kind","number"),
        CONSTRAINT "CHK_commercial_document_direction"
          CHECK ("direction" IN ('ACHAT','VENTE')),
        CONSTRAINT "CHK_commercial_document_kind"
          CHECK ("kind" IN ('DEVIS','COMMANDE','BON_LIVRAISON','BON_RECEPTION')),
        CONSTRAINT "CHK_commercial_document_status"
          CHECK ("status" IN ('BROUILLON','CONFIRME','CONVERTI','ANNULE')),
        CONSTRAINT "FK_commercial_document_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_commercial_document_third_party" FOREIGN KEY ("third_party_id")
          REFERENCES "accounting"."third_parties"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_commercial_document_source" FOREIGN KEY ("source_document_id")
          REFERENCES "accounting"."commercial_documents"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_commercial_document_target" FOREIGN KEY ("converted_to_document_id")
          REFERENCES "accounting"."commercial_documents"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_commercial_document_period"
        ON "accounting"."commercial_documents" ("organization_id","dossier_id","issue_date","kind");
      CREATE INDEX "IDX_commercial_document_status"
        ON "accounting"."commercial_documents" ("organization_id","dossier_id","status");

      CREATE TABLE "accounting"."commercial_document_lines" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "account_id" uuid,
        "description" varchar(300) NOT NULL,
        "quantity" numeric(15,3) NOT NULL,
        "unit_price" numeric(15,3) NOT NULL,
        "discount_rate" numeric(8,5) NOT NULL,
        "vat_code" varchar(30),
        "vat_rate" numeric(8,5) NOT NULL,
        "net_amount" numeric(15,3) NOT NULL,
        "vat_amount" numeric(15,3) NOT NULL,
        "gross_amount" numeric(15,3) NOT NULL,
        CONSTRAINT "FK_commercial_document_line_document" FOREIGN KEY ("document_id")
          REFERENCES "accounting"."commercial_documents"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_commercial_document_line_account" FOREIGN KEY ("account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_commercial_document_lines"
        ON "accounting"."commercial_document_lines" ("organization_id","document_id");

      ALTER TABLE "accounting"."business_invoices"
        ADD COLUMN "source_commercial_document_id" uuid;
      ALTER TABLE "accounting"."business_invoices"
        ADD CONSTRAINT "FK_business_invoice_commercial_source"
        FOREIGN KEY ("source_commercial_document_id")
        REFERENCES "accounting"."commercial_documents"("id") ON DELETE SET NULL;
      CREATE UNIQUE INDEX "UQ_business_invoice_commercial_source"
        ON "accounting"."business_invoices" ("source_commercial_document_id")
        WHERE "source_commercial_document_id" IS NOT NULL;

      ALTER TABLE "accounting"."commercial_documents"
        ADD CONSTRAINT "FK_commercial_document_invoice"
        FOREIGN KEY ("business_invoice_id")
        REFERENCES "accounting"."business_invoices"("id") ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."commercial_documents"
        DROP CONSTRAINT IF EXISTS "FK_commercial_document_invoice";
      DROP INDEX IF EXISTS "accounting"."UQ_business_invoice_commercial_source";
      ALTER TABLE "accounting"."business_invoices"
        DROP CONSTRAINT IF EXISTS "FK_business_invoice_commercial_source";
      ALTER TABLE "accounting"."business_invoices"
        DROP COLUMN IF EXISTS "source_commercial_document_id";
      DROP TABLE IF EXISTS "accounting"."commercial_document_lines";
      DROP TABLE IF EXISTS "accounting"."commercial_documents";
    `);
  }
}
