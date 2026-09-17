import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientCommercialWorkflow1784387000000 implements MigrationInterface {
  name = 'ClientCommercialWorkflow1784387000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "accounting"."permissions" ("name", "description") VALUES
        ('commercial_documents.view', 'Consulter les documents commerciaux du dossier'),
        ('commercial_documents.manage', 'Créer et émettre les documents commerciaux du dossier')
      ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description";

      INSERT INTO "accounting"."role_permissions" ("role_id", "permission_name")
      SELECT role."id", permission."name"
      FROM "accounting"."roles" AS role
      CROSS JOIN (VALUES
        ('commercial_documents.view'),
        ('commercial_documents.manage')
      ) AS permission("name")
      WHERE role."normalized_name" IN ('PROPRIÉTAIRE', 'COLLABORATEUR', 'PORTAIL CLIENT')
      ON CONFLICT DO NOTHING;

      INSERT INTO "accounting"."role_permissions" ("role_id", "permission_name")
      SELECT role."id", permission."name"
      FROM "accounting"."roles" AS role
      CROSS JOIN (VALUES
        ('third_parties.view'),
        ('third_parties.manage')
      ) AS permission("name")
      WHERE role."normalized_name" = 'PORTAIL CLIENT'
      ON CONFLICT DO NOTHING;

      ALTER TABLE "accounting"."commercial_documents"
        DROP CONSTRAINT "CHK_commercial_document_kind";
      ALTER TABLE "accounting"."commercial_documents"
        ADD CONSTRAINT "CHK_commercial_document_kind"
        CHECK ("kind" IN ('DEVIS','COMMANDE','BON_LIVRAISON','BON_RECEPTION','FACTURE'));

      ALTER TABLE "accounting"."commercial_documents"
        ADD COLUMN "accounting_document_id" uuid;
      ALTER TABLE "accounting"."commercial_documents"
        ADD CONSTRAINT "FK_commercial_document_accounting_document"
        FOREIGN KEY ("accounting_document_id")
        REFERENCES "accounting"."accounting_documents"("id") ON DELETE SET NULL;
      CREATE UNIQUE INDEX "UQ_commercial_document_accounting_document"
        ON "accounting"."commercial_documents" ("accounting_document_id")
        WHERE "accounting_document_id" IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."UQ_commercial_document_accounting_document";
      ALTER TABLE "accounting"."commercial_documents"
        DROP CONSTRAINT IF EXISTS "FK_commercial_document_accounting_document";
      ALTER TABLE "accounting"."commercial_documents"
        DROP COLUMN IF EXISTS "accounting_document_id";
      ALTER TABLE "accounting"."commercial_documents"
        DROP CONSTRAINT "CHK_commercial_document_kind";
      ALTER TABLE "accounting"."commercial_documents"
        ADD CONSTRAINT "CHK_commercial_document_kind"
        CHECK ("kind" IN ('DEVIS','COMMANDE','BON_LIVRAISON','BON_RECEPTION'));
      DELETE FROM "accounting"."role_permissions" AS role_permission
      USING "accounting"."roles" AS role
      WHERE role_permission."role_id" = role."id"
        AND role."normalized_name" = 'PORTAIL CLIENT'
        AND role_permission."permission_name" IN ('third_parties.view','third_parties.manage');
      DELETE FROM "accounting"."role_permissions"
      WHERE "permission_name" IN ('commercial_documents.view','commercial_documents.manage');
      DELETE FROM "accounting"."permissions"
      WHERE "name" IN ('commercial_documents.view','commercial_documents.manage');
    `);
  }
}
