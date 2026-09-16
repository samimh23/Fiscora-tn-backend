import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiAssistantRag1784383000000 implements MigrationInterface {
  name = 'AiAssistantRag1784383000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    await queryRunner.query(`
      CREATE TABLE "accounting"."ai_knowledge_chunks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz,
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "source_type" varchar(40) NOT NULL,
        "source_id" varchar(200) NOT NULL,
        "source_name" varchar(300) NOT NULL,
        "page_number" integer,
        "chunk_index" integer NOT NULL,
        "content" text NOT NULL,
        "content_hash" char(64) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "embedding" vector(768) NOT NULL,
        "search_vector" tsvector GENERATED ALWAYS AS (
          to_tsvector('simple', coalesce("source_name", '') || ' ' || coalesce("content", ''))
        ) STORED,
        CONSTRAINT "PK_ai_knowledge_chunks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_knowledge_chunks_organization"
          FOREIGN KEY ("organization_id")
          REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_knowledge_chunks_dossier"
          FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_ai_knowledge_chunks_source"
          UNIQUE ("organization_id", "dossier_id", "source_type", "source_id", "chunk_index")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_knowledge_chunks_scope"
        ON "accounting"."ai_knowledge_chunks" ("organization_id", "dossier_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_knowledge_chunks_search"
        ON "accounting"."ai_knowledge_chunks" USING gin ("search_vector")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_knowledge_chunks_embedding"
        ON "accounting"."ai_knowledge_chunks"
        USING hnsw ("embedding" vector_cosine_ops)
    `);
    await queryRunner.query(`
      CREATE TABLE "accounting"."ai_chat_turns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "question" text NOT NULL,
        "answer" text NOT NULL,
        "citations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "model_name" varchar(160) NOT NULL,
        "usage" jsonb,
        CONSTRAINT "PK_ai_chat_turns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_chat_turns_organization"
          FOREIGN KEY ("organization_id")
          REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_chat_turns_dossier"
          FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_chat_turns_user"
          FOREIGN KEY ("user_id")
          REFERENCES "accounting"."users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_chat_turns_scope"
        ON "accounting"."ai_chat_turns" ("organization_id", "dossier_id", "created_at_utc" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "accounting"."ai_chat_turns"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "accounting"."ai_knowledge_chunks"',
    );
  }
}
