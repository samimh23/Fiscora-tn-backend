import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoogleIdentities1784385000000 implements MigrationInterface {
  name = 'GoogleIdentities1784385000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."user_external_identities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz,
        "user_id" uuid NOT NULL,
        "provider" varchar(40) NOT NULL,
        "provider_subject" varchar(255) NOT NULL,
        "provider_email" varchar(320) NOT NULL,
        "hosted_domain" varchar(255),
        "last_authenticated_at_utc" timestamptz NOT NULL,
        CONSTRAINT "PK_user_external_identities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_external_identity_subject" UNIQUE ("provider", "provider_subject"),
        CONSTRAINT "UQ_external_identity_user_provider" UNIQUE ("provider", "user_id"),
        CONSTRAINT "FK_external_identity_user" FOREIGN KEY ("user_id")
          REFERENCES "accounting"."users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_external_identities_user"
        ON "accounting"."user_external_identities" ("user_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "accounting"."user_external_identities"',
    );
  }
}
