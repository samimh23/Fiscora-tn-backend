import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  collaboratorPermissions,
  ownerPermissions,
  permissionSeed,
  SystemRoleNames,
} from '../permissions';

export class BusinessModules1784230000000 implements MigrationInterface {
  name = 'BusinessModules1784230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."accounting_documents" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "dossier_id" uuid NOT NULL, "task_id" uuid, "obligation_id" uuid,
        "original_name" varchar(300) NOT NULL, "object_key" varchar(1000) NOT NULL UNIQUE,
        "mime_type" varchar(150) NOT NULL, "size_bytes" bigint NOT NULL, "category" varchar(40) NOT NULL,
        "period_year" integer, "period_month" smallint, "processing_status" varchar(20) NOT NULL DEFAULT 'A_TRAITER',
        "extraction_status" varchar(20) NOT NULL DEFAULT 'NON_DEMANDEE', "extracted_data" jsonb,
        "version" integer NOT NULL DEFAULT 1, "replaces_document_id" uuid, "uploaded_by_user_id" uuid NOT NULL,
        "deleted_at_utc" timestamptz,
        CONSTRAINT "FK_documents_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_documents_task" FOREIGN KEY ("task_id") REFERENCES "accounting"."work_tasks"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_documents_obligation" FOREIGN KEY ("obligation_id") REFERENCES "accounting"."obligation_instances"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_documents_version" FOREIGN KEY ("replaces_document_id") REFERENCES "accounting"."accounting_documents"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_documents_period" ON "accounting"."accounting_documents" ("organization_id","dossier_id","period_year","period_month");
      CREATE INDEX "IDX_documents_status" ON "accounting"."accounting_documents" ("organization_id","category","processing_status");

