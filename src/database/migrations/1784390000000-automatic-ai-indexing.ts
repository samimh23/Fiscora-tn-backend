import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutomaticAiIndexing1784390000000 implements MigrationInterface {
  name = 'AutomaticAiIndexing1784390000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."ai_indexing_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz,
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "operation" varchar(20) NOT NULL DEFAULT 'INDEX',
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "available_at_utc" timestamptz NOT NULL DEFAULT now(),
        "lease_expires_at_utc" timestamptz,
        "worker_id" varchar(160),
        "last_error" text,
        "processed_at_utc" timestamptz,
        CONSTRAINT "PK_ai_indexing_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ai_indexing_jobs_document" UNIQUE ("document_id"),
        CONSTRAINT "CHK_ai_indexing_jobs_operation"
          CHECK ("operation" IN ('INDEX','DELETE')),
        CONSTRAINT "CHK_ai_indexing_jobs_status"
          CHECK ("status" IN ('PENDING','PROCESSING','INDEXED','FAILED')),
        CONSTRAINT "FK_ai_indexing_jobs_organization"
          FOREIGN KEY ("organization_id")
          REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_indexing_jobs_dossier"
          FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_indexing_jobs_queue"
        ON "accounting"."ai_indexing_jobs"
        ("status", "available_at_utc")
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION accounting.queue_ai_document_indexing()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'VALIDEE' AND NEW.normalized_data IS NOT NULL THEN
          INSERT INTO accounting.ai_indexing_jobs (
            organization_id, dossier_id, document_id, operation, status,
            attempt_count, available_at_utc, lease_expires_at_utc, worker_id,
            last_error, processed_at_utc
          ) VALUES (
            NEW.organization_id, NEW.dossier_id, NEW.document_id, 'INDEX',
            'PENDING', 0, now(), NULL, NULL, NULL, NULL
          )
          ON CONFLICT (document_id) DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            dossier_id = EXCLUDED.dossier_id,
            operation = 'INDEX',
            status = 'PENDING',
            attempt_count = 0,
            available_at_utc = now(),
            lease_expires_at_utc = NULL,
            worker_id = NULL,
            last_error = NULL,
            processed_at_utc = NULL,
            updated_at_utc = now();
        ELSIF TG_OP = 'UPDATE'
          AND OLD.status = 'VALIDEE'
          AND NEW.status <> 'VALIDEE' THEN
          INSERT INTO accounting.ai_indexing_jobs (
            organization_id, dossier_id, document_id, operation, status,
            attempt_count, available_at_utc
          ) VALUES (
            NEW.organization_id, NEW.dossier_id, NEW.document_id, 'DELETE',
            'PENDING', 0, now()
          )
          ON CONFLICT (document_id) DO UPDATE SET
            operation = 'DELETE',
            status = 'PENDING',
            attempt_count = 0,
            available_at_utc = now(),
            lease_expires_at_utc = NULL,
            worker_id = NULL,
            last_error = NULL,
            processed_at_utc = NULL,
            updated_at_utc = now();
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_queue_ai_document_indexing"
      AFTER INSERT OR UPDATE OF status, normalized_data
      ON "accounting"."document_extraction_jobs"
      FOR EACH ROW EXECUTE FUNCTION accounting.queue_ai_document_indexing()
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION accounting.queue_ai_document_cleanup()
      RETURNS trigger AS $$
      BEGIN
        IF OLD.deleted_at_utc IS NULL AND NEW.deleted_at_utc IS NOT NULL THEN
          INSERT INTO accounting.ai_indexing_jobs (
            organization_id, dossier_id, document_id, operation, status,
            attempt_count, available_at_utc
          ) VALUES (
            NEW.organization_id, NEW.dossier_id, NEW.id, 'DELETE', 'PENDING',
            0, now()
          )
          ON CONFLICT (document_id) DO UPDATE SET
            operation = 'DELETE',
            status = 'PENDING',
            attempt_count = 0,
            available_at_utc = now(),
            lease_expires_at_utc = NULL,
            worker_id = NULL,
            last_error = NULL,
            processed_at_utc = NULL,
            updated_at_utc = now();
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_queue_ai_document_cleanup"
      AFTER UPDATE OF deleted_at_utc
      ON "accounting"."accounting_documents"
      FOR EACH ROW EXECUTE FUNCTION accounting.queue_ai_document_cleanup()
    `);
    await queryRunner.query(`
      INSERT INTO accounting.ai_indexing_jobs (
        organization_id, dossier_id, document_id, operation, status,
        attempt_count, available_at_utc
      )
      SELECT job.organization_id, job.dossier_id, job.document_id, 'INDEX',
        'PENDING', 0, now()
      FROM accounting.document_extraction_jobs job
      INNER JOIN accounting.accounting_documents document
        ON document.id = job.document_id
      WHERE job.status = 'VALIDEE'
        AND job.normalized_data IS NOT NULL
        AND document.deleted_at_utc IS NULL
      ON CONFLICT (document_id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS "TRG_queue_ai_document_cleanup" ON "accounting"."accounting_documents"',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS accounting.queue_ai_document_cleanup()',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS "TRG_queue_ai_document_indexing" ON "accounting"."document_extraction_jobs"',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS accounting.queue_ai_document_indexing()',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "accounting"."ai_indexing_jobs"',
    );
  }
}
