import { MigrationInterface, QueryRunner } from 'typeorm';

export class InAppWorkTracking1784363000000 implements MigrationInterface {
  name = 'InAppWorkTracking1784363000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."work_sessions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "membership_id" uuid NOT NULL,
        "task_id" uuid,
        "description" varchar(500) NOT NULL,
        "billable" boolean NOT NULL DEFAULT true,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "started_at_utc" timestamptz NOT NULL,
        "last_heartbeat_at_utc" timestamptz NOT NULL,
        "stopped_at_utc" timestamptz,
        "active_seconds" integer NOT NULL DEFAULT 0,
        "inactive_seconds" integer NOT NULL DEFAULT 0,
        "heartbeat_count" integer NOT NULL DEFAULT 0,
        "idle_timeout_seconds" integer NOT NULL DEFAULT 120,
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "CHK_work_session_status" CHECK ("status" IN ('ACTIVE','EN_PAUSE','TERMINEE')),
        CONSTRAINT "CHK_work_session_counters" CHECK ("active_seconds" >= 0 AND "inactive_seconds" >= 0 AND "heartbeat_count" >= 0),
        CONSTRAINT "CHK_work_session_description" CHECK (length(trim("description")) > 0),
        CONSTRAINT "FK_work_session_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_work_session_membership" FOREIGN KEY ("membership_id") REFERENCES "accounting"."organization_memberships"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_work_session_task" FOREIGN KEY ("task_id") REFERENCES "accounting"."work_tasks"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_work_sessions_member" ON "accounting"."work_sessions" ("organization_id","membership_id","status");
      CREATE INDEX "IDX_work_sessions_dossier" ON "accounting"."work_sessions" ("organization_id","dossier_id","started_at_utc");
      CREATE UNIQUE INDEX "UQ_work_sessions_open_member" ON "accounting"."work_sessions" ("organization_id","membership_id") WHERE "status" IN ('ACTIVE','EN_PAUSE');

      ALTER TABLE "accounting"."time_entries"
        ADD COLUMN "source" varchar(20) NOT NULL DEFAULT 'MANUEL',
        ADD COLUMN "source_session_id" uuid,
        ADD COLUMN "started_at_utc" timestamptz,
        ADD COLUMN "stopped_at_utc" timestamptz,
        ADD COLUMN "original_duration_minutes" integer,
        ADD COLUMN "correction_reason" text,
        ADD COLUMN "requires_review" boolean NOT NULL DEFAULT false,
        ADD COLUMN "anomaly_code" varchar(50),
        ADD CONSTRAINT "CHK_time_entry_source" CHECK ("source" IN ('MANUEL','AUTOMATIQUE')),
        ADD CONSTRAINT "FK_time_entry_source_session" FOREIGN KEY ("source_session_id") REFERENCES "accounting"."work_sessions"("id") ON DELETE SET NULL;
      CREATE UNIQUE INDEX "UQ_time_entry_source_session" ON "accounting"."time_entries" ("source_session_id") WHERE "source_session_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."UQ_time_entry_source_session";
      ALTER TABLE "accounting"."time_entries"
        DROP CONSTRAINT IF EXISTS "FK_time_entry_source_session",
        DROP CONSTRAINT IF EXISTS "CHK_time_entry_source",
        DROP COLUMN IF EXISTS "anomaly_code",
        DROP COLUMN IF EXISTS "requires_review",
        DROP COLUMN IF EXISTS "correction_reason",
        DROP COLUMN IF EXISTS "original_duration_minutes",
        DROP COLUMN IF EXISTS "stopped_at_utc",
        DROP COLUMN IF EXISTS "started_at_utc",
        DROP COLUMN IF EXISTS "source_session_id",
        DROP COLUMN IF EXISTS "source";
      DROP TABLE IF EXISTS "accounting"."work_sessions";
    `);
  }
}
