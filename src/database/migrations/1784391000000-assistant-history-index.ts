import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssistantHistoryIndex1784391000000 implements MigrationInterface {
  name = 'AssistantHistoryIndex1784391000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_chat_turns_user_history"
      ON accounting.ai_chat_turns
        (organization_id, dossier_id, user_id, created_at_utc DESC, id DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS accounting."IDX_ai_chat_turns_user_history"
    `);
  }
}
