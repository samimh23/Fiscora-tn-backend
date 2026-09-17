import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairExtractionReviewQueue1784386000000 implements MigrationInterface {
  name = 'RepairExtractionReviewQueue1784386000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "accounting"."document_extraction_jobs" AS job
      SET
        "status" = CASE
          WHEN document."deleted_at_utc" IS NOT NULL THEN 'REJETEE'
          ELSE document."extraction_status"
        END,
        "lease_expires_at_utc" = NULL,
        "worker_id" = NULL,
        "reviewed_at_utc" = CASE
          WHEN document."deleted_at_utc" IS NOT NULL
            OR document."extraction_status" IN ('VALIDEE', 'REJETEE')
          THEN COALESCE(job."reviewed_at_utc", now())
          ELSE job."reviewed_at_utc"
        END,
        "review_comment" = CASE
          WHEN document."deleted_at_utc" IS NOT NULL
          THEN COALESCE(
            job."review_comment",
            'Extraction annulée automatiquement : document supprimé.'
          )
          ELSE job."review_comment"
        END,
        "updated_at_utc" = now()
      FROM "accounting"."accounting_documents" AS document
      WHERE job."document_id" = document."id"
        AND job."status" = 'A_REVOIR'
        AND (
          document."deleted_at_utc" IS NOT NULL
          OR document."extraction_status" IN ('VALIDEE', 'REJETEE', 'ECHEC')
        )
    `);
  }

  async down(): Promise<void> {
    // This migration repairs historical state and cannot safely infer the
    // previous status of each extraction job.
  }
}
