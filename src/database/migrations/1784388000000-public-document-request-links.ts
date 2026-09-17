import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicDocumentRequestLinks1784388000000 implements MigrationInterface {
  name = 'PublicDocumentRequestLinks1784388000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."missing_document_expectations"
        ADD COLUMN "recipient_email" varchar(320),
        ADD COLUMN "public_token_hash" varchar(64),
        ADD COLUMN "public_token_expires_at_utc" timestamptz,
        ADD COLUMN "public_token_used_at_utc" timestamptz,
        ADD COLUMN "delivery_status" varchar(20) NOT NULL DEFAULT 'PORTAIL',
        ADD COLUMN "delivery_error" text,
        ADD COLUMN "sent_at_utc" timestamptz;

      ALTER TABLE "accounting"."missing_document_expectations"
        ADD CONSTRAINT "CHK_document_request_delivery_status"
        CHECK ("delivery_status" IN ('PORTAIL','ENVOYEE','ECHEC'));

      CREATE UNIQUE INDEX "UQ_document_request_public_token"
        ON "accounting"."missing_document_expectations" ("public_token_hash")
        WHERE "public_token_hash" IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."UQ_document_request_public_token";
      ALTER TABLE "accounting"."missing_document_expectations"
        DROP CONSTRAINT IF EXISTS "CHK_document_request_delivery_status",
        DROP COLUMN IF EXISTS "sent_at_utc",
        DROP COLUMN IF EXISTS "delivery_error",
        DROP COLUMN IF EXISTS "delivery_status",
        DROP COLUMN IF EXISTS "public_token_used_at_utc",
        DROP COLUMN IF EXISTS "public_token_expires_at_utc",
        DROP COLUMN IF EXISTS "public_token_hash",
        DROP COLUMN IF EXISTS "recipient_email";
    `);
  }
}
