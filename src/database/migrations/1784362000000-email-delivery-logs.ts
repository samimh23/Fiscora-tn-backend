import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailDeliveryLogs1784362000000 implements MigrationInterface {
  name = 'EmailDeliveryLogs1784362000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."email_delivery_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid,
        "actor_user_id" uuid,
        "category" character varying(40) NOT NULL,
        "provider" character varying(80) NOT NULL DEFAULT 'smtp',
        "recipient" character varying(320) NOT NULL,
        "sender" character varying(320),
        "subject" character varying(500) NOT NULL,
        "status" character varying(20) NOT NULL,
        "provider_message_id" character varying(500),
        "smtp_response" text,
        "error_message" text,
        "metadata_json" jsonb,
        CONSTRAINT "CHK_email_delivery_logs_category"
          CHECK ("category" IN ('INVITATION','ADMIN_TEST','SYSTEM')),
        CONSTRAINT "CHK_email_delivery_logs_status"
          CHECK ("status" IN ('ENVOYE','ECHEC')),
        CONSTRAINT "PK_email_delivery_logs" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_email_delivery_logs_status_created"
        ON "accounting"."email_delivery_logs" ("status", "created_at_utc");
      CREATE INDEX "IDX_email_delivery_logs_recipient"
        ON "accounting"."email_delivery_logs" ("recipient");
      CREATE INDEX "IDX_email_delivery_logs_org_created"
        ON "accounting"."email_delivery_logs" ("organization_id", "created_at_utc");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_email_delivery_logs_org_created";
      DROP INDEX IF EXISTS "accounting"."IDX_email_delivery_logs_recipient";
      DROP INDEX IF EXISTS "accounting"."IDX_email_delivery_logs_status_created";
      DROP TABLE IF EXISTS "accounting"."email_delivery_logs";
    `);
  }
}
