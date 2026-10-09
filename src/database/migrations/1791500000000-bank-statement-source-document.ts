import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankStatementSourceDocument1791500000000 implements MigrationInterface {
  name = 'BankStatementSourceDocument1791500000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE accounting.bank_statements
      ADD COLUMN source_document_id uuid REFERENCES accounting.accounting_documents(id) ON DELETE SET NULL`);
    // Repair old links only when filename, tenant, period and balances agree,
    // and the match is unique in BOTH directions. Never guess from a filename alone.
    await runner.query(`WITH candidates AS (
      SELECT b.id AS statement_id, d.id AS document_id,
        count(*) OVER (PARTITION BY b.id) AS document_count,
        count(*) OVER (PARTITION BY d.id) AS statement_count
      FROM accounting.bank_statements b
      JOIN accounting.accounting_documents d
        ON d.organization_id = b.organization_id AND d.dossier_id = b.dossier_id
        AND d.original_name = b.source_file_name
      WHERE d.deleted_at_utc IS NULL AND d.extraction_status = 'VALIDEE'
        AND d.extracted_data->>'document_type' = 'bank_statement'
        AND d.extracted_data->'bank_statement'->>'period_start' = b.period_start::text
        AND d.extracted_data->'bank_statement'->>'period_end' = b.period_end::text
        AND CASE WHEN d.extracted_data->'bank_statement'->>'opening_balance' ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (d.extracted_data->'bank_statement'->>'opening_balance')::numeric END = b.opening_balance
        AND CASE WHEN d.extracted_data->'bank_statement'->>'closing_balance' ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (d.extracted_data->'bank_statement'->>'closing_balance')::numeric END = b.closing_balance
    ) UPDATE accounting.bank_statements b SET source_document_id = c.document_id
      FROM candidates c WHERE b.id = c.statement_id AND c.document_count = 1 AND c.statement_count = 1`);
    await runner.query(`CREATE UNIQUE INDEX bank_statements_source_document_unique
      ON accounting.bank_statements(source_document_id) WHERE source_document_id IS NOT NULL`);
    await runner.query(`UPDATE accounting.accounting_documents d SET processing_status = 'TRAITE'
      FROM accounting.bank_statements b WHERE b.source_document_id = d.id
        AND d.organization_id = b.organization_id AND d.dossier_id = b.dossier_id`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      `DROP INDEX accounting.bank_statements_source_document_unique`,
    );
    await runner.query(
      `ALTER TABLE accounting.bank_statements DROP COLUMN source_document_id`,
    );
  }
}
