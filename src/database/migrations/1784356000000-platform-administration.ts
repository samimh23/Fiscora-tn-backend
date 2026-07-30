import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformAdministration1784356000000 implements MigrationInterface {
  name = 'PlatformAdministration1784356000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."users"
        ADD COLUMN "is_platform_admin" boolean NOT NULL DEFAULT false;

      CREATE INDEX "IDX_users_platform_admin"
        ON "accounting"."users" ("is_platform_admin")
        WHERE "is_platform_admin" = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_users_platform_admin";
      ALTER TABLE "accounting"."users"
        DROP COLUMN IF EXISTS "is_platform_admin";
    `);
  }
}
