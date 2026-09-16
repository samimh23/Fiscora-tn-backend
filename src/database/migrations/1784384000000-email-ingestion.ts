import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailIngestion1784384000000 implements MigrationInterface {
  name = 'EmailIngestion1784384000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."organizations"
        ADD COLUMN "email_ingestion_key" varchar(32);
      UPDATE "accounting"."organizations"
        SET "email_ingestion_key" = lower(substr(md5("id"::text || clock_timestamp()::text || random()::text), 1, 24));
      ALTER TABLE "accounting"."organizations"
        ALTER COLUMN "email_ingestion_key" SET NOT NULL,
        ALTER COLUMN "email_ingestion_key" SET DEFAULT replace(uuid_generate_v4()::text, '-', '');
      CREATE UNIQUE INDEX "UQ_organizations_email_ingestion_key"
        ON "accounting"."organizations" ("email_ingestion_key");

      ALTER TABLE "accounting"."client_dossiers"
        ADD COLUMN "email_ingestion_key" varchar(32);
      UPDATE "accounting"."client_dossiers"
        SET "email_ingestion_key" = lower(substr(md5("id"::text || clock_timestamp()::text || random()::text), 1, 24));
      ALTER TABLE "accounting"."client_dossiers"
        ALTER COLUMN "email_ingestion_key" SET NOT NULL,
        ALTER COLUMN "email_ingestion_key" SET DEFAULT replace(uuid_generate_v4()::text, '-', '');
      CREATE UNIQUE INDEX "UQ_client_dossiers_email_ingestion_key"
        ON "accounting"."client_dossiers" ("email_ingestion_key");

      CREATE TABLE "accounting"."inbound_email_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz,
        "provider_event_id" varchar(200) NOT NULL,
        "provider_message_id" varchar(500),
        "organization_id" uuid,
        "dossier_id" uuid,
        "sender_email" varchar(320) NOT NULL,
        "sender_name" varchar(200),
        "subject" varchar(500),
        "recipient_addresses" text[] NOT NULL,
        "received_at_utc" timestamptz NOT NULL,
        "status" varchar(20) NOT NULL,
        "routing_reason" varchar(500),
        "failure_reason" text,
        "attachment_count" integer NOT NULL DEFAULT 0,
        "imported_count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_inbound_email_messages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inbound_email_provider_event" UNIQUE ("provider_event_id"),
        CONSTRAINT "FK_inbound_email_organization" FOREIGN KEY ("organization_id")
          REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inbound_email_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_inbound_email_status" CHECK ("status" IN ('RECUE','A_CLASSER','IMPORTEE','PARTIELLE','REJETEE'))
      );
      CREATE INDEX "IDX_inbound_email_queue"
        ON "accounting"."inbound_email_messages" ("organization_id", "status", "received_at_utc");

      CREATE TABLE "accounting"."inbound_email_attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz,
        "message_id" uuid NOT NULL,
        "original_name" varchar(300) NOT NULL,
        "mime_type" varchar(150) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "object_key" varchar(1000),
        "status" varchar(20) NOT NULL,
        "malware_signature" varchar(300),
        "failure_reason" text,
        "document_id" uuid,
        CONSTRAINT "PK_inbound_email_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inbound_attachment_message" FOREIGN KEY ("message_id")
          REFERENCES "accounting"."inbound_email_messages"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_inbound_attachment_status" CHECK ("status" IN ('SAIN','NON_ANALYSE','INFECTE','ERREUR','NON_SUPPORTE','IMPORTE'))
      );
      CREATE INDEX "IDX_inbound_email_attachments_message"
        ON "accounting"."inbound_email_attachments" ("message_id", "status");

      ALTER TABLE "accounting"."accounting_documents"
        ALTER COLUMN "uploaded_by_user_id" DROP NOT NULL,
        ADD COLUMN "ingestion_source" varchar(20) NOT NULL DEFAULT 'UPLOAD',
        ADD COLUMN "source_sender_email" varchar(320),
        ADD COLUMN "source_sender_name" varchar(200),
        ADD COLUMN "source_subject" varchar(500),
        ADD COLUMN "source_message_id" varchar(500),
        ADD COLUMN "inbound_email_id" uuid,
        ADD CONSTRAINT "CHK_document_ingestion_source" CHECK ("ingestion_source" IN ('UPLOAD','EMAIL')),
        ADD CONSTRAINT "FK_document_inbound_email" FOREIGN KEY ("inbound_email_id")
          REFERENCES "accounting"."inbound_email_messages"("id") ON DELETE SET NULL;

      ALTER TABLE "accounting"."inbound_email_attachments"
        ADD CONSTRAINT "FK_inbound_attachment_document" FOREIGN KEY ("document_id")
          REFERENCES "accounting"."accounting_documents"("id") ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."inbound_email_attachments"
        DROP CONSTRAINT IF EXISTS "FK_inbound_attachment_document";
      ALTER TABLE "accounting"."accounting_documents"
        DROP CONSTRAINT IF EXISTS "FK_document_inbound_email",
        DROP CONSTRAINT IF EXISTS "CHK_document_ingestion_source",
        DROP COLUMN IF EXISTS "inbound_email_id",
        DROP COLUMN IF EXISTS "source_message_id",
        DROP COLUMN IF EXISTS "source_subject",
        DROP COLUMN IF EXISTS "source_sender_name",
        DROP COLUMN IF EXISTS "source_sender_email",
        DROP COLUMN IF EXISTS "ingestion_source";
      DELETE FROM "accounting"."accounting_documents"
        WHERE "uploaded_by_user_id" IS NULL;
      ALTER TABLE "accounting"."accounting_documents"
        ALTER COLUMN "uploaded_by_user_id" SET NOT NULL;
      DROP TABLE IF EXISTS "accounting"."inbound_email_attachments";
      DROP TABLE IF EXISTS "accounting"."inbound_email_messages";
      DROP INDEX IF EXISTS "accounting"."UQ_client_dossiers_email_ingestion_key";
      ALTER TABLE "accounting"."client_dossiers" DROP COLUMN IF EXISTS "email_ingestion_key";
      DROP INDEX IF EXISTS "accounting"."UQ_organizations_email_ingestion_key";
      ALTER TABLE "accounting"."organizations" DROP COLUMN IF EXISTS "email_ingestion_key";
    `);
  }
}
