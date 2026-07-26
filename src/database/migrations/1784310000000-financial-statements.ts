import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class FinancialStatements1784310000000 implements MigrationInterface {
  name = 'FinancialStatements1784310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."financial_statement_mappings" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "statement_section" varchar(80),
        "cash_flow_category" varchar(80),
        "updated_by_user_id" uuid NOT NULL,
        CONSTRAINT "UQ_financial_statement_mapping" UNIQUE ("dossier_id","account_id"),
        CONSTRAINT "FK_financial_statement_mapping_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_financial_statement_mapping_account" FOREIGN KEY ("account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_financial_statement_mappings"
        ON "accounting"."financial_statement_mappings" ("organization_id","dossier_id");

      CREATE TABLE "accounting"."financial_statement_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "period_year" integer NOT NULL,
        "starts_on" date NOT NULL,
        "ends_on" date NOT NULL,
        "version" integer NOT NULL,
        "status" varchar(20) NOT NULL,
        "payload_json" jsonb NOT NULL,
        "source_hash" varchar(64) NOT NULL,
        "accounting_year_closing_id" uuid,
        "created_by_user_id" uuid NOT NULL,
        "finalized_by_user_id" uuid,
        "finalized_at_utc" timestamptz,
        CONSTRAINT "UQ_financial_statement_snapshot_version" UNIQUE ("dossier_id","period_year","version"),
        CONSTRAINT "CHK_financial_statement_snapshot_year" CHECK ("period_year" BETWEEN 1900 AND 2200),
        CONSTRAINT "CHK_financial_statement_snapshot_dates" CHECK ("starts_on" <= "ends_on"),
        CONSTRAINT "CHK_financial_statement_snapshot_version" CHECK ("version" > 0),
        CONSTRAINT "CHK_financial_statement_snapshot_status" CHECK ("status" IN ('BROUILLON','DEFINITIF')),
        CONSTRAINT "FK_financial_statement_snapshot_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_financial_statement_snapshot_closing" FOREIGN KEY ("accounting_year_closing_id")
          REFERENCES "accounting"."accounting_year_closings"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_financial_statement_snapshots"
        ON "accounting"."financial_statement_snapshots" ("organization_id","dossier_id","period_year","status");
      CREATE UNIQUE INDEX "UQ_financial_statement_final"
        ON "accounting"."financial_statement_snapshots" ("dossier_id","period_year")
        WHERE "status" = 'DEFINITIF';
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
      DROP TABLE IF EXISTS "accounting"."financial_statement_snapshots";
      DROP TABLE IF EXISTS "accounting"."financial_statement_mappings";
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
