import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class BusinessInvoices1784250000000 implements MigrationInterface {
  name = 'BusinessInvoices1784250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."business_invoices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "number" varchar(80) NOT NULL,
        "invoice_date" date NOT NULL,
        "due_date" date,
        "third_party_name" varchar(200) NOT NULL,
        "third_party_tax_identifier" varchar(100),
        "journal_id" uuid NOT NULL,
        "third_party_account_id" uuid NOT NULL,
        "vat_account_id" uuid,
        "stamp_account_id" uuid,
        "withholding_account_id" uuid,
        "net_amount" numeric(15,3) NOT NULL,
        "vat_amount" numeric(15,3) NOT NULL,
        "stamp_duty" numeric(15,3) NOT NULL,
        "withholding_base" numeric(15,3) NOT NULL,
        "withholding_rate" numeric(8,5),
        "withholding_amount" numeric(15,3) NOT NULL,
        "gross_amount" numeric(15,3) NOT NULL,
        "net_payable" numeric(15,3) NOT NULL,
        "status" varchar(25) NOT NULL DEFAULT 'BROUILLON',
        "source_document_id" uuid,
        "journal_entry_id" uuid,
        "tax_snapshot" jsonb,
        "notes" text,
        "created_by_user_id" uuid NOT NULL,
        "validated_by_user_id" uuid,
        "validated_at_utc" timestamptz,
        CONSTRAINT "UQ_business_invoice_number" UNIQUE ("dossier_id","type","number"),
        CONSTRAINT "CHK_business_invoice_type" CHECK ("type" IN ('ACHAT','VENTE')),
        CONSTRAINT "CHK_business_invoice_status" CHECK ("status" IN ('BROUILLON','VALIDEE','COMPTABILISEE','ANNULEE')),
        CONSTRAINT "FK_business_invoice_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_business_invoice_journal" FOREIGN KEY ("journal_id")
          REFERENCES "accounting"."accounting_journals"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_business_invoice_third_party_account" FOREIGN KEY ("third_party_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_business_invoice_vat_account" FOREIGN KEY ("vat_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_business_invoice_stamp_account" FOREIGN KEY ("stamp_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_business_invoice_withholding_account" FOREIGN KEY ("withholding_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_business_invoice_document" FOREIGN KEY ("source_document_id")
          REFERENCES "accounting"."accounting_documents"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_business_invoice_entry" FOREIGN KEY ("journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_business_invoice_period"
        ON "accounting"."business_invoices" ("organization_id","dossier_id","invoice_date","type");
      CREATE INDEX "IDX_business_invoice_status"
        ON "accounting"."business_invoices" ("organization_id","dossier_id","status");

      CREATE TABLE "accounting"."business_invoice_lines" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "invoice_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "description" varchar(300) NOT NULL,
        "quantity" numeric(15,3) NOT NULL,
        "unit_price" numeric(15,3) NOT NULL,
        "discount_rate" numeric(8,5) NOT NULL,
        "vat_code" varchar(30),
        "vat_rate" numeric(8,5) NOT NULL,
        "net_amount" numeric(15,3) NOT NULL,
        "vat_amount" numeric(15,3) NOT NULL,
        "gross_amount" numeric(15,3) NOT NULL,
        CONSTRAINT "FK_business_invoice_line_invoice" FOREIGN KEY ("invoice_id")
          REFERENCES "accounting"."business_invoices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_business_invoice_line_account" FOREIGN KEY ("account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_business_invoice_lines"
        ON "accounting"."business_invoice_lines" ("organization_id","invoice_id");
    `);

    for (const [name, description] of permissionSeed) {
      await queryRunner.query(
        `INSERT INTO "accounting"."permissions" ("name","description") VALUES ($1,$2)
         ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description"`,
        [name, description],
      );
    }
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.Owner,
      ownerPermissions,
    );
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.Collaborator,
      collaboratorPermissions,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "accounting"."business_invoice_lines";
      DROP TABLE IF EXISTS "accounting"."business_invoices";
    `);
  }

  private async replaceRolePermissions(
    queryRunner: QueryRunner,
    roleName: string,
    permissions: readonly string[],
  ) {
    const normalizedName = roleName.toUpperCase();
    await queryRunner.query(
      `DELETE FROM "accounting"."role_permissions" rp USING "accounting"."roles" r
       WHERE rp."role_id" = r."id" AND r."normalized_name" = $1`,
      [normalizedName],
    );
    for (const permission of permissions) {
      await queryRunner.query(
        `INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
         SELECT "id",$1 FROM "accounting"."roles" WHERE "normalized_name" = $2 ON CONFLICT DO NOTHING`,
        [permission, normalizedName],
      );
    }
  }
}
