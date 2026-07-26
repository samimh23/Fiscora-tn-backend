import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class PeriodClosing1784290000000 implements MigrationInterface {
  name = 'PeriodClosing1784290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."accounting_periods" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "period_year" integer NOT NULL,
        "period_month" smallint NOT NULL,
        "starts_on" date NOT NULL,
        "ends_on" date NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'OUVERTE',
        "locked_by_user_id" uuid,
        "locked_at_utc" timestamptz,
        "reopened_by_user_id" uuid,
        "reopened_at_utc" timestamptz,
        "note" text,
        CONSTRAINT "UQ_accounting_period" UNIQUE ("dossier_id","period_year","period_month"),
        CONSTRAINT "CHK_accounting_period_month" CHECK ("period_month" BETWEEN 1 AND 12),
        CONSTRAINT "CHK_accounting_period_dates" CHECK ("starts_on" <= "ends_on"),
        CONSTRAINT "CHK_accounting_period_status" CHECK ("status" IN ('OUVERTE','VERROUILLEE','CLOTUREE')),
        CONSTRAINT "FK_accounting_period_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_accounting_periods_status"
        ON "accounting"."accounting_periods" ("organization_id","dossier_id","period_year","period_month","status");

      CREATE TABLE "accounting"."closing_adjustments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "type" varchar(40) NOT NULL,
        "entry_date" date NOT NULL,
        "description" varchar(300) NOT NULL,
        "journal_entry_id" uuid NOT NULL,
        "reversal_date" date,
        "reversal_entry_id" uuid,
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "CHK_closing_adjustment_type" CHECK ("type" IN ('CHARGE_A_PAYER','PRODUIT_A_RECEVOIR','CHARGE_CONSTATEE_AVANCE','PRODUIT_CONSTATE_AVANCE','PROVISION','AUTRE')),
        CONSTRAINT "CHK_closing_adjustment_reversal" CHECK ("reversal_date" IS NULL OR "reversal_date" > "entry_date"),
        CONSTRAINT "FK_closing_adjustment_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_closing_adjustment_entry" FOREIGN KEY ("journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_closing_adjustment_reversal_entry" FOREIGN KEY ("reversal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_closing_adjustments_date"
        ON "accounting"."closing_adjustments" ("organization_id","dossier_id","entry_date");

      CREATE TABLE "accounting"."accounting_year_closings" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "period_year" integer NOT NULL,
        "starts_on" date NOT NULL,
        "ends_on" date NOT NULL,
        "status" varchar(20) NOT NULL,
        "net_result" numeric(15,3) NOT NULL,
        "result_account_id" uuid NOT NULL,
        "closing_journal_entry_id" uuid,
        "opening_journal_entry_id" uuid,
        "closed_by_user_id" uuid NOT NULL,
        "closed_at_utc" timestamptz NOT NULL,
        CONSTRAINT "UQ_accounting_year_closing" UNIQUE ("dossier_id","period_year"),
        CONSTRAINT "CHK_accounting_year_closing_dates" CHECK ("starts_on" <= "ends_on"),
        CONSTRAINT "CHK_accounting_year_closing_status" CHECK ("status" = 'CLOTUREE'),
        CONSTRAINT "FK_accounting_year_closing_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_accounting_year_closing_result_account" FOREIGN KEY ("result_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_accounting_year_closing_entry" FOREIGN KEY ("closing_journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_accounting_year_opening_entry" FOREIGN KEY ("opening_journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_accounting_year_closings"
        ON "accounting"."accounting_year_closings" ("organization_id","dossier_id","period_year");
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
      DROP TABLE IF EXISTS "accounting"."accounting_year_closings";
      DROP TABLE IF EXISTS "accounting"."closing_adjustments";
      DROP TABLE IF EXISTS "accounting"."accounting_periods";
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
