import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * French, accent-insensitive search for the assistant. Purely additive: the
 * existing `search_vector` column and its index stay untouched, so reverting
 * the application code (or this migration) leaves retrieval as it was.
 */
export class AssistantFrenchSearch1791600000000 implements MigrationInterface {
  name = 'AssistantFrenchSearch1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public',
    );
    await queryRunner.query(
      'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public',
    );
    // unaccent() is only STABLE; a generated column needs an IMMUTABLE wrapper
    // that names its dictionary explicitly, wherever the extension lives.
    await queryRunner.query(`
      DO $$
      DECLARE extension_schema text;
      BEGIN
        SELECT namespace.nspname INTO extension_schema
        FROM pg_extension extension
        INNER JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
        WHERE extension.extname = 'unaccent';
        EXECUTE format(
          'CREATE OR REPLACE FUNCTION accounting.immutable_unaccent(value text)
             RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
             AS $body$ SELECT %I.unaccent(%L::regdictionary, value) $body$',
          extension_schema,
          format('%I.unaccent', extension_schema)
        );
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting"."ai_knowledge_chunks"
        ADD COLUMN "search_vector_fr" tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('french', accounting.immutable_unaccent(coalesce("source_name", ''))), 'A')
          || to_tsvector('french', accounting.immutable_unaccent(coalesce("content", '')))
        ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_knowledge_chunks_search_fr"
        ON "accounting"."ai_knowledge_chunks" USING gin ("search_vector_fr")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "accounting"."IDX_ai_knowledge_chunks_search_fr"',
    );
    await queryRunner.query(
      'ALTER TABLE "accounting"."ai_knowledge_chunks" DROP COLUMN IF EXISTS "search_vector_fr"',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS accounting.immutable_unaccent(text)',
    );
    // The unaccent and pg_trgm extensions are left installed: they are
    // harmless on their own and other objects may have started to use them.
  }
}
