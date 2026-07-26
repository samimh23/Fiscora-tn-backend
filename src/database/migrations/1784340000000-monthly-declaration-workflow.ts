import { MigrationInterface, QueryRunner } from 'typeorm';

export class MonthlyDeclarationWorkflow1784340000000 implements MigrationInterface {
  name = 'MonthlyDeclarationWorkflow1784340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."monthly_tax_declarations"
        ADD COLUMN "source_snapshot" jsonb,
        ADD COLUMN "checks_json" jsonb,
        ADD COLUMN "calculation_mode" varchar(20) NOT NULL DEFAULT 'AUTOMATIQUE',
        ADD COLUMN "adjustment_reason" text,
        ADD COLUMN "reviewed_by_user_id" uuid,
        ADD COLUMN "reviewed_at_utc" timestamptz,
        ADD COLUMN "review_comment" text,
        ADD COLUMN "filed_by_user_id" uuid,
        ADD COLUMN "filing_reference" varchar(160),
        ADD COLUMN "receipt_document_id" uuid,
        ADD CONSTRAINT "FK_monthly_declaration_receipt_document"
          FOREIGN KEY ("receipt_document_id")
          REFERENCES "accounting"."accounting_documents"("id") ON DELETE SET NULL;
      CREATE INDEX "IDX_monthly_declaration_receipt"
        ON "accounting"."monthly_tax_declarations" ("receipt_document_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_monthly_declaration_receipt";
      ALTER TABLE "accounting"."monthly_tax_declarations"
        DROP CONSTRAINT IF EXISTS "FK_monthly_declaration_receipt_document",
        DROP COLUMN IF EXISTS "receipt_document_id",
        DROP COLUMN IF EXISTS "filing_reference",
        DROP COLUMN IF EXISTS "filed_by_user_id",
        DROP COLUMN IF EXISTS "review_comment",
        DROP COLUMN IF EXISTS "reviewed_at_utc",
        DROP COLUMN IF EXISTS "reviewed_by_user_id",
        DROP COLUMN IF EXISTS "adjustment_reason",
        DROP COLUMN IF EXISTS "calculation_mode",
        DROP COLUMN IF EXISTS "checks_json",
        DROP COLUMN IF EXISTS "source_snapshot";
    `);
  }
}
