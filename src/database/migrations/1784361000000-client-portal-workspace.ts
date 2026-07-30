import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientPortalWorkspace1784361000000 implements MigrationInterface {
  name = 'ClientPortalWorkspace1784361000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."client_portal_approvals" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "resource_type" varchar(40) NOT NULL,
        "resource_id" varchar(120) NOT NULL,
        "version" varchar(80) NOT NULL DEFAULT '1',
        "label" varchar(300) NOT NULL,
        "decision" varchar(20) NOT NULL,
        "comment" text,
        "ip_address" varchar(80),
        "user_agent" varchar(500),
        CONSTRAINT "UQ_client_portal_approval"
          UNIQUE ("dossier_id","user_id","resource_type","resource_id","version"),
        CONSTRAINT "CHK_client_portal_approval_resource"
          CHECK ("resource_type" IN ('DECLARATION_FISCALE','ETATS_FINANCIERS','SYNTHESE_PAIE','AUTRE_DOCUMENT')),
        CONSTRAINT "CHK_client_portal_approval_decision"
          CHECK ("decision" IN ('APPROUVE','REJETE')),
        CONSTRAINT "FK_client_portal_approval_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_portal_approval_user" FOREIGN KEY ("user_id")
          REFERENCES "accounting"."users"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_client_portal_approval_history"
        ON "accounting"."client_portal_approvals" ("organization_id","dossier_id","created_at_utc");

      CREATE TABLE "accounting"."client_notification_preferences" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "user_id" uuid NOT NULL UNIQUE,
        "email_messages" boolean NOT NULL DEFAULT true,
        "email_deadlines" boolean NOT NULL DEFAULT true,
        "email_documents" boolean NOT NULL DEFAULT true,
        "weekly_summary" boolean NOT NULL DEFAULT true,
        "preferred_language" varchar(5) NOT NULL DEFAULT 'fr',
        CONSTRAINT "FK_client_notification_preferences_user" FOREIGN KEY ("user_id")
          REFERENCES "accounting"."users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "accounting"."client_notification_preferences";
      DROP TABLE IF EXISTS "accounting"."client_portal_approvals";
    `);
  }
}
