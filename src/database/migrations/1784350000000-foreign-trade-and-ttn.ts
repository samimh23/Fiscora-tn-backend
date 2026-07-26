import { MigrationInterface, QueryRunner } from 'typeorm';

export class ForeignTradeAndTtn1784350000000 implements MigrationInterface {
  name = 'ForeignTradeAndTtn1784350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."currency_exchange_rates" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "currency_code" varchar(3) NOT NULL,
        "effective_date" date NOT NULL,
        "rate" numeric(18,8) NOT NULL,
        "source_label" varchar(250) NOT NULL,
        "source_url" varchar(1000),
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "UQ_currency_exchange_rate" UNIQUE ("organization_id","currency_code","effective_date"),
        CONSTRAINT "CHK_currency_exchange_rate" CHECK ("rate" > 0 AND "currency_code" <> 'TND')
      );
      CREATE INDEX "IDX_currency_exchange_rates"
        ON "accounting"."currency_exchange_rates" ("organization_id","currency_code","effective_date");

      CREATE TABLE "accounting"."vat_suspension_certificates" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "number" varchar(120) NOT NULL,
        "valid_from" date NOT NULL,
        "valid_to" date NOT NULL,
        "authorized_base" numeric(15,3) NOT NULL,
        "used_base" numeric(15,3) NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "document_id" uuid,
        "notes" text,
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "UQ_vat_suspension_certificate" UNIQUE ("dossier_id","number"),
        CONSTRAINT "CHK_vat_suspension_dates" CHECK ("valid_to" >= "valid_from"),
        CONSTRAINT "CHK_vat_suspension_amounts" CHECK ("authorized_base" > 0 AND "used_base" >= 0 AND "used_base" <= "authorized_base"),
        CONSTRAINT "CHK_vat_suspension_status" CHECK ("status" IN ('ACTIVE','EPUISEE','EXPIREE','ANNULEE')),
        CONSTRAINT "FK_vat_suspension_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vat_suspension_document" FOREIGN KEY ("document_id") REFERENCES "accounting"."accounting_documents"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_vat_suspension_certificates"
        ON "accounting"."vat_suspension_certificates" ("organization_id","dossier_id","valid_from","valid_to");

      CREATE TABLE "accounting"."foreign_trade_operations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "direction" varchar(10) NOT NULL,
        "reference" varchar(120) NOT NULL,
        "operation_date" date NOT NULL,
        "third_party_name" varchar(200) NOT NULL,
        "country_code" varchar(2) NOT NULL,
        "currency_code" varchar(3) NOT NULL,
        "foreign_amount" numeric(18,3) NOT NULL,
        "exchange_rate" numeric(18,8) NOT NULL,
        "local_amount" numeric(15,3) NOT NULL,
        "freight_amount" numeric(15,3) NOT NULL DEFAULT 0,
        "insurance_amount" numeric(15,3) NOT NULL DEFAULT 0,
        "customs_duties" numeric(15,3) NOT NULL DEFAULT 0,
        "import_vat" numeric(15,3) NOT NULL DEFAULT 0,
        "other_costs" numeric(15,3) NOT NULL DEFAULT 0,
        "landed_cost" numeric(15,3) NOT NULL,
        "incoterm" varchar(10),
        "customs_declaration_number" varchar(120),
        "customs_declaration_date" date,
        "vat_suspension_certificate_id" uuid,
        "journal_id" uuid NOT NULL,
        "trade_account_id" uuid NOT NULL,
        "third_party_account_id" uuid NOT NULL,
        "vat_account_id" uuid,
        "journal_entry_id" uuid,
        "settlement_rate" numeric(18,8),
        "settled_local_amount" numeric(15,3),
        "exchange_difference" numeric(15,3),
        "settlement_entry_id" uuid,
        "status" varchar(25) NOT NULL DEFAULT 'BROUILLON',
        "created_by_user_id" uuid NOT NULL,
        "posted_by_user_id" uuid,
        "posted_at_utc" timestamptz,
        CONSTRAINT "UQ_foreign_trade_operation" UNIQUE ("dossier_id","reference"),
        CONSTRAINT "CHK_foreign_trade_direction" CHECK ("direction" IN ('IMPORT','EXPORT')),
        CONSTRAINT "CHK_foreign_trade_status" CHECK ("status" IN ('BROUILLON','COMPTABILISEE','REGLEE','ANNULEE')),
        CONSTRAINT "CHK_foreign_trade_amounts" CHECK ("foreign_amount" > 0 AND "exchange_rate" > 0 AND "local_amount" > 0 AND "freight_amount" >= 0 AND "insurance_amount" >= 0 AND "customs_duties" >= 0 AND "import_vat" >= 0 AND "other_costs" >= 0),
        CONSTRAINT "FK_foreign_trade_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_foreign_trade_certificate" FOREIGN KEY ("vat_suspension_certificate_id") REFERENCES "accounting"."vat_suspension_certificates"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_foreign_trade_journal" FOREIGN KEY ("journal_id") REFERENCES "accounting"."accounting_journals"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_foreign_trade_trade_account" FOREIGN KEY ("trade_account_id") REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_foreign_trade_third_party_account" FOREIGN KEY ("third_party_account_id") REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_foreign_trade_vat_account" FOREIGN KEY ("vat_account_id") REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_foreign_trade_entry" FOREIGN KEY ("journal_entry_id") REFERENCES "accounting"."journal_entries"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_foreign_trade_settlement_entry" FOREIGN KEY ("settlement_entry_id") REFERENCES "accounting"."journal_entries"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_foreign_trade_operations"
        ON "accounting"."foreign_trade_operations" ("organization_id","dossier_id","operation_date","status");

      CREATE TABLE "accounting"."ttn_einvoice_configurations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL UNIQUE,
        "environment" varchar(20) NOT NULL DEFAULT 'SIMULATION',
        "issuer_tax_identifier" varchar(100) NOT NULL,
        "schema_version" varchar(40),
        "certificate_reference" varchar(250),
        "connection_reference" varchar(250),
        "is_enabled" boolean NOT NULL DEFAULT true,
        "updated_by_user_id" uuid NOT NULL,
        CONSTRAINT "CHK_ttn_configuration_environment" CHECK ("environment" IN ('SIMULATION','TEST','PRODUCTION')),
        CONSTRAINT "FK_ttn_configuration_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );

      CREATE TABLE "accounting"."ttn_einvoice_submissions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "invoice_id" uuid NOT NULL UNIQUE,
        "environment" varchar(20) NOT NULL,
        "schema_version" varchar(40) NOT NULL,
        "payload_xml" text NOT NULL,
        "payload_hash" varchar(64) NOT NULL,
        "signature_mode" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PRETE',
        "external_reference" varchar(160),
        "response_code" varchar(80),
        "response_message" text,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_attempt_at_utc" timestamptz,
        "accepted_at_utc" timestamptz,
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "CHK_ttn_submission_environment" CHECK ("environment" IN ('SIMULATION','TEST','PRODUCTION')),
        CONSTRAINT "CHK_ttn_submission_status" CHECK ("status" IN ('PRETE','SOUMISE','ACCEPTEE','REJETEE','ECHEC')),
        CONSTRAINT "FK_ttn_submission_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ttn_submission_invoice" FOREIGN KEY ("invoice_id") REFERENCES "accounting"."business_invoices"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_ttn_einvoice_submissions"
        ON "accounting"."ttn_einvoice_submissions" ("organization_id","dossier_id","status");

      INSERT INTO "accounting"."permissions" ("name","description") VALUES
        ('foreign_trade.view','Consulter les devises et opÃ©rations de commerce extÃ©rieur'),
        ('foreign_trade.manage','GÃ©rer les taux, certificats et opÃ©rations de commerce extÃ©rieur'),
        ('foreign_trade.post','Comptabiliser les opÃ©rations et Ã©carts de change'),
        ('electronic_invoices.view','Consulter les factures Ã©lectroniques TTN'),
        ('electronic_invoices.manage','PrÃ©parer les factures Ã©lectroniques TTN'),
        ('electronic_invoices.submit','Transmettre ou simuler la transmission TTN'),
        ('electronic_invoices.configure','Configurer le raccordement TTN du dossier')
      ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description";

      INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
      SELECT r."id", p."name"
      FROM "accounting"."roles" r
      CROSS JOIN (VALUES
        ('foreign_trade.view'),('foreign_trade.manage'),('foreign_trade.post'),
        ('electronic_invoices.view'),('electronic_invoices.manage'),
        ('electronic_invoices.submit'),('electronic_invoices.configure')
      ) AS p("name")
      WHERE r."is_system" = true AND r."normalized_name" IN ('PROPRIÃ‰TAIRE','ADMINISTRATEUR')
      ON CONFLICT DO NOTHING;

      INSERT INTO "accounting"."role_permissions" ("role_id","permission_name")
      SELECT r."id", p."name"
      FROM "accounting"."roles" r
      CROSS JOIN (VALUES
        ('foreign_trade.view'),('foreign_trade.manage'),
        ('electronic_invoices.view'),('electronic_invoices.manage')
      ) AS p("name")
      WHERE r."is_system" = true AND r."normalized_name" IN ('COLLABORATEUR','COMPTABLE')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounting"."role_permissions" WHERE "permission_name" IN (
        'foreign_trade.view','foreign_trade.manage','foreign_trade.post',
        'electronic_invoices.view','electronic_invoices.manage',
        'electronic_invoices.submit','electronic_invoices.configure'
      );
      DELETE FROM "accounting"."permissions" WHERE "name" IN (
        'foreign_trade.view','foreign_trade.manage','foreign_trade.post',
        'electronic_invoices.view','electronic_invoices.manage',
        'electronic_invoices.submit','electronic_invoices.configure'
      );
      DROP TABLE IF EXISTS "accounting"."ttn_einvoice_submissions";
      DROP TABLE IF EXISTS "accounting"."ttn_einvoice_configurations";
      DROP TABLE IF EXISTS "accounting"."foreign_trade_operations";
      DROP TABLE IF EXISTS "accounting"."vat_suspension_certificates";
      DROP TABLE IF EXISTS "accounting"."currency_exchange_rates";
    `);
  }
}
