import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class ObligationsEngine1784210000000 implements MigrationInterface {
  name = 'ObligationsEngine1784210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "accounting"."obligation_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid,
        "code" character varying(80) NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "name" character varying(200) NOT NULL,
        "description" text,
        "frequency" character varying(30) NOT NULL,
        "due_day" smallint NOT NULL,
        "due_month_offset" smallint NOT NULL DEFAULT 1,
        "annual_due_month" smallint,
        "physical_person_due_day" smallint,
        "totally_exporting_due_day" smallint,
        "applicability_json" jsonb NOT NULL DEFAULT '{}',
        "effective_from" date NOT NULL,
        "effective_to" date,
        "source_label" character varying(250),
        "source_url" character varying(1000),
        "is_system" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_user_id" uuid,
        CONSTRAINT "CHK_obligation_due_day" CHECK ("due_day" BETWEEN 1 AND 31),
        CONSTRAINT "CHK_obligation_due_offset" CHECK ("due_month_offset" BETWEEN 0 AND 12),
        CONSTRAINT "CHK_obligation_annual_month" CHECK ("annual_due_month" IS NULL OR "annual_due_month" BETWEEN 1 AND 12),
        CONSTRAINT "PK_obligation_templates" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_obligation_templates_org_active" ON "accounting"."obligation_templates" ("organization_id", "is_active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_obligation_templates_code_version" ON "accounting"."obligation_templates" ("code", "version")`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_templates" ADD CONSTRAINT "FK_obligation_templates_org" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `CREATE TABLE "accounting"."obligation_instances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "template_id" uuid NOT NULL,
        "period_year" integer NOT NULL,
        "period_month" smallint,
        "period_quarter" smallint,
        "period_starts_on" date NOT NULL,
        "period_ends_on" date NOT NULL,
        "due_on" date NOT NULL,
        "status" character varying(30) NOT NULL DEFAULT 'NON_COMMENCEE',
        "assigned_membership_id" uuid,
        "validated_at_utc" TIMESTAMP WITH TIME ZONE,
        "validated_by_user_id" uuid,
        "filed_at_utc" TIMESTAMP WITH TIME ZONE,
        "filed_by_user_id" uuid,
        "amount_due" numeric(15,3),
        "amount_paid" numeric(15,3),
        "payment_reference" character varying(200),
        "notes" text,
        "last_comment" text,
        CONSTRAINT "UQ_obligation_instance_period" UNIQUE ("dossier_id", "template_id", "period_starts_on"),
        CONSTRAINT "PK_obligation_instances" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_obligation_instances_org_due_status" ON "accounting"."obligation_instances" ("organization_id", "due_on", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_obligation_instances_dossier_period" ON "accounting"."obligation_instances" ("dossier_id", "period_year", "period_month")`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_instances" ADD CONSTRAINT "FK_obligation_instances_org" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_instances" ADD CONSTRAINT "FK_obligation_instances_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_instances" ADD CONSTRAINT "FK_obligation_instances_template" FOREIGN KEY ("template_id") REFERENCES "accounting"."obligation_templates"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_instances" ADD CONSTRAINT "FK_obligation_instances_assignment" FOREIGN KEY ("assigned_membership_id") REFERENCES "accounting"."organization_memberships"("id") ON DELETE SET NULL`,
    );

    for (const [name, description] of permissionSeed.filter(
      ([name]) =>
        name.startsWith('obligations.') ||
        name.startsWith('obligation_templates.'),
    )) {
      await queryRunner.query(
        `INSERT INTO "accounting"."permissions" ("name", "description") VALUES ($1, $2) ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description"`,
        [name, description],
      );
    }
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.Owner,
      ownerPermissions,
    );
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.Collaborator,
      collaboratorPermissions,
    );

    await queryRunner.query(
      `INSERT INTO "accounting"."obligation_templates"
       ("code", "version", "name", "description", "frequency", "due_day",
        "due_month_offset", "physical_person_due_day", "applicability_json",
        "effective_from", "source_label", "source_url", "is_system", "is_active")
       VALUES
       (
         'DECLARATION_MENSUELLE_REEL', 1, 'Déclaration mensuelle',
         'Déclaration mensuelle des impôts pour les dossiers au régime réel ou réel simplifié.',
         'MENSUELLE', 28, 1, 15,
         '{"taxRegimes":["REEL","REEL_SIMPLIFIE"]}'::jsonb,
         '2026-01-01',
         'Ministère des Finances tunisien — aperçu général sur la fiscalité',
         'https://www.finances.gov.tn/fr/apercu-general-sur-la-fiscalite',
         true, true
       ),
       (
         'DECLARATION_MENSUELLE_FORFAITAIRE_EMPLOYEUR', 1,
         'Déclaration mensuelle — forfaitaire employeur',
         'Retenue à la source et FOPROLOS pour les personnes au régime forfaitaire employant du personnel.',
         'MENSUELLE', 28, 1, 15,
         '{"taxRegimes":["FORFAITAIRE"],"requiresEmployees":true}'::jsonb,
         '2026-01-01',
         'Ministère des Finances tunisien — obligations du régime forfaitaire',
         'https://www.finances.gov.tn/fr/node/955',
         true, true
       ),
       (
         'CNSS_TRIMESTRIELLE_STANDARD', 1, 'Déclaration CNSS trimestrielle',
         'Règle standard : 15 jours après le trimestre ; 25 jours pour une société totalement exportatrice. Les régimes BTP et agricole nécessitent un modèle spécifique.',
         'TRIMESTRIELLE', 15, 1, NULL,
         '{"requiresEmployees":true}'::jsonb,
         '2026-01-01',
         'CNSS — déclaration trimestrielle des salariés et des salaires',
         'https://www.cnss.tn/documents/33103/33861/I16.pdf',
         true, true
       )`,
    );
    await queryRunner.query(
      `UPDATE "accounting"."obligation_templates"
       SET "totally_exporting_due_day" = 25
       WHERE "code" = 'CNSS_TRIMESTRIELLE_STANDARD'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "accounting"."role_permissions" WHERE "permission_name" LIKE 'obligations.%' OR "permission_name" LIKE 'obligation_templates.%'`,
    );
    await queryRunner.query(
      `DELETE FROM "accounting"."permissions" WHERE "name" LIKE 'obligations.%' OR "name" LIKE 'obligation_templates.%'`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_instances" DROP CONSTRAINT "FK_obligation_instances_assignment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_instances" DROP CONSTRAINT "FK_obligation_instances_template"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_instances" DROP CONSTRAINT "FK_obligation_instances_dossier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_instances" DROP CONSTRAINT "FK_obligation_instances_org"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."obligation_templates" DROP CONSTRAINT "FK_obligation_templates_org"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."obligation_instances"`);
    await queryRunner.query(`DROP TABLE "accounting"."obligation_templates"`);
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
