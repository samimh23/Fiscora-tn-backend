import { MigrationInterface, QueryRunner } from 'typeorm';

export class QualityAssurancePermission1784365000000
  implements MigrationInterface
{
  name = 'QualityAssurancePermission1784365000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "accounting"."permissions" ("name", "description")
      VALUES ('quality_assurance.view', 'Consulter les contrôles qualité des dossiers')
      ON CONFLICT ("name") DO NOTHING;
    `);
    await queryRunner.query(`
      INSERT INTO "accounting"."role_permissions" ("role_id", "permission_name")
      SELECT r."id", 'quality_assurance.view'
      FROM "accounting"."roles" r
      WHERE r."is_system" = true
        AND r."normalized_name" NOT IN ('COLLABORATEUR','COMPTABLE','PORTAIL CLIENT')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounting"."role_permissions"
      WHERE "permission_name" = 'quality_assurance.view';
    `);
    await queryRunner.query(`
      DELETE FROM "accounting"."permissions"
      WHERE "name" = 'quality_assurance.view';
    `);
  }
}
