import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class FixedAssets1784280000000 implements MigrationInterface {
  name = 'FixedAssets1784280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."fixed_asset_categories" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "code" varchar(30) NOT NULL,
        "name" varchar(180) NOT NULL,
        "asset_account_id" uuid NOT NULL,
        "accumulated_depreciation_account_id" uuid NOT NULL,
        "depreciation_expense_account_id" uuid NOT NULL,
        "default_method" varchar(20) NOT NULL,
        "default_useful_life_months" integer NOT NULL,
        "default_declining_rate" numeric(8,5),
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_fixed_asset_category_code" UNIQUE ("dossier_id","code"),
        CONSTRAINT "CHK_fixed_asset_category_method" CHECK ("default_method" IN ('LINEAIRE','DEGRESSIF')),
        CONSTRAINT "CHK_fixed_asset_category_life" CHECK ("default_useful_life_months" > 0),
        CONSTRAINT "CHK_fixed_asset_category_rate" CHECK ("default_declining_rate" IS NULL OR ("default_declining_rate" > 0 AND "default_declining_rate" <= 1)),
        CONSTRAINT "FK_fixed_asset_category_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fixed_asset_category_asset_account" FOREIGN KEY ("asset_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_fixed_asset_category_accum_account" FOREIGN KEY ("accumulated_depreciation_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_fixed_asset_category_expense_account" FOREIGN KEY ("depreciation_expense_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_fixed_asset_categories_active"
        ON "accounting"."fixed_asset_categories" ("organization_id","dossier_id","is_active");

      CREATE TABLE "accounting"."fixed_assets" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "code" varchar(50) NOT NULL,
        "name" varchar(220) NOT NULL,
        "description" text,
        "acquisition_date" date NOT NULL,
        "service_date" date NOT NULL,
        "purchase_invoice_id" uuid,
        "supplier_id" uuid,
        "acquisition_cost" numeric(15,3) NOT NULL,
        "residual_value" numeric(15,3) NOT NULL DEFAULT 0,
        "depreciable_base" numeric(15,3) NOT NULL,
        "accounting_method" varchar(20) NOT NULL,
        "useful_life_months" integer NOT NULL,
        "accounting_declining_rate" numeric(8,5),
        "fiscal_method" varchar(20) NOT NULL,
        "fiscal_useful_life_months" integer NOT NULL,
        "fiscal_declining_rate" numeric(8,5),
        "opening_accounting_depreciation" numeric(15,3) NOT NULL DEFAULT 0,
        "opening_fiscal_depreciation" numeric(15,3) NOT NULL DEFAULT 0,
        "posted_accounting_depreciation" numeric(15,3) NOT NULL DEFAULT 0,
        "net_book_value" numeric(15,3) NOT NULL,
        "asset_account_id" uuid NOT NULL,
        "accumulated_depreciation_account_id" uuid NOT NULL,
        "depreciation_expense_account_id" uuid NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "disposal_date" date,
        "disposal_proceeds" numeric(15,3),
        "disposal_gain_loss" numeric(15,3),
        "disposal_journal_entry_id" uuid,
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "UQ_fixed_asset_code" UNIQUE ("dossier_id","code"),
        CONSTRAINT "CHK_fixed_asset_dates" CHECK ("service_date" >= "acquisition_date"),
        CONSTRAINT "CHK_fixed_asset_values" CHECK ("acquisition_cost" > 0 AND "residual_value" >= 0 AND "residual_value" < "acquisition_cost" AND "depreciable_base" = "acquisition_cost" - "residual_value"),
        CONSTRAINT "CHK_fixed_asset_methods" CHECK ("accounting_method" IN ('LINEAIRE','DEGRESSIF') AND "fiscal_method" IN ('LINEAIRE','DEGRESSIF')),
        CONSTRAINT "CHK_fixed_asset_lives" CHECK ("useful_life_months" > 0 AND "fiscal_useful_life_months" > 0),
        CONSTRAINT "CHK_fixed_asset_accounting_rate" CHECK ("accounting_declining_rate" IS NULL OR ("accounting_declining_rate" > 0 AND "accounting_declining_rate" <= 1)),
        CONSTRAINT "CHK_fixed_asset_fiscal_rate" CHECK ("fiscal_declining_rate" IS NULL OR ("fiscal_declining_rate" > 0 AND "fiscal_declining_rate" <= 1)),
        CONSTRAINT "CHK_fixed_asset_opening" CHECK ("opening_accounting_depreciation" >= 0 AND "opening_fiscal_depreciation" >= 0 AND "posted_accounting_depreciation" >= 0 AND "net_book_value" >= "residual_value"),
        CONSTRAINT "CHK_fixed_asset_status" CHECK ("status" IN ('ACTIVE','TOTALEMENT_AMORTIE','CEDEE','MISE_AU_REBUT')),
        CONSTRAINT "FK_fixed_asset_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fixed_asset_category" FOREIGN KEY ("category_id")
          REFERENCES "accounting"."fixed_asset_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_fixed_asset_invoice" FOREIGN KEY ("purchase_invoice_id")
          REFERENCES "accounting"."business_invoices"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_fixed_asset_supplier" FOREIGN KEY ("supplier_id")
          REFERENCES "accounting"."third_parties"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_fixed_asset_asset_account" FOREIGN KEY ("asset_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_fixed_asset_accum_account" FOREIGN KEY ("accumulated_depreciation_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_fixed_asset_expense_account" FOREIGN KEY ("depreciation_expense_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_fixed_asset_disposal_entry" FOREIGN KEY ("disposal_journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_fixed_assets_status"
        ON "accounting"."fixed_assets" ("organization_id","dossier_id","status","service_date");

      CREATE TABLE "accounting"."asset_depreciation_periods" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "asset_id" uuid NOT NULL,
        "period_year" integer NOT NULL,
        "period_month" smallint NOT NULL,
        "period_end" date NOT NULL,
        "accounting_amount" numeric(15,3) NOT NULL,
        "fiscal_amount" numeric(15,3) NOT NULL,
        "temporary_difference" numeric(15,3) NOT NULL,
        "accumulated_accounting" numeric(15,3) NOT NULL,
        "accumulated_fiscal" numeric(15,3) NOT NULL,
        "net_book_value" numeric(15,3) NOT NULL,
        "status" varchar(25) NOT NULL DEFAULT 'PLANIFIEE',
        "journal_entry_id" uuid,
        "posted_by_user_id" uuid,
        "posted_at_utc" timestamptz,
        CONSTRAINT "UQ_asset_depreciation_period" UNIQUE ("asset_id","period_year","period_month"),
        CONSTRAINT "CHK_asset_depreciation_month" CHECK ("period_month" BETWEEN 1 AND 12),
        CONSTRAINT "CHK_asset_depreciation_amounts" CHECK ("accounting_amount" >= 0 AND "fiscal_amount" >= 0 AND "accumulated_accounting" >= 0 AND "accumulated_fiscal" >= 0 AND "net_book_value" >= 0),
        CONSTRAINT "CHK_asset_depreciation_status" CHECK ("status" IN ('PLANIFIEE','COMPTABILISEE')),
        CONSTRAINT "FK_asset_depreciation_asset" FOREIGN KEY ("asset_id")
          REFERENCES "accounting"."fixed_assets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_asset_depreciation_entry" FOREIGN KEY ("journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_asset_depreciation_periods"
        ON "accounting"."asset_depreciation_periods" ("organization_id","dossier_id","period_year","period_month","status");

      CREATE TABLE "accounting"."asset_depreciation_years" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "period_year" integer NOT NULL,
        "total_accounting" numeric(15,3) NOT NULL,
        "total_fiscal" numeric(15,3) NOT NULL,
        "temporary_difference" numeric(15,3) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'OUVERTE',
        "validated_by_user_id" uuid,
        "validated_at_utc" timestamptz,
        CONSTRAINT "UQ_asset_depreciation_year" UNIQUE ("dossier_id","period_year"),
        CONSTRAINT "CHK_asset_depreciation_year_status" CHECK ("status" IN ('OUVERTE','VALIDEE')),
        CONSTRAINT "FK_asset_depreciation_year_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
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
      DROP TABLE IF EXISTS "accounting"."asset_depreciation_years";
      DROP TABLE IF EXISTS "accounting"."asset_depreciation_periods";
      DROP TABLE IF EXISTS "accounting"."fixed_assets";
      DROP TABLE IF EXISTS "accounting"."fixed_asset_categories";
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
