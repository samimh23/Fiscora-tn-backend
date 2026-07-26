import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  allPermissions,
  clientPortalPermissions,
  collaboratorPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class ClientDossiers1784200000000 implements MigrationInterface {
  name = 'ClientDossiers1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "accounting"."client_dossiers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "legal_name" character varying(200) NOT NULL,
        "trade_name" character varying(200),
        "tax_identifier" character varying(100),
        "normalized_tax_identifier" character varying(100),
        "rne_number" character varying(100),
        "vat_code" character varying(50),
        "customs_code" character varying(100),
        "legal_form" character varying(40) NOT NULL,
        "tax_regime" character varying(40) NOT NULL,
        "is_vat_subject" boolean NOT NULL DEFAULT false,
        "has_vat_suspension" boolean NOT NULL DEFAULT false,
        "is_totally_exporting" boolean NOT NULL DEFAULT false,
        "activity_sector" character varying(200),
        "cnss_employer_number" character varying(100),
        "employee_count" integer NOT NULL DEFAULT 0,
        "fiscal_year_start_month" smallint NOT NULL DEFAULT 1,
        "fiscal_year_start_day" smallint NOT NULL DEFAULT 1,
        "monthly_fee" numeric(15,3),
        "annual_fee" numeric(15,3),
        "billing_frequency" character varying(30) NOT NULL DEFAULT 'MENSUELLE',
        "internal_notes" text,
        "tags" text array NOT NULL DEFAULT '{}',
        "status" character varying(20) NOT NULL DEFAULT 'ACTIF',
        "archived_at_utc" TIMESTAMP WITH TIME ZONE,
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "CHK_dossier_employee_count" CHECK ("employee_count" >= 0),
        CONSTRAINT "CHK_dossier_fiscal_month" CHECK ("fiscal_year_start_month" BETWEEN 1 AND 12),
        CONSTRAINT "CHK_dossier_fiscal_day" CHECK ("fiscal_year_start_day" BETWEEN 1 AND 31),
        CONSTRAINT "PK_client_dossiers" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_client_dossiers_org_status" ON "accounting"."client_dossiers" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_client_dossiers_org_tax" ON "accounting"."client_dossiers" ("organization_id", "normalized_tax_identifier") WHERE "normalized_tax_identifier" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "accounting"."dossier_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "full_name" character varying(160) NOT NULL,
        "role" character varying(120),
        "phone" character varying(50),
        "email" character varying(320),
        "whatsapp_number" character varying(50),
        "is_primary" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_dossier_contacts" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dossier_contacts_org_dossier" ON "accounting"."dossier_contacts" ("organization_id", "dossier_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "accounting"."dossier_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "membership_id" uuid NOT NULL,
        "assignment_role" character varying(20) NOT NULL,
        "assigned_by_user_id" uuid NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_dossier_assignment_member" UNIQUE ("dossier_id", "membership_id"),
        CONSTRAINT "PK_dossier_assignments" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dossier_assignments_member" ON "accounting"."dossier_assignments" ("organization_id", "membership_id", "is_active")`,
    );

    await queryRunner.query(
      `ALTER TABLE "accounting"."client_dossiers" ADD CONSTRAINT "FK_client_dossiers_org" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_contacts" ADD CONSTRAINT "FK_dossier_contacts_org" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_contacts" ADD CONSTRAINT "FK_dossier_contacts_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_assignments" ADD CONSTRAINT "FK_dossier_assignments_org" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_assignments" ADD CONSTRAINT "FK_dossier_assignments_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_assignments" ADD CONSTRAINT "FK_dossier_assignments_membership" FOREIGN KEY ("membership_id") REFERENCES "accounting"."organization_memberships"("id") ON DELETE CASCADE`,
    );

    for (const [name, description] of permissionSeed.filter(([name]) =>
      name.startsWith('dossiers.'),
    )) {
      await queryRunner.query(
        `INSERT INTO "accounting"."permissions" ("name", "description") VALUES ($1, $2) ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description"`,
        [name, description],
      );
    }

    await this.renameRole(queryRunner, 'ADMINISTRATEUR', SystemRoleNames.Owner);
    await this.renameRole(
      queryRunner,
      'COMPTABLE',
      SystemRoleNames.Collaborator,
    );
    await this.renameRole(queryRunner, 'CLIENT', SystemRoleNames.ClientPortal);
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.Owner,
      allPermissions,
    );
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.Collaborator,
      collaboratorPermissions,
    );
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.ClientPortal,
      clientPortalPermissions,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.renameRole(
      queryRunner,
      SystemRoleNames.ClientPortal.toUpperCase(),
      'Client',
    );
    await this.renameRole(
      queryRunner,
      SystemRoleNames.Collaborator.toUpperCase(),
      'Comptable',
    );
    await this.renameRole(
      queryRunner,
      SystemRoleNames.Owner.toUpperCase(),
      'Administrateur',
    );
    await queryRunner.query(
      `DELETE FROM "accounting"."role_permissions" WHERE "permission_name" LIKE 'dossiers.%'`,
    );
    await queryRunner.query(
      `DELETE FROM "accounting"."permissions" WHERE "name" LIKE 'dossiers.%'`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_assignments" DROP CONSTRAINT "FK_dossier_assignments_membership"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_assignments" DROP CONSTRAINT "FK_dossier_assignments_dossier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_assignments" DROP CONSTRAINT "FK_dossier_assignments_org"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_contacts" DROP CONSTRAINT "FK_dossier_contacts_dossier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."dossier_contacts" DROP CONSTRAINT "FK_dossier_contacts_org"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."client_dossiers" DROP CONSTRAINT "FK_client_dossiers_org"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."dossier_assignments"`);
    await queryRunner.query(`DROP TABLE "accounting"."dossier_contacts"`);
    await queryRunner.query(`DROP TABLE "accounting"."client_dossiers"`);
  }

  private async renameRole(
    queryRunner: QueryRunner,
    previousNormalizedName: string,
    nextName: string,
  ) {
    await queryRunner.query(
      `UPDATE "accounting"."roles" SET "name" = $1, "normalized_name" = $2 WHERE "normalized_name" = $3`,
      [nextName, nextName.toUpperCase(), previousNormalizedName],
    );
  }

  private async replaceRolePermissions(
    queryRunner: QueryRunner,
    roleName: string,
    permissions: readonly string[],
  ) {
    const normalizedName = roleName.toUpperCase();
    await queryRunner.query(
      `DELETE FROM "accounting"."role_permissions" rp USING "accounting"."roles" r WHERE rp."role_id" = r."id" AND r."normalized_name" = $1`,
      [normalizedName],
    );
    for (const permission of permissions) {
      await queryRunner.query(
        `INSERT INTO "accounting"."role_permissions" ("role_id", "permission_name")
         SELECT "id", $1 FROM "accounting"."roles" WHERE "normalized_name" = $2
         ON CONFLICT DO NOTHING`,
        [permission, normalizedName],
      );
    }
  }
}
