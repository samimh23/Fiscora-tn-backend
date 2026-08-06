import { MigrationInterface, QueryRunner } from 'typeorm';

export class CostCenters1784373000000 implements MigrationInterface {
  name = 'CostCenters1784373000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."cost_centers" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "code" varchar(30) NOT NULL,
        "normalized_code" varchar(30) NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" varchar(1000),
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_cost_center_code" UNIQUE ("dossier_id","normalized_code"),
        CONSTRAINT "FK_cost_center_organization" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cost_center_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_cost_centers_dossier_active"
        ON "accounting"."cost_centers" ("organization_id","dossier_id","is_active");

      ALTER TABLE "accounting"."journal_entry_lines"
        ADD COLUMN "cost_center_id" uuid,
        ADD CONSTRAINT "FK_journal_entry_line_cost_center"
          FOREIGN KEY ("cost_center_id") REFERENCES "accounting"."cost_centers"("id") ON DELETE SET NULL;
      CREATE INDEX "IDX_journal_entry_lines_cost_center"
        ON "accounting"."journal_entry_lines" ("cost_center_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_journal_entry_lines_cost_center";
      ALTER TABLE "accounting"."journal_entry_lines"
        DROP CONSTRAINT IF EXISTS "FK_journal_entry_line_cost_center",
        DROP COLUMN IF EXISTS "cost_center_id";
      DROP TABLE IF EXISTS "accounting"."cost_centers";
    `);
  }
}
