import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class Settlements1784260000000 implements MigrationInterface {
  name = 'Settlements1784260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."third_parties" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "type" varchar(30) NOT NULL,
        "name" varchar(200) NOT NULL,
        "tax_identifier" varchar(100),
        "rne_number" varchar(100),
        "email" varchar(320),
        "phone" varchar(50),
        "address" text,
        "receivable_account_id" uuid,
        "payable_account_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_third_party_name" UNIQUE ("dossier_id","type","name"),
        CONSTRAINT "CHK_third_party_type" CHECK ("type" IN ('CLIENT','FOURNISSEUR','CLIENT_ET_FOURNISSEUR')),
        CONSTRAINT "FK_third_party_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_third_party_receivable" FOREIGN KEY ("receivable_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_third_party_payable" FOREIGN KEY ("payable_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_third_parties_active"
        ON "accounting"."third_parties" ("organization_id","dossier_id","is_active");

      ALTER TABLE "accounting"."business_invoices"
        DROP CONSTRAINT "UQ_business_invoice_number",
        ADD COLUMN "kind" varchar(20) NOT NULL DEFAULT 'FACTURE',
        ADD COLUMN "third_party_id" uuid,
        ADD COLUMN "original_invoice_id" uuid,
        ADD COLUMN "paid_amount" numeric(15,3) NOT NULL DEFAULT 0,
        ADD COLUMN "credited_amount" numeric(15,3) NOT NULL DEFAULT 0,
        ADD COLUMN "outstanding_amount" numeric(15,3),
        ADD COLUMN "settlement_status" varchar(30) NOT NULL DEFAULT 'NON_REGLEE';

      UPDATE "accounting"."business_invoices"
        SET "outstanding_amount" = "net_payable";

      ALTER TABLE "accounting"."business_invoices"
        ALTER COLUMN "outstanding_amount" SET NOT NULL,
        ADD CONSTRAINT "UQ_business_invoice_number_kind"
          UNIQUE ("dossier_id","type","kind","number"),
        ADD CONSTRAINT "CHK_business_invoice_kind"
          CHECK ("kind" IN ('FACTURE','AVOIR')),
        ADD CONSTRAINT "CHK_invoice_settlement_status"
          CHECK ("settlement_status" IN ('NON_REGLEE','PARTIELLEMENT_REGLEE','REGLEE')),
        ADD CONSTRAINT "FK_business_invoice_third_party" FOREIGN KEY ("third_party_id")
          REFERENCES "accounting"."third_parties"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_business_invoice_original" FOREIGN KEY ("original_invoice_id")
          REFERENCES "accounting"."business_invoices"("id") ON DELETE RESTRICT;

      CREATE TABLE "accounting"."third_party_payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "third_party_id" uuid NOT NULL,
        "direction" varchar(20) NOT NULL,
        "payment_date" date NOT NULL,
        "amount" numeric(15,3) NOT NULL,
        "method" varchar(50) NOT NULL,
        "reference" varchar(120),
        "journal_id" uuid NOT NULL,
        "cash_account_id" uuid NOT NULL,
        "third_party_account_id" uuid NOT NULL,
        "journal_entry_id" uuid NOT NULL,
        "status" varchar(25) NOT NULL DEFAULT 'BROUILLON',
        "created_by_user_id" uuid NOT NULL,
        "posted_by_user_id" uuid,
        "posted_at_utc" timestamptz,
        CONSTRAINT "CHK_payment_direction" CHECK ("direction" IN ('ENCAISSEMENT','DECAISSEMENT')),
        CONSTRAINT "CHK_payment_status" CHECK ("status" IN ('BROUILLON','COMPTABILISE','ANNULE')),
        CONSTRAINT "FK_payment_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_third_party" FOREIGN KEY ("third_party_id")
          REFERENCES "accounting"."third_parties"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_journal" FOREIGN KEY ("journal_id")
          REFERENCES "accounting"."accounting_journals"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_cash_account" FOREIGN KEY ("cash_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_third_party_account" FOREIGN KEY ("third_party_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_entry" FOREIGN KEY ("journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_third_party_payments_period"
        ON "accounting"."third_party_payments" ("organization_id","dossier_id","payment_date","status");

      CREATE TABLE "accounting"."payment_allocations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "payment_id" uuid NOT NULL,
        "invoice_id" uuid NOT NULL,
        "amount" numeric(15,3) NOT NULL,
        CONSTRAINT "UQ_payment_allocation_invoice" UNIQUE ("payment_id","invoice_id"),
        CONSTRAINT "FK_allocation_payment" FOREIGN KEY ("payment_id")
          REFERENCES "accounting"."third_party_payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_allocation_invoice" FOREIGN KEY ("invoice_id")
          REFERENCES "accounting"."business_invoices"("id") ON DELETE RESTRICT
      );
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
      DROP TABLE IF EXISTS "accounting"."payment_allocations";
      DROP TABLE IF EXISTS "accounting"."third_party_payments";
      ALTER TABLE "accounting"."business_invoices"
        DROP CONSTRAINT IF EXISTS "FK_business_invoice_original",
        DROP CONSTRAINT IF EXISTS "FK_business_invoice_third_party",
        DROP CONSTRAINT IF EXISTS "CHK_invoice_settlement_status",
        DROP CONSTRAINT IF EXISTS "CHK_business_invoice_kind",
        DROP CONSTRAINT IF EXISTS "UQ_business_invoice_number_kind",
        DROP COLUMN IF EXISTS "settlement_status",
        DROP COLUMN IF EXISTS "outstanding_amount",
        DROP COLUMN IF EXISTS "credited_amount",
        DROP COLUMN IF EXISTS "paid_amount",
        DROP COLUMN IF EXISTS "original_invoice_id",
        DROP COLUMN IF EXISTS "third_party_id",
        DROP COLUMN IF EXISTS "kind",
        ADD CONSTRAINT "UQ_business_invoice_number" UNIQUE ("dossier_id","type","number");
      DROP TABLE IF EXISTS "accounting"."third_parties";
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
