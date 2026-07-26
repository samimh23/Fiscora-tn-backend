import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class TaskManagement1784220000000 implements MigrationInterface {
  name = 'TaskManagement1784220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "accounting"."work_tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "obligation_id" uuid,
        "type" character varying(20) NOT NULL,
        "title" character varying(250) NOT NULL,
        "description" text,
        "due_on" date NOT NULL,
        "priority" character varying(20) NOT NULL DEFAULT 'NORMALE',
        "status" character varying(30) NOT NULL DEFAULT 'A_FAIRE',
        "assignee_membership_id" uuid,
        "created_by_user_id" uuid NOT NULL,
        "completed_at_utc" TIMESTAMP WITH TIME ZONE,
        "completed_by_user_id" uuid,
        "last_comment" text,
        CONSTRAINT "PK_work_tasks" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_work_tasks_obligation" ON "accounting"."work_tasks" ("obligation_id") WHERE "obligation_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_work_tasks_org_due_status" ON "accounting"."work_tasks" ("organization_id", "due_on", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_work_tasks_dossier_status" ON "accounting"."work_tasks" ("dossier_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_work_tasks_assignee_status" ON "accounting"."work_tasks" ("assignee_membership_id", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE "accounting"."task_checklist_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "task_id" uuid NOT NULL,
        "label" character varying(300) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "is_completed" boolean NOT NULL DEFAULT false,
        "completed_at_utc" TIMESTAMP WITH TIME ZONE,
        "completed_by_user_id" uuid,
        CONSTRAINT "PK_task_checklist_items" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_task_checklist_task_position" ON "accounting"."task_checklist_items" ("task_id", "position")`,
    );

    await queryRunner.query(
      `CREATE TABLE "accounting"."task_comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "task_id" uuid NOT NULL,
        "author_user_id" uuid NOT NULL,
        "body" text NOT NULL,
        CONSTRAINT "PK_task_comments" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_task_comments_task_created" ON "accounting"."task_comments" ("task_id", "created_at_utc")`,
    );

    await queryRunner.query(
      `ALTER TABLE "accounting"."work_tasks" ADD CONSTRAINT "FK_work_tasks_org" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."work_tasks" ADD CONSTRAINT "FK_work_tasks_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."work_tasks" ADD CONSTRAINT "FK_work_tasks_obligation" FOREIGN KEY ("obligation_id") REFERENCES "accounting"."obligation_instances"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."work_tasks" ADD CONSTRAINT "FK_work_tasks_assignee" FOREIGN KEY ("assignee_membership_id") REFERENCES "accounting"."organization_memberships"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."task_checklist_items" ADD CONSTRAINT "FK_task_checklist_task" FOREIGN KEY ("task_id") REFERENCES "accounting"."work_tasks"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."task_comments" ADD CONSTRAINT "FK_task_comments_task" FOREIGN KEY ("task_id") REFERENCES "accounting"."work_tasks"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."task_comments" ADD CONSTRAINT "FK_task_comments_author" FOREIGN KEY ("author_user_id") REFERENCES "accounting"."users"("id") ON DELETE RESTRICT`,
    );

    for (const [name, description] of permissionSeed.filter(([name]) =>
      name.startsWith('tasks.'),
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
      `INSERT INTO "accounting"."work_tasks"
       ("organization_id", "dossier_id", "obligation_id", "type", "title",
        "description", "due_on", "priority", "status", "assignee_membership_id",
        "created_by_user_id")
       SELECT oi."organization_id", oi."dossier_id", oi."id", 'OBLIGATION',
              ot."name", 'Tâche créée automatiquement depuis l''obligation fiscale.',
              oi."due_on", 'HAUTE',
              CASE oi."status"
                WHEN 'EN_COURS' THEN 'EN_COURS'
                WHEN 'PRETE_POUR_REVISION' THEN 'PRETE_POUR_REVISION'
                WHEN 'VALIDEE' THEN 'TERMINEE'
                WHEN 'DEPOSEE' THEN 'TERMINEE'
                WHEN 'PAYEE' THEN 'TERMINEE'
                ELSE 'A_FAIRE'
              END,
              oi."assigned_membership_id",
              COALESCE(oi."filed_by_user_id", oi."validated_by_user_id",
                (SELECT om."user_id"
                 FROM "accounting"."organization_memberships" om
                 WHERE om."organization_id" = oi."organization_id"
                 ORDER BY om."created_at_utc" ASC LIMIT 1))
       FROM "accounting"."obligation_instances" oi
       INNER JOIN "accounting"."obligation_templates" ot ON ot."id" = oi."template_id"
       ON CONFLICT ("obligation_id") WHERE "obligation_id" IS NOT NULL DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "accounting"."role_permissions" WHERE "permission_name" LIKE 'tasks.%'`,
    );
    await queryRunner.query(
      `DELETE FROM "accounting"."permissions" WHERE "name" LIKE 'tasks.%'`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."task_comments" DROP CONSTRAINT "FK_task_comments_author"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."task_comments" DROP CONSTRAINT "FK_task_comments_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."task_checklist_items" DROP CONSTRAINT "FK_task_checklist_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."work_tasks" DROP CONSTRAINT "FK_work_tasks_assignee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."work_tasks" DROP CONSTRAINT "FK_work_tasks_obligation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."work_tasks" DROP CONSTRAINT "FK_work_tasks_dossier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."work_tasks" DROP CONSTRAINT "FK_work_tasks_org"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."task_comments"`);
    await queryRunner.query(`DROP TABLE "accounting"."task_checklist_items"`);
    await queryRunner.query(`DROP TABLE "accounting"."work_tasks"`);
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
