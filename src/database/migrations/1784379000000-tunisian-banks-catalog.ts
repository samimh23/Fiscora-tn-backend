import { MigrationInterface, QueryRunner } from 'typeorm';
import { TUNISIAN_BANKS } from '../../bank-reconciliation/tunisian-banks';

/**
 * Catalogue national des banques tunisiennes.
 *
 * Les établissements agréés sont un fait national, pas une donnée de cabinet :
 * ils sont donc enregistrés sans `organization_id` et visibles par tous. Cela
 * évite de dupliquer la liste dans chaque cabinet et couvre d'office ceux qui
 * seront créés plus tard, sans dépendre d'un branchement à l'inscription.
 * Un cabinet reste libre d'ajouter ses propres établissements, qui eux
 * portent son `organization_id`.
 */
export class TunisianBanksCatalog1784379000000 implements MigrationInterface {
  name = 'TunisianBanksCatalog1784379000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."banks"
        ALTER COLUMN "organization_id" DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS "legal_name" varchar(200);
    `);
    // La contrainte unique existante ignore les lignes globales (NULL distinct
    // en SQL) : il faut un index partiel pour empêcher les doublons nationaux.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_banks_global_normalized_name"
        ON "accounting"."banks" ("normalized_name")
        WHERE "organization_id" IS NULL;
    `);

    for (const bank of TUNISIAN_BANKS) {
      const normalized = bank.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      await queryRunner.query(
        `INSERT INTO "accounting"."banks"
           ("organization_id", "name", "normalized_name", "legal_name")
         VALUES (NULL, $1, $2, $3)
         ON CONFLICT DO NOTHING;`,
        [bank.name, normalized, bank.legalName],
      );
    }

    // Un établissement déjà saisi à la main qui correspond au catalogue est
    // rattaché à la ligne nationale, sinon la liste afficherait deux « BIAT ».
    await queryRunner.query(`
      UPDATE "accounting"."bank_accounts" a
      SET "bank_id" = g."id"
      FROM "accounting"."banks" own, "accounting"."banks" g
      WHERE a."bank_id" = own."id"
        AND own."organization_id" IS NOT NULL
        AND g."organization_id" IS NULL
        AND g."normalized_name" = own."normalized_name";
    `);
    await queryRunner.query(`
      DELETE FROM "accounting"."banks" own
      WHERE own."organization_id" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "accounting"."banks" g
          WHERE g."organization_id" IS NULL
            AND g."normalized_name" = own."normalized_name"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "accounting"."bank_accounts" a
          WHERE a."bank_id" = own."id"
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les comptes rattachés à une banque nationale reçoivent une copie propre
    // à leur cabinet, faute de quoi la colonne ne pourrait redevenir NOT NULL.
    await queryRunner.query(`
      INSERT INTO "accounting"."banks"
        ("organization_id", "name", "normalized_name", "legal_name")
      SELECT DISTINCT a."organization_id", g."name", g."normalized_name", g."legal_name"
      FROM "accounting"."bank_accounts" a
      JOIN "accounting"."banks" g ON g."id" = a."bank_id"
      WHERE g."organization_id" IS NULL
      ON CONFLICT DO NOTHING;
    `);
    await queryRunner.query(`
      UPDATE "accounting"."bank_accounts" a
      SET "bank_id" = own."id"
      FROM "accounting"."banks" g, "accounting"."banks" own
      WHERE a."bank_id" = g."id"
        AND g."organization_id" IS NULL
        AND own."organization_id" = a."organization_id"
        AND own."normalized_name" = g."normalized_name";
    `);
    await queryRunner.query(
      `DELETE FROM "accounting"."banks" WHERE "organization_id" IS NULL;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "accounting"."UQ_banks_global_normalized_name";`,
    );
    await queryRunner.query(`
      ALTER TABLE "accounting"."banks"
        ALTER COLUMN "organization_id" SET NOT NULL,
        DROP COLUMN IF EXISTS "legal_name";
    `);
  }
}
