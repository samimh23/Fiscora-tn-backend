import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * L'établissement bancaire devient une entité à part entière.
 *
 * `bank_accounts.bank_name` était du texte libre : le même établissement
 * s'écrivait « BIAT », « Biat » ou « B.I.A.T » selon la saisie, sans rien à
 * quoi rattacher un format de relevé ou un code BCT. Les valeurs existantes
 * sont reprises telles quelles — repliées sur un nom normalisé pour fusionner
 * les variantes — donc aucun compte ne perd son établissement.
 */
export class BankReference1784378000000 implements MigrationInterface {
  name = 'BankReference1784378000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."banks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "normalized_name" varchar(150) NOT NULL,
        "bank_code" varchar(10),
        "bic" varchar(20),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_banks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_banks_org_normalized_name"
          UNIQUE ("organization_id", "normalized_name"),
        CONSTRAINT "FK_banks_organization" FOREIGN KEY ("organization_id")
          REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_banks_org_active"
        ON "accounting"."banks" ("organization_id", "is_active");
    `);

    // Reprise des établissements déjà saisis : une ligne par nom normalisé.
    await queryRunner.query(`
      INSERT INTO "accounting"."banks" ("organization_id", "name", "normalized_name")
      SELECT DISTINCT ON (a."organization_id", upper(regexp_replace(a."bank_name", '[^a-zA-Z0-9]', '', 'g')))
             a."organization_id",
             trim(a."bank_name"),
             upper(regexp_replace(a."bank_name", '[^a-zA-Z0-9]', '', 'g'))
      FROM "accounting"."bank_accounts" a
      WHERE coalesce(trim(a."bank_name"), '') <> ''
      ORDER BY a."organization_id",
               upper(regexp_replace(a."bank_name", '[^a-zA-Z0-9]', '', 'g')),
               a."created_at_utc";
    `);

    await queryRunner.query(`
      ALTER TABLE "accounting"."bank_accounts" ADD COLUMN "bank_id" uuid;
    `);
    await queryRunner.query(`
      UPDATE "accounting"."bank_accounts" a
      SET "bank_id" = b."id"
      FROM "accounting"."banks" b
      WHERE b."organization_id" = a."organization_id"
        AND b."normalized_name" =
            upper(regexp_replace(a."bank_name", '[^a-zA-Z0-9]', '', 'g'));
    `);

    // Un compte bancaire sans établissement n'aurait plus de sens : on retient
    // « Établissement à préciser » plutôt que de bloquer la migration.
    await queryRunner.query(`
      INSERT INTO "accounting"."banks" ("organization_id", "name", "normalized_name")
      SELECT DISTINCT a."organization_id", 'Établissement à préciser', 'ETABLISSEMENTAPRECISER'
      FROM "accounting"."bank_accounts" a
      WHERE a."bank_id" IS NULL
      ON CONFLICT ("organization_id", "normalized_name") DO NOTHING;
    `);
    await queryRunner.query(`
      UPDATE "accounting"."bank_accounts" a
      SET "bank_id" = b."id"
      FROM "accounting"."banks" b
      WHERE a."bank_id" IS NULL
        AND b."organization_id" = a."organization_id"
        AND b."normalized_name" = 'ETABLISSEMENTAPRECISER';
    `);

    await queryRunner.query(`
      ALTER TABLE "accounting"."bank_accounts"
        ALTER COLUMN "bank_id" SET NOT NULL,
        ADD CONSTRAINT "FK_bank_accounts_bank" FOREIGN KEY ("bank_id")
          REFERENCES "accounting"."banks"("id") ON DELETE RESTRICT,
        DROP COLUMN "bank_name";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."bank_accounts"
        ADD COLUMN "bank_name" varchar(150);
    `);
    await queryRunner.query(`
      UPDATE "accounting"."bank_accounts" a
      SET "bank_name" = b."name"
      FROM "accounting"."banks" b
      WHERE b."id" = a."bank_id";
    `);
    await queryRunner.query(`
      ALTER TABLE "accounting"."bank_accounts"
        ALTER COLUMN "bank_name" SET NOT NULL,
        DROP CONSTRAINT IF EXISTS "FK_bank_accounts_bank",
        DROP COLUMN IF EXISTS "bank_id";
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "accounting"."banks";`);
  }
}
