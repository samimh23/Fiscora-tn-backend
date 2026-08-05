import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankReconciliationRules1784366000000
  implements MigrationInterface
{
  name = 'BankReconciliationRules1784366000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounting"."bank_reconciliation_rules" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "label" varchar(150) NOT NULL,
        "pattern" varchar(500) NOT NULL,
        "match_type" varchar(30) NOT NULL DEFAULT 'CONTIENT',
        "direction" varchar(20) NOT NULL DEFAULT 'TOUS',
        "suggested_account_id" uuid NOT NULL,
        "suggested_third_party_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_used_at_utc" timestamptz,
        CONSTRAINT "UQ_bank_rule_label" UNIQUE ("dossier_id","label"),
        CONSTRAINT "CHK_bank_rule_match_type" CHECK ("match_type" IN ('CONTIENT','COMMENCE_PAR','EXACT')),
        CONSTRAINT "CHK_bank_rule_direction" CHECK ("direction" IN ('TOUS','DEBIT','CREDIT')),
        CONSTRAINT "FK_bank_rule_dossier" FOREIGN KEY ("dossier_id")
          REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bank_rule_account" FOREIGN KEY ("suggested_account_id")
          REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bank_rule_third_party" FOREIGN KEY ("suggested_third_party_id")
          REFERENCES "accounting"."third_parties"("id") ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS "IDX_bank_rules_active"
        ON "accounting"."bank_reconciliation_rules" ("organization_id","dossier_id","is_active");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "accounting"."bank_reconciliation_rules";
    `);
  }
}
