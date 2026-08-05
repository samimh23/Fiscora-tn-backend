import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentRequestsWorkflow1784367000000
  implements MigrationInterface
{
  name = 'DocumentRequestsWorkflow1784367000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."missing_document_expectations"
        ADD COLUMN IF NOT EXISTS "due_on" date,
        ADD COLUMN IF NOT EXISTS "message" text,
        ADD COLUMN IF NOT EXISTS "status" character varying(20) NOT NULL DEFAULT 'DEMANDEE',
        ADD COLUMN IF NOT EXISTS "requested_by_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "requested_at_utc" timestamptz,
        ADD COLUMN IF NOT EXISTS "validated_by_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "validated_at_utc" timestamptz,
        ADD COLUMN IF NOT EXISTS "rejected_by_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "rejected_at_utc" timestamptz,
        ADD COLUMN IF NOT EXISTS "rejection_reason" text,
        ADD COLUMN IF NOT EXISTS "cancelled_at_utc" timestamptz;
    `);
    await queryRunner.query(`
      UPDATE "accounting"."missing_document_expectations"
      SET
        "status" = CASE
          WHEN "received_document_id" IS NULL THEN 'DEMANDEE'
          ELSE 'RECUE'
        END,
        "requested_at_utc" = COALESCE("requested_at_utc", "created_at_utc")
      WHERE "status" = 'DEMANDEE';
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting"."missing_document_expectations"
        ADD CONSTRAINT "CHK_missing_document_expectations_status"
        CHECK ("status" IN ('DEMANDEE', 'RECUE', 'VALIDEE', 'REJETEE', 'ANNULEE'));
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting"."missing_document_expectations"
        ADD CONSTRAINT "FK_missing_document_expectations_requested_by"
        FOREIGN KEY ("requested_by_user_id")
        REFERENCES "accounting"."users"("id")
        ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting"."missing_document_expectations"
        ADD CONSTRAINT "FK_missing_document_expectations_validated_by"
        FOREIGN KEY ("validated_by_user_id")
        REFERENCES "accounting"."users"("id")
        ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting"."missing_document_expectations"
        ADD CONSTRAINT "FK_missing_document_expectations_rejected_by"
        FOREIGN KEY ("rejected_by_user_id")
        REFERENCES "accounting"."users"("id")
        ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_missing_document_expectations_status_due"
      ON "accounting"."missing_document_expectations"
      ("organization_id", "dossier_id", "status", "due_on");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_missing_document_expectations_status_due";
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting"."missing_document_expectations"
        DROP CONSTRAINT IF EXISTS "FK_missing_document_expectations_rejected_by",
        DROP CONSTRAINT IF EXISTS "FK_missing_document_expectations_validated_by",
        DROP CONSTRAINT IF EXISTS "FK_missing_document_expectations_requested_by",
        DROP CONSTRAINT IF EXISTS "CHK_missing_document_expectations_status";
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting"."missing_document_expectations"
        DROP COLUMN IF EXISTS "cancelled_at_utc",
        DROP COLUMN IF EXISTS "rejection_reason",
        DROP COLUMN IF EXISTS "rejected_at_utc",
        DROP COLUMN IF EXISTS "rejected_by_user_id",
        DROP COLUMN IF EXISTS "validated_at_utc",
        DROP COLUMN IF EXISTS "validated_by_user_id",
        DROP COLUMN IF EXISTS "requested_at_utc",
        DROP COLUMN IF EXISTS "requested_by_user_id",
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "message",
        DROP COLUMN IF EXISTS "due_on";
    `);
  }
}
