import { MigrationInterface, QueryRunner } from 'typeorm';

export class DossierDeletion1791504000000 implements MigrationInterface {
  name = 'DossierDeletion1791504000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`INSERT INTO accounting.permissions(name,description)
      VALUES ('dossiers.delete','Supprimer définitivement un dossier et ses données') ON CONFLICT DO NOTHING`);
    await runner.query(`INSERT INTO accounting.role_permissions(role_id,permission_name)
      SELECT id,'dossiers.delete' FROM accounting.roles WHERE name='Propriétaire' ON CONFLICT DO NOTHING`);
    // No dossier FK: the durable cleanup must survive deletion of its dossier.
    await runner.query(`CREATE TABLE accounting.dossier_file_deletions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), organization_id uuid NOT NULL,
      dossier_id uuid NOT NULL, object_key varchar(1000) NOT NULL UNIQUE,
      attempts integer NOT NULL DEFAULT 0, available_at_utc timestamptz NOT NULL DEFAULT now(),
      created_at_utc timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      `CREATE INDEX dossier_file_deletions_pending ON accounting.dossier_file_deletions(available_at_utc)`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE accounting.dossier_file_deletions');
    await runner.query(
      `DELETE FROM accounting.role_permissions WHERE permission_name='dossiers.delete'`,
    );
    await runner.query(
      `DELETE FROM accounting.permissions WHERE name='dossiers.delete'`,
    );
  }
}
