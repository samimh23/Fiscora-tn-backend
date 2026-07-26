import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientPortal1784353000000 implements MigrationInterface {
  name = 'ClientPortal1784353000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."client_portal_messages" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "sender_user_id" uuid NOT NULL,
        "sender_role" varchar(100) NOT NULL,
        "body" text NOT NULL,
        "client_read_at_utc" timestamptz,
        "cabinet_read_at_utc" timestamptz,
        CONSTRAINT "FK_client_portal_message_org" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_portal_message_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_portal_message_sender" FOREIGN KEY ("sender_user_id") REFERENCES "accounting"."users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_client_portal_message_body" CHECK (char_length(trim("body")) BETWEEN 1 AND 4000)
      );
      CREATE INDEX "IDX_client_portal_messages_dossier"
        ON "accounting"."client_portal_messages" ("organization_id","dossier_id","created_at_utc");

      INSERT INTO "accounting"."permissions" ("name","description") VALUES
        ('client_portal.view','Accéder au portail client sécurisé'),
        ('client_portal.message','Échanger des messages dans le portail client')
      ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description";

      INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
      SELECT r."id", p."name"
      FROM "accounting"."roles" r
      CROSS JOIN (VALUES ('client_portal.view'),('client_portal.message')) AS p("name")
      WHERE r."normalized_name" IN ('PROPRIÉTAIRE','COLLABORATEUR','PORTAIL CLIENT')
      ON CONFLICT DO NOTHING;

      INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
      SELECT r."id", p."name"
      FROM "accounting"."roles" r
      CROSS JOIN (VALUES
        ('organization.view'),('dossiers.view'),('documents.view'),('documents.upload'),
        ('notifications.view'),('obligations.view'),('declarations.view'),('billing.view'),
        ('business_invoices.view'),('payments.view'),('financial_statements.view'),
        ('client_portal.view'),('client_portal.message')
      ) AS p("name")
      WHERE r."normalized_name" = 'PORTAIL CLIENT'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounting"."role_permissions"
      WHERE "permission_name" IN ('client_portal.view','client_portal.message');
      DELETE FROM "accounting"."permissions"
      WHERE "name" IN ('client_portal.view','client_portal.message');
      DROP TABLE IF EXISTS "accounting"."client_portal_messages";
    `);
  }
}
