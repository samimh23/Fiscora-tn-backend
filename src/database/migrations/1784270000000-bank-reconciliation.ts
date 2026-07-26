import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class BankReconciliation1784270000000 implements MigrationInterface {
  name = 'BankReconciliation1784270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."bank_accounts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "bank_name" varchar(150) NOT NULL,
        "iban" varchar(50),
        "ledger_account_id" uuid NOT NULL,
        "journal_id" uuid NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'TND',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_bank_account_name" UNIQUE ("dossier_id","name"),
        CONSTRAINT "FK_bank_account_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bank_account_ledger" FOREIGN KEY ("ledger_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bank_account_journal" FOREIGN KEY ("journal_id")
          REFERENCES "accounting"."accounting_journals"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_bank_accounts_active"
        ON "accounting"."bank_accounts" ("organization_id","dossier_id","is_active");

      CREATE TABLE "accounting"."bank_statements" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "bank_account_id" uuid NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "opening_balance" numeric(15,3) NOT NULL,
        "closing_balance" numeric(15,3) NOT NULL,
        "book_closing_balance" numeric(15,3),
        "difference" numeric(15,3),
        "source_file_name" varchar(300) NOT NULL,
        "row_count" integer NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'IMPORTE',
        "imported_by_user_id" uuid NOT NULL,
        "reconciled_by_user_id" uuid,
        "reconciled_at_utc" timestamptz,
        CONSTRAINT "UQ_bank_statement_period" UNIQUE ("bank_account_id","period_start","period_end"),
        CONSTRAINT "CHK_bank_statement_period" CHECK ("period_start" <= "period_end"),
        CONSTRAINT "CHK_bank_statement_status" CHECK ("status" IN ('IMPORTE','PARTIELLEMENT_RAPPROCHE','PRET_A_VALIDER','RAPPROCHE')),
        CONSTRAINT "FK_bank_statement_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bank_statement_account" FOREIGN KEY ("bank_account_id")
          REFERENCES "accounting"."bank_accounts"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_bank_statements_period"
        ON "accounting"."bank_statements" ("organization_id","dossier_id","period_start","period_end");

      CREATE TABLE "accounting"."bank_transactions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "bank_account_id" uuid NOT NULL,
        "statement_id" uuid NOT NULL,
        "transaction_date" date NOT NULL,
        "value_date" date,
        "description" varchar(500) NOT NULL,
        "reference" varchar(150),
        "amount" numeric(15,3) NOT NULL,
        "balance" numeric(15,3),
        "fingerprint" varchar(64) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'NON_RAPPROCHEE',
        "match_type" varchar(30),
        "match_confidence" smallint,
        "matched_payment_id" uuid,
        "journal_entry_id" uuid,
        "matched_by_user_id" uuid,
        "matched_at_utc" timestamptz,
        CONSTRAINT "UQ_bank_transaction_fingerprint" UNIQUE ("bank_account_id","fingerprint"),
        CONSTRAINT "CHK_bank_transaction_amount" CHECK ("amount" <> 0),
        CONSTRAINT "CHK_bank_transaction_status" CHECK ("status" IN ('NON_RAPPROCHEE','ECRITURE_BROUILLON','RAPPROCHEE')),
        CONSTRAINT "CHK_bank_match_type" CHECK ("match_type" IS NULL OR "match_type" IN ('AUTOMATIQUE','REGLEMENT','ECRITURE','ECRITURE_GENEREE')),
        CONSTRAINT "CHK_bank_match_confidence" CHECK ("match_confidence" IS NULL OR "match_confidence" BETWEEN 0 AND 100),
        CONSTRAINT "FK_bank_transaction_account" FOREIGN KEY ("bank_account_id")
          REFERENCES "accounting"."bank_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bank_transaction_statement" FOREIGN KEY ("statement_id")
          REFERENCES "accounting"."bank_statements"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bank_transaction_payment" FOREIGN KEY ("matched_payment_id")
          REFERENCES "accounting"."third_party_payments"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bank_transaction_entry" FOREIGN KEY ("journal_entry_id")
          REFERENCES "accounting"."journal_entries"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_bank_transactions_matching"
        ON "accounting"."bank_transactions" ("organization_id","dossier_id","transaction_date","status");
      CREATE INDEX "IDX_bank_transactions_payment"
        ON "accounting"."bank_transactions" ("matched_payment_id") WHERE "matched_payment_id" IS NOT NULL;
    `);

    for (const [name, description] of permissionSeed) {
      await queryRunner.query(
        `INSERT INTO "accounting"."permissions" ("name","description") VALUES ($1,$2)
         ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description"`,
        [name, description],
      );
    }
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.Owner,
      ownerPermissions,
    );
    await this.replaceRolePermissions(
      queryRunner,
      SystemRoleNames.Collaborator,
      collaboratorPermissions,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "accounting"."bank_transactions";
      DROP TABLE IF EXISTS "accounting"."bank_statements";
      DROP TABLE IF EXISTS "accounting"."bank_accounts";
    `);
  }

  private async replaceRolePermissions(
    queryRunner: QueryRunner,
    roleName: string,
    permissions: readonly string[],
  ) {
    const normalizedName = roleName.toUpperCase();
    await queryRunner.query(
      `DELETE FROM "accounting"."role_permissions" rp USING "accounting"."roles" r
       WHERE rp."role_id" = r."id" AND r."normalized_name" = $1`,
      [normalizedName],
    );
    for (const permission of permissions) {
      await queryRunner.query(
        `INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
         SELECT "id",$1 FROM "accounting"."roles" WHERE "normalized_name" = $2 ON CONFLICT DO NOTHING`,
        [permission, normalizedName],
      );
    }
  }
}
