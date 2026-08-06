import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnnualTaxCarryforward1784370000000 implements MigrationInterface {
  name = 'AnnualTaxCarryforward1784370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."tax_loss_carryforwards" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "origin_year" integer NOT NULL,
        "original_amount" numeric(15,3) NOT NULL,
        "remaining_amount" numeric(15,3) NOT NULL,
        "expires_after_year" integer NOT NULL,
        "source_filing_id" uuid,
        CONSTRAINT "CHK_tax_loss_carryforward_amounts"
          CHECK ("remaining_amount" >= 0 AND "remaining_amount" <= "original_amount"),
        CONSTRAINT "FK_tax_loss_carryforward_dossier"
          FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_tax_loss_carryforward_lookup"
        ON "accounting"."tax_loss_carryforwards" ("organization_id","dossier_id","origin_year");

      CREATE TABLE "accounting"."annual_tax_filings" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "period_year" integer NOT NULL,
        "fiscal_result_before_carryforward" numeric(15,3) NOT NULL,
        "carryforward_applied" numeric(15,3) NOT NULL,
        "fiscal_result_after_carryforward" numeric(15,3) NOT NULL,
        "net_tax_due" numeric(15,3) NOT NULL,
        "finalized_by_user_id" uuid NOT NULL,
        "finalized_at_utc" timestamptz NOT NULL,
        CONSTRAINT "UQ_annual_tax_filing_period"
          UNIQUE ("organization_id","dossier_id","period_year"),
        CONSTRAINT "FK_annual_tax_filing_dossier"
          FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );

      ALTER TABLE "accounting"."tax_loss_carryforwards"
        ADD CONSTRAINT "FK_tax_loss_carryforward_filing"
        FOREIGN KEY ("source_filing_id") REFERENCES "accounting"."annual_tax_filings"("id") ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "accounting"."tax_loss_carryforwards";
      DROP TABLE IF EXISTS "accounting"."annual_tax_filings";
    `);
  }
}
