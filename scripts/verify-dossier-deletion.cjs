// Destructive regression test: hard restricted to a local disposable database.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { DataSource } = require('typeorm');
const root = fs.existsSync('dist/src/dossiers/dossier-deletion.service.js')
  ? 'dist/src'
  : 'dist';
const { DossierDeletionService } = require(
  `../${root}/dossiers/dossier-deletion.service.js`,
);

async function main() {
  assert.equal(process.env.DB_NAME, 'fiscora_migration_test');
  assert.ok(['localhost', '127.0.0.1'].includes(process.env.DB_HOST));
  const db = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    logging: false,
  });
  await db.initialize();
  const insert = async (table, fields) => {
    const keys = Object.keys(fields);
    const rows = await db.query(
      `INSERT INTO accounting."${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      Object.values(fields),
    );
    return rows[0];
  };
  const removed = [];
  let failStorage = true;
  const service = new DossierDeletionService(db, {
    removeObject: async (key) => {
      if (failStorage) throw new Error('test storage outage');
      removed.push(key);
    },
  });
  try {
    const actor = await insert('users', {
      email: `${randomUUID()}@example.invalid`,
      normalized_email: randomUUID(),
      password_hash: 'not-a-login',
      full_name: 'Deletion Test Owner',
    });
    const other = await insert('users', {
      email: `${randomUUID()}@example.invalid`,
      normalized_email: randomUUID(),
      password_hash: 'not-a-login',
      full_name: 'Deletion Test Collaborator',
    });
    const organization = await insert('organizations', {
      name: 'Deletion test cabinet',
      slug: randomUUID(),
    });
    const foreignOrg = await insert('organizations', {
      name: 'Unrelated cabinet',
      slug: randomUUID(),
    });
    const role = await insert('roles', {
      organization_id: organization.id,
      name: 'Propriétaire',
      normalized_name: 'OWNER',
      is_system: true,
    });
    const collaborator = await insert('roles', {
      organization_id: organization.id,
      name: 'Collaborateur',
      normalized_name: 'COLLABORATOR',
      is_system: true,
    });
    await insert('organization_memberships', {
      organization_id: organization.id,
      user_id: actor.id,
      role_id: role.id,
    });
    await insert('organization_memberships', {
      organization_id: organization.id,
      user_id: other.id,
      role_id: collaborator.id,
    });
    const makeDossier = (name, org = organization.id) =>
      insert('client_dossiers', {
        organization_id: org,
        legal_name: name,
        legal_form: 'SARL',
        tax_regime: 'REEL',
        created_by_user_id: actor.id,
      });
    const target = await makeDossier('Delete this SARL');
    const keep = await makeDossier('Keep this SARL');
    const foreign = await makeDossier('Foreign SARL', foreignOrg.id);
    const scope = { organization_id: organization.id, dossier_id: target.id };
    const key = `${organization.id}/${target.id}/2026/fixture.png`;
    const doc = await insert('accounting_documents', {
      ...scope,
      original_name: 'fixture.png',
      object_key: key,
      mime_type: 'image/png',
      size_bytes: 12,
      category: 'FACTURE_ACHAT',
      uploaded_by_user_id: actor.id,
    });
    const oldDoc = await insert('accounting_documents', {
      ...scope,
      original_name: 'old.png',
      object_key: `${organization.id}/${target.id}/2026/old.png`,
      mime_type: 'image/png',
      size_bytes: 12,
      category: 'FACTURE_ACHAT',
      uploaded_by_user_id: actor.id,
      deleted_at_utc: new Date(),
    });
    await insert('document_extraction_jobs', {
      ...scope,
      document_id: doc.id,
      status: 'EN_ATTENTE',
    });
    await insert('dossier_contacts', { ...scope, full_name: 'Client' });
    const journal = await insert('accounting_journals', {
      ...scope,
      code: 'AC',
      name: 'Purchases',
      type: 'ACHATS',
    });
    const account = await insert('ledger_accounts', {
      ...scope,
      code: '401',
      normalized_code: '401',
      name: 'Supplier',
      type: 'Liability',
      normal_balance: 'Credit',
    });
    const entry = await insert('journal_entries', {
      ...scope,
      journal_id: journal.id,
      entry_date: '2026-10-01',
      piece_reference: 'TEST',
      description: 'Test entry',
      total_debit: 1,
      total_credit: 1,
      created_by_user_id: actor.id,
      source_document_id: doc.id,
    });
    const line = await insert('journal_entry_lines', {
      organization_id: organization.id,
      entry_id: entry.id,
      account_id: account.id,
      label: 'Test line',
      debit: 1,
      credit: 0,
    });
    const invoice = await insert('business_invoices', {
      ...scope,
      type: 'ACHAT',
      number: randomUUID(),
      invoice_date: '2026-10-01',
      third_party_name: 'Test supplier',
      journal_id: journal.id,
      third_party_account_id: account.id,
      net_amount: 1,
      vat_amount: 0,
      stamp_duty: 0,
      withholding_base: 0,
      withholding_amount: 0,
      gross_amount: 1,
      net_payable: 1,
      outstanding_amount: 1,
      created_by_user_id: actor.id,
    });
    const bank = (await db.query('SELECT id FROM accounting.banks LIMIT 1'))[0];
    const bankAccount = await insert('bank_accounts', {
      ...scope,
      name: 'Test bank account',
      ledger_account_id: account.id,
      journal_id: journal.id,
      bank_id: bank.id,
    });
    const statement = await insert('bank_statements', {
      ...scope,
      bank_account_id: bankAccount.id,
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      opening_balance: 10,
      closing_balance: 11,
      source_file_name: 'fixture.png',
      row_count: 1,
      imported_by_user_id: actor.id,
      source_document_id: doc.id,
    });
    await insert('bank_transactions', {
      ...scope,
      bank_account_id: bankAccount.id,
      statement_id: statement.id,
      transaction_date: '2026-10-01',
      description: 'Test movement',
      amount: 1,
      fingerprint: randomUUID(),
    });
    await insert('notifications', {
      organization_id: organization.id,
      recipient_user_id: actor.id,
      type: 'TEST',
      title: 'Target notification',
      body: 'Target',
      entity_id: invoice.id,
      deduplication_key: randomUUID(),
    });
    const keptDoc = await insert('accounting_documents', {
      organization_id: organization.id,
      dossier_id: keep.id,
      original_name: 'keep.png',
      object_key: `${organization.id}/${keep.id}/keep.png`,
      mime_type: 'image/png',
      size_bytes: 15,
      category: 'FACTURE_ACHAT',
      uploaded_by_user_id: actor.id,
    });
    const history = await insert('audit_logs', {
      organization_id: organization.id,
      actor_user_id: actor.id,
      action: 'test.history',
      entity_type: 'ClientDossier',
      entity_id: target.id,
    });
    await insert('training_dataset_consents', {
      ...scope,
      enabled: true,
      authorized_by_user_id: actor.id,
      authorization_reference: 'Test consent',
    });
    const request = {
      confirmationName: target.legal_name,
      acknowledgePermanentDeletion: true,
    };
    const reject = async (org, id, user, input, status) =>
      assert.rejects(
        service.remove(org, id, user, input),
        (e) => e.getStatus?.() === status,
      );
    await reject(organization.id, target.id, other.id, request, 403);
    await reject(
      organization.id,
      foreign.id,
      actor.id,
      { ...request, confirmationName: foreign.legal_name },
      404,
    );
    await reject(
      organization.id,
      target.id,
      actor.id,
      { ...request, confirmationName: 'Wrong' },
      400,
    );
    await reject(
      organization.id,
      target.id,
      actor.id,
      { ...request, acknowledgePermanentDeletion: false },
      400,
    );
    // Cross-dossier references must roll back before even a SET NULL can modify another dossier.
    const cross = await insert('accounting_documents', {
      organization_id: organization.id,
      dossier_id: keep.id,
      original_name: 'cross.png',
      object_key: `${organization.id}/${keep.id}/cross.png`,
      mime_type: 'image/png',
      size_bytes: 1,
      category: 'FACTURE_ACHAT',
      uploaded_by_user_id: actor.id,
      replaces_document_id: doc.id,
    });
    await reject(organization.id, target.id, actor.id, request, 409);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM accounting.accounting_documents WHERE id=$1',
          [doc.id],
        )
      ).length,
      1,
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM accounting.dossier_file_deletions WHERE dossier_id=$1',
          [target.id],
        )
      ).length,
      0,
    );
    await db.query(
      'UPDATE accounting.accounting_documents SET replaces_document_id=NULL WHERE id=$1',
      [cross.id],
    );
    const result = await service.remove(
      organization.id,
      target.id,
      actor.id,
      request,
    );
    assert.equal(result.deleted, true);
    const tables = await db.query(
      `SELECT table_name FROM information_schema.columns WHERE table_schema='accounting' AND column_name='dossier_id' AND table_name NOT IN ('dossier_file_deletions','training_dataset_examples')`,
    );
    for (const table of tables)
      assert.equal(
        (
          await db.query(
            `SELECT 1 FROM accounting."${table.table_name}" WHERE dossier_id=$1`,
            [target.id],
          )
        ).length,
        0,
        `Leftover ${table.table_name}`,
      );
    for (const [table, id] of [
      ['client_dossiers', target.id],
      ['journal_entry_lines', line.id],
      ['business_invoices', invoice.id],
      ['accounting_documents', doc.id],
      ['accounting_documents', oldDoc.id],
    ])
      assert.equal(
        (await db.query(`SELECT 1 FROM accounting.${table} WHERE id=$1`, [id]))
          .length,
        0,
        `Leftover ${table}`,
      );
    for (const [table, id] of [
      ['client_dossiers', keep.id],
      ['client_dossiers', foreign.id],
      ['accounting_documents', keptDoc.id],
      ['audit_logs', history.id],
      ['users', actor.id],
      ['users', other.id],
      ['organizations', organization.id],
    ])
      assert.equal(
        (await db.query(`SELECT 1 FROM accounting.${table} WHERE id=$1`, [id]))
          .length,
        1,
        `Changed unrelated ${table}`,
      );
    assert.equal(
      (
        await db.query(
          "SELECT 1 FROM accounting.audit_logs WHERE entity_id=$1 AND action='dossier.deleted'",
          [target.id],
        )
      ).length,
      1,
    );
    assert.equal(
      (
        await db.query(
          'SELECT 1 FROM accounting.dossier_file_deletions WHERE dossier_id=$1',
          [target.id],
        )
      ).length,
      2,
    );
    assert.equal(removed.length, 0);
    await service.cleanupFiles();
    assert.equal(
      (
        await db.query(
          'SELECT 1 FROM accounting.dossier_file_deletions WHERE dossier_id=$1 AND attempts=1',
          [target.id],
        )
      ).length,
      2,
    );
    failStorage = false;
    await db.query(
      'UPDATE accounting.dossier_file_deletions SET available_at_utc=now() WHERE dossier_id=$1',
      [target.id],
    );
    await service.cleanupFiles();
    assert.deepEqual(removed.sort(), [key, oldDoc.object_key].sort());
    assert.equal(
      (
        await db.query(
          'SELECT 1 FROM accounting.dossier_file_deletions WHERE dossier_id=$1',
          [target.id],
        )
      ).length,
      0,
    );
    console.log(
      'Dossier deletion: real FK ordering, isolation, authorization, confirmation, rollback, audit retention, document versions and durable storage retries verified.',
    );
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
