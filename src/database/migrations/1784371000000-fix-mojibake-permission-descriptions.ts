import { MigrationInterface, QueryRunner } from 'typeorm';

// The 1784350000000-foreign-trade-and-ttn migration's source file was
// later saved with double-UTF-8-encoded French text (Ã© instead of é).
// That corrupted the description strings it inserted into the
// permissions table. This migration repairs the affected rows.
export class FixMojibakePermissionDescriptions1784371000000 implements MigrationInterface {
  name = 'FixMojibakePermissionDescriptions1784371000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "accounting"."permissions" SET "description" = 'Consulter les devises et opérations de commerce extérieur' WHERE "name" = 'foreign_trade.view';
      UPDATE "accounting"."permissions" SET "description" = 'Gérer les taux, certificats et opérations de commerce extérieur' WHERE "name" = 'foreign_trade.manage';
      UPDATE "accounting"."permissions" SET "description" = 'Comptabiliser les opérations et écarts de change' WHERE "name" = 'foreign_trade.post';
      UPDATE "accounting"."permissions" SET "description" = 'Consulter les factures électroniques TTN' WHERE "name" = 'electronic_invoices.view';
      UPDATE "accounting"."permissions" SET "description" = 'Préparer les factures électroniques TTN' WHERE "name" = 'electronic_invoices.manage';
    `);
  }

  public async down(): Promise<void> {
    // Cosmetic text repair only; no rollback needed.
  }
}
