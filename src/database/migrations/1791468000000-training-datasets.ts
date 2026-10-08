import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingDatasets1791468000000 implements MigrationInterface {
  name = 'TrainingDatasets1791468000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE accounting.training_dataset_consents (
      dossier_id uuid PRIMARY KEY REFERENCES accounting.client_dossiers(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES accounting.organizations(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false,
      revision uuid NOT NULL DEFAULT uuid_generate_v4(),
      authorized_by_user_id uuid NOT NULL,
      authorization_reference text NOT NULL,
      updated_at_utc timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(`CREATE TABLE accounting.training_dataset_examples (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id uuid NOT NULL,
      dossier_id uuid NOT NULL,
      document_id uuid NOT NULL,
      consent_revision uuid NOT NULL,
      reviewed_at_utc timestamptz NOT NULL,
      reviewed_by_user_id uuid NOT NULL,
      document_kind varchar(20) NOT NULL CHECK (document_kind IN ('invoice','bank_statement')),
      model_name text NOT NULL,
      mime_type text NOT NULL,
      source_sha256 varchar(64),
      label_sha256 varchar(64),
      object_prefix text NOT NULL,
      expected_json jsonb NOT NULL,
      template_json jsonb NOT NULL,
      instructions text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'COLLECTING' CHECK (status IN ('COLLECTING','READY','FAILED','DUPLICATE')),
      created_at_utc timestamptz NOT NULL DEFAULT now(),
      error_code text,
      UNIQUE(document_id, reviewed_at_utc, consent_revision)
    )`);
    await runner.query(`CREATE UNIQUE INDEX training_examples_dedup
      ON accounting.training_dataset_examples(organization_id, source_sha256, label_sha256)
      WHERE status = 'READY'`);
    await runner.query(`CREATE TABLE accounting.training_dataset_exports (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      requested_by_user_id uuid NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','READY','FAILED','EXPIRED')),
      example_ids uuid[] NOT NULL,
      object_key text,
      sample_count integer NOT NULL,
      size_bytes bigint,
      created_at_utc timestamptz NOT NULL DEFAULT now(),
      expires_at_utc timestamptz NOT NULL DEFAULT now() + interval '24 hours',
      lease_expires_at_utc timestamptz,
      error_code text
    )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE accounting.training_dataset_exports');
    await runner.query('DROP TABLE accounting.training_dataset_examples');
    await runner.query('DROP TABLE accounting.training_dataset_consents');
  }
}
