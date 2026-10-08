// Integration check against a disposable localhost PostgreSQL instance only.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const { ConfigService } = require('@nestjs/config');
const {
  TrainingDatasets1791468000000,
} = require('../dist/src/database/migrations/1791468000000-training-datasets');
const {
  TrainingDatasetsService,
} = require('../dist/src/training-datasets/training-datasets.service');

async function main() {
  if (process.env.TRAINING_DISPOSABLE_DB !== 'yes')
    throw new Error('This check requires explicit disposable DB opt-in.');
  const db = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 55435,
    username: 'postgres',
    database: 'postgres',
  });
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.startTransaction();
  try {
    await runner.query('CREATE SCHEMA accounting');
    await runner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await runner.query(`CREATE TABLE accounting.organizations(id uuid PRIMARY KEY, is_active boolean);
      CREATE TABLE accounting.client_dossiers(id uuid PRIMARY KEY);
      CREATE TABLE accounting.roles(id uuid PRIMARY KEY, organization_id uuid, name text, is_system boolean);
      CREATE TABLE accounting.organization_memberships(id uuid PRIMARY KEY, organization_id uuid,user_id uuid,role_id uuid,is_active boolean);
      CREATE TABLE accounting.audit_logs(id uuid DEFAULT uuid_generate_v4(),organization_id uuid,actor_user_id uuid,action text,entity_type text,entity_id text,details_json jsonb);
      CREATE TABLE accounting.accounting_documents(id uuid PRIMARY KEY,organization_id uuid,dossier_id uuid,object_key text,mime_type text,deleted_at_utc timestamptz,malware_scan_status text,extraction_status text);
      CREATE TABLE accounting.document_extraction_jobs(document_id uuid PRIMARY KEY,organization_id uuid,dossier_id uuid,status text,reviewed_at_utc timestamptz,reviewed_by_user_id uuid,model_name text,normalized_data jsonb,validation_issues jsonb)`);
    await new TrainingDatasets1791468000000().up(runner);
    const org = randomUUID(),
      dossier = randomUUID(),
      owner = randomUUID(),
      role = randomUUID(),
      document = randomUUID();
    await runner.query(
      'INSERT INTO accounting.organizations VALUES ($1,true)',
      [org],
    );
    await runner.query('INSERT INTO accounting.client_dossiers VALUES ($1)', [
      dossier,
    ]);
    await runner.query(
      "INSERT INTO accounting.roles VALUES ($1,$2,'Propriétaire',true)",
      [role, org],
    );
    await runner.query(
      'INSERT INTO accounting.organization_memberships VALUES ($1,$2,$3,$4,true)',
      [randomUUID(), org, owner, role],
    );
    await runner.query(
      "INSERT INTO accounting.accounting_documents VALUES ($1,$2,$3,'source','image/png',NULL,'SAIN','VALIDEE')",
      [document, org, dossier],
    );
    await runner.query(
      `INSERT INTO accounting.document_extraction_jobs VALUES ($1,$2,$3,'VALIDEE',now(),$4,'numind/NuExtract3',$5,'[]')`,
      [
        document,
        org,
        dossier,
        owner,
        JSON.stringify({
          document_type: 'invoice',
          supplier: { name: 'Synthetic test' },
          total_incl_tax: 1191,
        }),
      ],
    );
    const store = new Map();
    const source = { readObject: async () => Buffer.from('synthetic-image') };
    const storage = {
      ensureReady: async () => {},
      putObject: async (key, buffer) => store.set(key, buffer),
      readObject: async (key) => store.get(key),
      removeObject: async (key) => store.delete(key),
      signedReadUrl: async () => 'https://example.invalid',
    };
    // Use a single transaction for every query so the fixture cannot persist.
    const transactionalDb = {
      query: (sql, params) => runner.query(sql, params),
      transaction: async (work) =>
        work({ query: (sql, params) => runner.query(sql, params) }),
    };
    const service = new TrainingDatasetsService(
      transactionalDb,
      new ConfigService(),
      source,
      storage,
      { getAccessibleEntity: async () => ({}) },
      {},
    );
    assert.equal((await service.consent(org, dossier, owner)).enabled, false);
    await service.collect();
    assert.equal(store.size, 0);
    await service.updateConsent(org, dossier, owner, {
      enabled: true,
      authorizationReference: 'Synthetic client permission',
    });
    await service.collect();
    let overview = await service.overview();
    assert.ok(
      overview.counts.some((item) => item.status === 'READY'),
      JSON.stringify(overview.counts),
    );
    assert.equal(
      overview.counts.find((item) => item.status === 'READY').count,
      '1',
    );
    assert.equal(store.size, 2);
    await service.collect();
    assert.equal(store.size, 2);
    const request = await service.createExport(owner, { limit: 1000 });
    assert.equal(request.status, 'QUEUED');
    await assert.rejects(
      service.createExport(owner, { limit: 1 }),
      /déjà en préparation/,
    );
    await service.updateConsent(org, dossier, owner, {
      enabled: false,
      authorizationReference: 'Synthetic withdrawal',
    });
    overview = await service.overview();
    assert.equal(overview.counts.length, 0);
    await service.cleanup();
    assert.equal(store.size, 0);
    assert.equal(
      (
        await runner.query(
          'SELECT status FROM accounting.training_dataset_exports WHERE id=$1',
          [request.id],
        )
      )[0].status,
      'EXPIRED',
    );
    console.log(
      'PASS: additive migration, opt-in default, approved collection, deduplication, export queue, withdrawal and cleanup on real PostgreSQL.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
