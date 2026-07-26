import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientDocumentSharing1784353100000 implements MigrationInterface {
  name = 'ClientDocumentSharing1784353100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."accounting_documents"
        ADD COLUMN "is_client_visible" boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."accounting_documents"
        DROP COLUMN IF EXISTS "is_client_visible";
    `);
  }
}
