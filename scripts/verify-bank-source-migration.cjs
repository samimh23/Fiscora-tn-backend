// Disposable localhost database only; all DDL/data changes are rolled back.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { Client } = require('pg');
const path = existsSync(
  `${__dirname}/../dist/src/database/migrations/1791500000000-bank-statement-source-document.js`,
)
  ? '../dist/src/database/migrations/1791500000000-bank-statement-source-document'
  : '../dist/database/migrations/1791500000000-bank-statement-source-document';
const { BankStatementSourceDocument1791500000000 } = require(path);

async function main() {
  assert.equal(process.env.BANK_SOURCE_DISPOSABLE_DB, 'yes');
  const client = new Client({
    host: '127.0.0.1',
    port: 55437,
    user: 'postgres',
    database: 'postgres',
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    assert.equal(
      (await client.query("SELECT to_regnamespace('accounting') AS schema"))
        .rows[0].schema,
      null,
      'Refuse to run against a database containing an accounting schema',
    );
    await client.query(`CREATE SCHEMA accounting;
      CREATE TABLE accounting.accounting_documents(id uuid PRIMARY KEY, organization_id uuid, dossier_id uuid,
        original_name text, deleted_at_utc timestamptz, extraction_status text, extracted_data jsonb, processing_status text);
      CREATE TABLE accounting.bank_statements(id uuid PRIMARY KEY, organization_id uuid, dossier_id uuid,
        source_file_name text, period_start date, period_end date, opening_balance numeric, closing_balance numeric);`);
    const org = randomUUID(),
      dossier = randomUUID();
    const documents = [];
    const statements = [];
    for (const [name, count, overrides] of [
      ['unique', 1, {}],
      ['ambiguous', 2, {}],
      ['other-tenant', 1, { organizationId: randomUUID() }],
      ['pending', 1, { status: 'A_REVOIR' }],
      ['wrong-balance', 1, { balance: '999' }],
      ['deleted', 1, { deleted: '2026-10-09T00:00:00Z' }],
    ]) {
      for (let index = 0; index < count; index++) {
        const id = randomUUID();
        documents.push(id);
        const data = {
          document_type: 'bank_statement',
          bank_statement: {
            period_start: '2026-09-01',
            period_end: '2026-09-30',
            opening_balance: '5000.000',
            closing_balance: overrides.balance ?? '5224.800',
          },
        };
        await client.query(
          'INSERT INTO accounting.accounting_documents VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            id,
            overrides.organizationId ?? org,
            dossier,
            name + '.png',
            overrides.deleted ?? null,
            overrides.status ?? 'VALIDEE',
            data,
            'A_TRAITER',
          ],
        );
      }
      const id = randomUUID();
      statements.push(id);
      await client.query(
        'INSERT INTO accounting.bank_statements VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          org,
          dossier,
          name + '.png',
          '2026-09-01',
          '2026-09-30',
          '5000.000',
          '5224.800',
        ],
      );
    }
    const migration = new BankStatementSourceDocument1791500000000();
    const runner = { query: (sql) => client.query(sql) };
    await migration.up(runner);
    const linked = (
      await client.query(
        'SELECT id,source_document_id FROM accounting.bank_statements WHERE source_document_id IS NOT NULL',
      )
    ).rows;
    assert.deepEqual(linked, [
      { id: statements[0], source_document_id: documents[0] },
    ]);
    const classified = (
      await client.query(
        "SELECT id FROM accounting.accounting_documents WHERE processing_status = 'TRAITE'",
      )
    ).rows;
    assert.deepEqual(classified, [{ id: documents[0] }]);
    await client.query('SAVEPOINT duplicate_source');
    await assert.rejects(
      client.query(
        'UPDATE accounting.bank_statements SET source_document_id=$1 WHERE id=$2',
        [documents[0], statements[1]],
      ),
      { code: '23505' },
    );
    await client.query('ROLLBACK TO SAVEPOINT duplicate_source');
    await client.query(
      'DELETE FROM accounting.accounting_documents WHERE id=$1',
      [documents[0]],
    );
    assert.equal(
      (
        await client.query(
          'SELECT source_document_id FROM accounting.bank_statements WHERE id=$1',
          [statements[0]],
        )
      ).rows[0].source_document_id,
      null,
    );
    await migration.down(runner);
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='accounting' AND table_name='bank_statements' AND column_name='source_document_id'",
        )
      ).rows[0].n,
      0,
    );
    console.log(
      'PASS: unique historical links, tenant/approval/deletion/balance guards, classification, unique source index, FK and rollback on real PostgreSQL.',
    );
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
