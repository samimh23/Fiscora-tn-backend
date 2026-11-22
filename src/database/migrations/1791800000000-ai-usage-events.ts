import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One row per call to an AI service (Gemini, embeddings, ranking, NuExtract,
 * PaddleOCR), so the platform admin can follow usage, errors, latency and the
 * estimated cost of the AI features. Holds no document or question content.
 * Additive and reversible.
 */
export class AiUsageEvents1791800000000 implements MigrationInterface {
  name = 'AiUsageEvents1791800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."ai_usage_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "feature" varchar(40) NOT NULL,
        "provider" varchar(40) NOT NULL,
        "model" varchar(160) NOT NULL,
        "status" varchar(12) NOT NULL,
        "http_status" smallint,
        "latency_ms" integer NOT NULL,
        "retries" smallint NOT NULL DEFAULT 0,
        "input_tokens" integer NOT NULL DEFAULT 0,
        "output_tokens" integer NOT NULL DEFAULT 0,
        "units" integer NOT NULL DEFAULT 0,
        "estimated_cost_usd" numeric(14, 8) NOT NULL DEFAULT 0,
        "error" varchar(300),
        CONSTRAINT "PK_ai_usage_events" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ai_usage_events_status"
          CHECK ("status" IN ('OK', 'ERROR', 'FALLBACK'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_usage_events_time"
        ON "accounting"."ai_usage_events" ("created_at_utc" DESC, "feature")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "accounting"."ai_usage_events"',
    );
  }
}
