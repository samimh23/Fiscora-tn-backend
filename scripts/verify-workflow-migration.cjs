// This check is deliberately restricted to the disposable CI database.
const assert = require('node:assert/strict');
const { Client } = require('pg');

async function main() {
  assert.equal(process.env.DB_NAME, 'fiscora_migration_test');
  assert.ok(['localhost', '127.0.0.1'].includes(process.env.DB_HOST));
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const migration = await client.query(
      'SELECT name FROM public.migrations WHERE name = $1',
      ['WorkflowIntegrity1790784000000'],
    );
    assert.equal(migration.rows.length, 1, 'Workflow migration was not applied');
    const columns = await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'accounting' AND (
        (table_name = 'business_invoices' AND column_name IN ('fodec_account_id','fodec_amount')) OR
        (table_name = 'business_invoice_lines' AND column_name IN ('fodec_rate','fodec_amount'))
      )
    `);
    assert.equal(columns.rows.length, 4, 'FODEC fields are incomplete');
    const constraint = await client.query(`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'accounting.business_invoices'::regclass
        AND conname = 'CHK_invoice_settlement_status'
    `);
    assert.equal(constraint.rows.length, 1);
    assert.match(constraint.rows[0].definition, /A_REMBOURSER/);
    const fk = await client.query(`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'accounting.business_invoices'::regclass AND contype = 'f'
    `);
    assert.ok(fk.rows.some(row => /fodec_account_id/.test(row.definition)));
    console.log('Fresh PostgreSQL migration chain, FODEC fields, refund constraint and FODEC account FK verified.');
  } finally {
    await client.end();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
