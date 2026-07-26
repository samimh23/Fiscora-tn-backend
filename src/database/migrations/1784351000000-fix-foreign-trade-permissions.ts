import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixForeignTradePermissions1784351000000 implements MigrationInterface {
  name = 'FixForeignTradePermissions1784351000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
      SELECT r."id", p."name"
      FROM "accounting"."roles" r
      CROSS JOIN (VALUES
        ('foreign_trade.view'),('foreign_trade.manage'),('foreign_trade.post'),
        ('electronic_invoices.view'),('electronic_invoices.manage'),
        ('electronic_invoices.submit'),('electronic_invoices.configure')
      ) AS p("name")
      WHERE r."is_system" = true
        AND r."normalized_name" NOT IN ('COLLABORATEUR','COMPTABLE','PORTAIL CLIENT')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounting"."role_permissions" rp
      USING "accounting"."roles" r
      WHERE rp."role_id" = r."id"
        AND r."is_system" = true
        AND r."normalized_name" NOT IN ('COLLABORATEUR','COMPTABLE','PORTAIL CLIENT')
        AND rp."permission_name" IN (
          'foreign_trade.view','foreign_trade.manage','foreign_trade.post',
          'electronic_invoices.view','electronic_invoices.manage',
          'electronic_invoices.submit','electronic_invoices.configure'
        );
    `);
  }
}
