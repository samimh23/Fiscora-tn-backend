import { MigrationInterface, QueryRunner } from 'typeorm';

export class TeamProductivity1784330000000 implements MigrationInterface {
  name = 'TeamProductivity1784330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."dossier_assignments"
        ADD COLUMN "monthly_time_budget_minutes" integer,
        ADD CONSTRAINT "CHK_dossier_assignment_time_budget"
          CHECK ("monthly_time_budget_minutes" IS NULL OR "monthly_time_budget_minutes" BETWEEN 0 AND 100000);

      CREATE TABLE "accounting"."cabinet_member_cost_rates" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "membership_id" uuid NOT NULL,
        "compensation_type" varchar(20) NOT NULL,
        "pay_rate_amount" numeric(15,3) NOT NULL,
        "employer_cost_rate_amount" numeric(15,3) NOT NULL,
        "monthly_target_minutes" integer NOT NULL DEFAULT 9600,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "UQ_cabinet_member_cost_rate" UNIQUE ("membership_id","effective_from"),
        CONSTRAINT "CHK_member_cost_compensation_type" CHECK ("compensation_type" IN ('HORAIRE','MENSUELLE')),
        CONSTRAINT "CHK_member_cost_amounts" CHECK ("pay_rate_amount" >= 0 AND "employer_cost_rate_amount" >= "pay_rate_amount"),
        CONSTRAINT "CHK_member_cost_target" CHECK ("monthly_target_minutes" BETWEEN 60 AND 44640),
        CONSTRAINT "CHK_member_cost_dates" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
        CONSTRAINT "FK_member_cost_membership" FOREIGN KEY ("membership_id")
          REFERENCES "accounting"."organization_memberships"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_cabinet_member_cost_rates"
        ON "accounting"."cabinet_member_cost_rates" ("organization_id","membership_id","effective_from","effective_to");

      CREATE TABLE "accounting"."time_entries" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "membership_id" uuid NOT NULL,
        "task_id" uuid,
        "work_date" date NOT NULL,
        "duration_minutes" integer NOT NULL,
        "billable" boolean NOT NULL DEFAULT true,
        "description" varchar(500) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'BROUILLON',
        "submitted_at_utc" timestamptz,
        "reviewed_at_utc" timestamptz,
        "reviewed_by_user_id" uuid,
        "review_comment" text,
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "CHK_time_entry_duration" CHECK ("duration_minutes" BETWEEN 1 AND 1440),
        CONSTRAINT "CHK_time_entry_description" CHECK (length(trim("description")) > 0),
        CONSTRAINT "CHK_time_entry_status" CHECK ("status" IN ('BROUILLON','SOUMIS','APPROUVE','REJETE')),
        CONSTRAINT "FK_time_entry_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_time_entry_membership" FOREIGN KEY ("membership_id")
          REFERENCES "accounting"."organization_memberships"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_time_entry_task" FOREIGN KEY ("task_id")
          REFERENCES "accounting"."work_tasks"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_time_entries_dossier"
        ON "accounting"."time_entries" ("organization_id","dossier_id","work_date","status");
      CREATE INDEX "IDX_time_entries_member"
        ON "accounting"."time_entries" ("organization_id","membership_id","work_date","status");

      INSERT INTO "accounting"."permissions" ("name","description") VALUES
        ('time_tracking.view','Consulter les temps de travail autorisés'),
        ('time_tracking.manage','Saisir et soumettre son temps de travail'),
        ('time_tracking.approve','Approuver ou rejeter les temps de travail'),
        ('team_costs.manage','Gérer les rémunérations et coûts employeur du cabinet'),
        ('profitability.view','Consulter la rentabilité par client et collaborateur')
      ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description";

      INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
      SELECT r."id", p."name"
      FROM "accounting"."roles" r
      CROSS JOIN (VALUES
        ('time_tracking.view'),('time_tracking.manage'),('time_tracking.approve'),
        ('team_costs.manage'),('profitability.view')
      ) AS p("name")
      WHERE r."is_system" = true AND r."normalized_name" IN ('PROPRIÉTAIRE','ADMINISTRATEUR')
      ON CONFLICT DO NOTHING;

      INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
      SELECT r."id", p."name"
      FROM "accounting"."roles" r
      CROSS JOIN (VALUES ('time_tracking.view'),('time_tracking.manage')) AS p("name")
      WHERE r."is_system" = true AND r."normalized_name" IN ('COLLABORATEUR','COMPTABLE')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounting"."role_permissions"
      WHERE "permission_name" IN ('time_tracking.view','time_tracking.manage','time_tracking.approve','team_costs.manage','profitability.view');
      DELETE FROM "accounting"."permissions"
      WHERE "name" IN ('time_tracking.view','time_tracking.manage','time_tracking.approve','team_costs.manage','profitability.view');
      DROP TABLE IF EXISTS "accounting"."time_entries";
      DROP TABLE IF EXISTS "accounting"."cabinet_member_cost_rates";
      ALTER TABLE "accounting"."dossier_assignments"
        DROP CONSTRAINT IF EXISTS "CHK_dossier_assignment_time_budget",
        DROP COLUMN IF EXISTS "monthly_time_budget_minutes";
    `);
  }
}
