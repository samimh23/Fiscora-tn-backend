import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentExtractionWorkflow1784382000000 implements MigrationInterface {
  name = 'DocumentExtractionWorkflow1784382000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."document_extraction_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz,
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "available_at_utc" timestamptz NOT NULL DEFAULT now(),
        "lease_expires_at_utc" timestamptz,
        "worker_id" varchar(160),
        "model_name" varchar(160),
        "raw_response" jsonb,
        "normalized_data" jsonb,
        "validation_issues" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "last_error" text,
        "processed_at_utc" timestamptz,
        "reviewed_at_utc" timestamptz,
        "reviewed_by_user_id" uuid,
        "review_comment" text,
        CONSTRAINT "PK_document_extraction_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_extraction_jobs_document" UNIQUE ("document_id"),
        CONSTRAINT "FK_document_extraction_jobs_document"
          FOREIGN KEY ("document_id")
          REFERENCES "accounting"."accounting_documents"("id")
          ON DELETE CASCADE,
        CONSTRAINT "CHK_document_extraction_jobs_status"
          CHECK ("status" IN ('EN_ATTENTE','EN_COURS','A_REVOIR','VALIDEE','REJETEE','ECHEC'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_document_extraction_jobs_claim"
        ON "accounting"."document_extraction_jobs" ("status", "available_at_utc")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_document_extraction_jobs_review"
        ON "accounting"."document_extraction_jobs" ("organization_id", "dossier_id", "status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "accounting"."document_extraction_jobs"',
    );
  }
}