      CREATE TABLE "accounting"."missing_document_expectations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "dossier_id" uuid NOT NULL, "period_year" integer NOT NULL,
        "period_month" smallint NOT NULL, "label" varchar(250) NOT NULL, "category" varchar(40) NOT NULL,
        "received_document_id" uuid,
        UNIQUE ("dossier_id","period_year","period_month","label"),
        CONSTRAINT "FK_missing_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_missing_document" FOREIGN KEY ("received_document_id") REFERENCES "accounting"."accounting_documents"("id") ON DELETE SET NULL
      );

      CREATE TABLE "accounting"."notifications" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "recipient_user_id" uuid NOT NULL, "type" varchar(80) NOT NULL,
        "title" varchar(250) NOT NULL, "body" text NOT NULL, "entity_type" varchar(80), "entity_id" uuid,
        "channel" varchar(20) NOT NULL DEFAULT 'IN_APP', "deduplication_key" varchar(300) NOT NULL,
        "read_at_utc" timestamptz, UNIQUE ("organization_id","deduplication_key"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("recipient_user_id") REFERENCES "accounting"."users"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_notifications_user" ON "accounting"."notifications" ("recipient_user_id","read_at_utc","created_at_utc");

      CREATE TABLE "accounting"."monthly_tax_declarations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "dossier_id" uuid NOT NULL, "obligation_id" uuid,
        "period_year" integer NOT NULL, "period_month" smallint NOT NULL,
        "vat_collected" numeric(15,3) NOT NULL, "vat_deductible" numeric(15,3) NOT NULL,
        "vat_credit_previous" numeric(15,3) NOT NULL, "vat_due" numeric(15,3) NOT NULL,
        "vat_credit_next" numeric(15,3) NOT NULL, "withholding_tax" numeric(15,3) NOT NULL,
        "tfp_base" numeric(15,3) NOT NULL, "tfp_rate" numeric(8,5) NOT NULL, "tfp_due" numeric(15,3) NOT NULL,
        "foprolos_base" numeric(15,3) NOT NULL, "foprolos_rate" numeric(8,5) NOT NULL, "foprolos_due" numeric(15,3) NOT NULL,
        "tcl_base" numeric(15,3) NOT NULL, "tcl_rate" numeric(8,5) NOT NULL, "tcl_due" numeric(15,3) NOT NULL,
        "stamp_duty" numeric(15,3) NOT NULL, "total_due" numeric(15,3) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'BROUILLON', "snapshot_json" jsonb,
        "validated_by_user_id" uuid, "validated_at_utc" timestamptz, "filed_at_utc" timestamptz,
        UNIQUE ("dossier_id","period_year","period_month"),
        CONSTRAINT "FK_declaration_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_declaration_obligation" FOREIGN KEY ("obligation_id") REFERENCES "accounting"."obligation_instances"("id") ON DELETE SET NULL
      );

      CREATE TABLE "accounting"."accounting_journals" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "dossier_id" uuid NOT NULL, "code" varchar(20) NOT NULL,
        "name" varchar(150) NOT NULL, "type" varchar(30) NOT NULL, "is_active" boolean NOT NULL DEFAULT true,
        UNIQUE ("dossier_id","code"),
        CONSTRAINT "FK_journal_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );
      CREATE TABLE "accounting"."journal_entries" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "dossier_id" uuid NOT NULL, "journal_id" uuid NOT NULL,
        "entry_date" date NOT NULL, "piece_reference" varchar(100) NOT NULL, "description" varchar(300) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'BROUILLON', "total_debit" numeric(15,3) NOT NULL,
        "total_credit" numeric(15,3) NOT NULL, "source_document_id" uuid, "created_by_user_id" uuid NOT NULL,
        "posted_by_user_id" uuid, "posted_at_utc" timestamptz, "reversal_entry_id" uuid,
        CONSTRAINT "FK_entry_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_entry_journal" FOREIGN KEY ("journal_id") REFERENCES "accounting"."accounting_journals"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_entry_document" FOREIGN KEY ("source_document_id") REFERENCES "accounting"."accounting_documents"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_entries_period" ON "accounting"."journal_entries" ("organization_id","dossier_id","entry_date","status");
      CREATE TABLE "accounting"."journal_entry_lines" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "entry_id" uuid NOT NULL, "account_id" uuid NOT NULL,
        "label" varchar(300) NOT NULL, "debit" numeric(15,3) NOT NULL DEFAULT 0,
        "credit" numeric(15,3) NOT NULL DEFAULT 0, "third_party_name" varchar(200),
        CONSTRAINT "FK_line_entry" FOREIGN KEY ("entry_id") REFERENCES "accounting"."journal_entries"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_line_account" FOREIGN KEY ("account_id") REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_line_side" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
      );

      CREATE TABLE "accounting"."cabinet_invoices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "dossier_id" uuid NOT NULL, "number" varchar(50) NOT NULL,
        "issue_date" date NOT NULL, "due_date" date NOT NULL, "description" varchar(300) NOT NULL,
        "net_amount" numeric(15,3) NOT NULL, "vat_rate" numeric(8,5) NOT NULL, "vat_amount" numeric(15,3) NOT NULL,
        "stamp_duty" numeric(15,3) NOT NULL, "total_amount" numeric(15,3) NOT NULL,
        "paid_amount" numeric(15,3) NOT NULL DEFAULT 0, "status" varchar(30) NOT NULL DEFAULT 'BROUILLON',
        "notes" text, "created_by_user_id" uuid NOT NULL, UNIQUE ("organization_id","number"),
        CONSTRAINT "FK_invoice_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE RESTRICT
      );
      CREATE TABLE "accounting"."cabinet_payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "invoice_id" uuid NOT NULL, "payment_date" date NOT NULL,
        "amount" numeric(15,3) NOT NULL, "reference" varchar(100), "recorded_by_user_id" uuid NOT NULL,
        CONSTRAINT "FK_payment_invoice" FOREIGN KEY ("invoice_id") REFERENCES "accounting"."cabinet_invoices"("id") ON DELETE CASCADE
      );

      CREATE TABLE "accounting"."employees" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "dossier_id" uuid NOT NULL, "full_name" varchar(180) NOT NULL,
        "cin" varchar(20), "cnss_number" varchar(50), "hire_date" date NOT NULL,
        "contract_type" varchar(50) NOT NULL, "gross_salary" numeric(15,3) NOT NULL, "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "FK_employee_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );
      CREATE TABLE "accounting"."payroll_runs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "dossier_id" uuid NOT NULL, "period_year" integer NOT NULL,
        "period_month" smallint NOT NULL, "employee_rate" numeric(8,5) NOT NULL, "employer_rate" numeric(8,5) NOT NULL,
        "income_tax_rate" numeric(8,5) NOT NULL, "total_gross" numeric(15,3) NOT NULL,
        "total_net" numeric(15,3) NOT NULL, "total_employer_cost" numeric(15,3) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'BROUILLON', UNIQUE ("dossier_id","period_year","period_month"),
        CONSTRAINT "FK_payroll_dossier" FOREIGN KEY ("dossier_id") REFERENCES "accounting"."client_dossiers"("id") ON DELETE CASCADE
      );
      CREATE TABLE "accounting"."payroll_lines" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(), "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL, "run_id" uuid NOT NULL, "employee_id" uuid NOT NULL,
        "gross_salary" numeric(15,3) NOT NULL, "employee_cnss" numeric(15,3) NOT NULL,
        "income_tax" numeric(15,3) NOT NULL, "net_salary" numeric(15,3) NOT NULL,
        "employer_cnss" numeric(15,3) NOT NULL,
        CONSTRAINT "FK_payroll_line_run" FOREIGN KEY ("run_id") REFERENCES "accounting"."payroll_runs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payroll_line_employee" FOREIGN KEY ("employee_id") REFERENCES "accounting"."employees"("id") ON DELETE RESTRICT
      );
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
      DROP TABLE IF EXISTS "accounting"."payroll_lines";
      DROP TABLE IF EXISTS "accounting"."payroll_runs";
      DROP TABLE IF EXISTS "accounting"."employees";
      DROP TABLE IF EXISTS "accounting"."cabinet_payments";
      DROP TABLE IF EXISTS "accounting"."cabinet_invoices";
      DROP TABLE IF EXISTS "accounting"."journal_entry_lines";
      DROP TABLE IF EXISTS "accounting"."journal_entries";
      DROP TABLE IF EXISTS "accounting"."accounting_journals";
      DROP TABLE IF EXISTS "accounting"."monthly_tax_declarations";
      DROP TABLE IF EXISTS "accounting"."notifications";
      DROP TABLE IF EXISTS "accounting"."missing_document_expectations";
      DROP TABLE IF EXISTS "accounting"."accounting_documents";
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
