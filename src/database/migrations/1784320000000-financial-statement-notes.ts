import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinancialStatementNotes1784320000000 implements MigrationInterface {
  name = 'FinancialStatementNotes1784320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."financial_statement_note_sets" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "period_year" integer NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'BROUILLON',
        "review_comment" text,
        "created_by_user_id" uuid NOT NULL,
        "submitted_by_user_id" uuid,
        "submitted_at_utc" timestamptz,
        "validated_by_user_id" uuid,
        "validated_at_utc" timestamptz,
        CONSTRAINT "UQ_financial_statement_note_set" UNIQUE ("dossier_id","period_year"),
        CONSTRAINT "CHK_financial_statement_note_set_year" CHECK ("period_year" BETWEEN 1900 AND 2200),
        CONSTRAINT "CHK_financial_statement_note_set_status" CHECK ("status" IN ('BROUILLON','PRETES_POUR_REVISION','VALIDEES')),
        CONSTRAINT "FK_financial_statement_note_set_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_financial_statement_note_sets"
        ON "accounting"."financial_statement_note_sets" ("organization_id","dossier_id","period_year","status");

      CREATE TABLE "accounting"."financial_statement_note_sections" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "note_set_id" uuid NOT NULL,
        "code" varchar(80) NOT NULL,
        "note_number" smallint NOT NULL,
        "title" varchar(250) NOT NULL,
        "source" varchar(20) NOT NULL,
        "content" text NOT NULL DEFAULT '',
        "auto_data_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "statement_line_codes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_required" boolean NOT NULL DEFAULT false,
        "display_order" smallint NOT NULL,
        "updated_by_user_id" uuid NOT NULL,
        CONSTRAINT "UQ_financial_statement_note_section_code" UNIQUE ("note_set_id","code"),
        CONSTRAINT "UQ_financial_statement_note_section_number" UNIQUE ("note_set_id","note_number"),
        CONSTRAINT "CHK_financial_statement_note_section_number" CHECK ("note_number" > 0),
        CONSTRAINT "CHK_financial_statement_note_section_order" CHECK ("display_order" > 0),
        CONSTRAINT "CHK_financial_statement_note_section_source" CHECK ("source" IN ('MANUELLE','AUTOMATIQUE','MIXTE')),
        CONSTRAINT "FK_financial_statement_note_section_set" FOREIGN KEY ("note_set_id")
          REFERENCES "accounting"."financial_statement_note_sets"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_financial_statement_note_sections"
        ON "accounting"."financial_statement_note_sections" ("organization_id","dossier_id","note_set_id","display_order");

      CREATE TABLE "accounting"."financial_statement_note_documents" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "section_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "attached_by_user_id" uuid NOT NULL,
        CONSTRAINT "UQ_financial_statement_note_document" UNIQUE ("section_id","document_id"),
        CONSTRAINT "FK_financial_statement_note_document_section" FOREIGN KEY ("section_id")
          REFERENCES "accounting"."financial_statement_note_sections"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_financial_statement_note_document_document" FOREIGN KEY ("document_id")
          REFERENCES "accounting"."accounting_documents"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_financial_statement_note_documents"
        ON "accounting"."financial_statement_note_documents" ("organization_id","dossier_id","section_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "accounting"."financial_statement_note_documents";
      DROP TABLE IF EXISTS "accounting"."financial_statement_note_sections";
      DROP TABLE IF EXISTS "accounting"."financial_statement_note_sets";
    `);
  }
}
