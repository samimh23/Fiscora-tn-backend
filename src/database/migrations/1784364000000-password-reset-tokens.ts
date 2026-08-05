import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordResetTokens1784364000000 implements MigrationInterface {
  name = 'PasswordResetTokens1784364000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at_utc" TIMESTAMP WITH TIME ZONE,
        "requested_ip" character varying(80),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_password_reset_tokens_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_password_reset_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "accounting"."users"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_password_reset_tokens_user_used"
        ON "accounting"."password_reset_tokens" ("user_id", "used_at_utc");
      CREATE INDEX "IDX_password_reset_tokens_expires"
        ON "accounting"."password_reset_tokens" ("expires_at_utc");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_password_reset_tokens_expires";
      DROP INDEX IF EXISTS "accounting"."IDX_password_reset_tokens_user_used";
      DROP TABLE IF EXISTS "accounting"."password_reset_tokens";
    `);
  }
}
