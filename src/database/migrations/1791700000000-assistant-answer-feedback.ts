import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets users rate assistant answers (👍 / 👎 and an optional comment) so real
 * questions that fail can be found and fixed. Additive and reversible.
 */
export class AssistantAnswerFeedback1791700000000 implements MigrationInterface {
  name = 'AssistantAnswerFeedback1791700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."ai_chat_turns"
        ADD COLUMN "feedback_rating" smallint,
        ADD COLUMN "feedback_comment" varchar(1000),
        ADD COLUMN "feedback_at_utc" timestamptz,
        ADD CONSTRAINT "CHK_ai_chat_turns_feedback_rating"
          CHECK ("feedback_rating" IS NULL OR "feedback_rating" IN (-1, 1))
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_chat_turns_feedback"
        ON "accounting"."ai_chat_turns" ("organization_id", "feedback_at_utc")
        WHERE "feedback_rating" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "accounting"."IDX_ai_chat_turns_feedback"',
    );
    await queryRunner.query(`
      ALTER TABLE "accounting"."ai_chat_turns"
        DROP CONSTRAINT IF EXISTS "CHK_ai_chat_turns_feedback_rating",
        DROP COLUMN IF EXISTS "feedback_at_utc",
        DROP COLUMN IF EXISTS "feedback_comment",
        DROP COLUMN IF EXISTS "feedback_rating"
    `);
  }
}
