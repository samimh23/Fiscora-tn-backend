import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class FiscalSettings1784240000000 implements MigrationInterface {
  name = 'FiscalSettings1784240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."monthly_tax_declarations"
        ADD COLUMN "withholding_base" numeric(15,3),
        ADD COLUMN "withholding_nature" varchar(80),
        ADD COLUMN "withholding_rate" numeric(8,5),
        ADD COLUMN "parameter_snapshot" jsonb;

      ALTER TABLE "accounting"."payroll_runs"
        ADD COLUMN "parameter_snapshot" jsonb;

      CREATE TABLE "accounting"."fiscal_parameters" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid,
        "code" varchar(80) NOT NULL,
        "label" varchar(200) NOT NULL,
        "value_type" varchar(20) NOT NULL,
        "value" numeric(15,5) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "source_label" varchar(250),
        "source_url" varchar(1000),
        "notes" text,
        "is_system" boolean NOT NULL DEFAULT false,
        "created_by_user_id" uuid,
        CONSTRAINT "UQ_fiscal_parameter_version"
          UNIQUE ("organization_id","code","effective_from"),
        CONSTRAINT "CHK_fiscal_parameter_dates"
          CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
        CONSTRAINT "CHK_fiscal_parameter_value_type"
          CHECK ("value_type" IN ('TAUX','MONTANT')),
        CONSTRAINT "FK_fiscal_parameter_organization"
          FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_fiscal_parameter_applicable"
        ON "accounting"."fiscal_parameters" ("organization_id","code","effective_from","effective_to");

      CREATE TABLE "accounting"."vat_rates" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid,
        "code" varchar(30) NOT NULL,
        "label" varchar(160) NOT NULL,
        "rate" numeric(8,5) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "source_label" varchar(250),
        "source_url" varchar(1000),
        "is_system" boolean NOT NULL DEFAULT false,
        CONSTRAINT "UQ_vat_rate_version"
          UNIQUE ("organization_id","code","effective_from"),
        CONSTRAINT "CHK_vat_rate_dates"
          CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
        CONSTRAINT "FK_vat_rate_organization"
          FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_vat_rate_applicable"
        ON "accounting"."vat_rates" ("organization_id","effective_from","effective_to");

      CREATE TABLE "accounting"."withholding_tax_rates" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid,
        "nature_code" varchar(80) NOT NULL,
        "label" varchar(200) NOT NULL,
        "rate" numeric(8,5) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "source_label" varchar(250),
        "source_url" varchar(1000),
        "is_system" boolean NOT NULL DEFAULT false,
        CONSTRAINT "UQ_withholding_rate_version"
          UNIQUE ("organization_id","nature_code","effective_from"),
        CONSTRAINT "CHK_withholding_rate_dates"
          CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
        CONSTRAINT "FK_withholding_rate_organization"
          FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_withholding_rate_applicable"
        ON "accounting"."withholding_tax_rates" ("organization_id","nature_code","effective_from","effective_to");

      CREATE TABLE "accounting"."income_tax_brackets" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid,
        "lower_bound" numeric(15,3) NOT NULL,
        "upper_bound" numeric(15,3),
        "rate" numeric(8,5) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "source_label" varchar(250),
        "source_url" varchar(1000),
        "is_system" boolean NOT NULL DEFAULT false,
        CONSTRAINT "UQ_income_tax_bracket_version"
          UNIQUE ("organization_id","effective_from","lower_bound"),
        CONSTRAINT "CHK_income_tax_bracket_bounds"
          CHECK ("upper_bound" IS NULL OR "upper_bound" > "lower_bound"),
        CONSTRAINT "CHK_income_tax_bracket_dates"
          CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
        CONSTRAINT "FK_income_tax_bracket_organization"
          FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_income_tax_bracket_applicable"
        ON "accounting"."income_tax_brackets" ("organization_id","effective_from","effective_to");
    `);

    const cnssSource =
      'https://www.cnss.tn/fr/web/employeur/emp_asset_services/-/asset_publisher/sYQ8/content/emp_secteur-non_agr2_assiette?secteur=1';
    await queryRunner.query(
      `INSERT INTO "accounting"."fiscal_parameters"
       ("organization_id","code","label","value_type","value","effective_from","source_label","source_url","notes","is_system")
       VALUES
       (NULL,'CNSS_RSNA_SALARIE','Cotisation CNSS salariale - régime non agricole','TAUX',0.09180,'2009-07-01','CNSS Tunisie',$1,'Taux RSNA hors accidents du travail et maladies professionnelles.',true),
       (NULL,'CNSS_RSNA_EMPLOYEUR','Cotisation CNSS patronale - régime non agricole','TAUX',0.16570,'2009-07-01','CNSS Tunisie',$1,'Taux RSNA hors accidents du travail et maladies professionnelles.',true)`,
      [cnssSource],
    );

    const irppSource =
      'https://www.finances.gov.tn/sites/default/files/2024-12/LF2025_1.pdf';
    await queryRunner.query(
      `INSERT INTO "accounting"."income_tax_brackets"
       ("organization_id","lower_bound","upper_bound","rate","effective_from","source_label","source_url","is_system")
       VALUES
       (NULL,0.000,5000.000,0.00000,'2025-01-01','Loi de finances 2025',$1,true),
       (NULL,5000.000,10000.000,0.15000,'2025-01-01','Loi de finances 2025',$1,true),
       (NULL,10000.000,20000.000,0.25000,'2025-01-01','Loi de finances 2025',$1,true),
       (NULL,20000.000,30000.000,0.30000,'2025-01-01','Loi de finances 2025',$1,true),
       (NULL,30000.000,40000.000,0.33000,'2025-01-01','Loi de finances 2025',$1,true),
       (NULL,40000.000,50000.000,0.36000,'2025-01-01','Loi de finances 2025',$1,true),
       (NULL,50000.000,70000.000,0.38000,'2025-01-01','Loi de finances 2025',$1,true),
       (NULL,70000.000,NULL,0.40000,'2025-01-01','Loi de finances 2025',$1,true)`,
      [irppSource],
    );

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
      DROP TABLE IF EXISTS "accounting"."income_tax_brackets";
      DROP TABLE IF EXISTS "accounting"."withholding_tax_rates";
      DROP TABLE IF EXISTS "accounting"."vat_rates";
      DROP TABLE IF EXISTS "accounting"."fiscal_parameters";
      ALTER TABLE "accounting"."payroll_runs"
        DROP COLUMN IF EXISTS "parameter_snapshot";
      ALTER TABLE "accounting"."monthly_tax_declarations"
        DROP COLUMN IF EXISTS "parameter_snapshot",
        DROP COLUMN IF EXISTS "withholding_rate",
        DROP COLUMN IF EXISTS "withholding_nature",
        DROP COLUMN IF EXISTS "withholding_base";
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
