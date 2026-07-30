import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasSubscriptions1784358000000 implements MigrationInterface {
  name = 'SaasSubscriptions1784358000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."saas_plans" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "code" varchar(50) NOT NULL UNIQUE,
        "name" varchar(120) NOT NULL,
        "description" text,
        "monthly_price_tnd" numeric(12,3) NOT NULL,
        "annual_price_tnd" numeric(12,3) NOT NULL,
        "max_collaborators" integer NOT NULL CHECK ("max_collaborators" > 0),
        "max_active_dossiers" integer NOT NULL CHECK ("max_active_dossiers" > 0),
        "max_storage_bytes" bigint NOT NULL CHECK ("max_storage_bytes" > 0),
        "monthly_ocr_documents" integer NOT NULL CHECK ("monthly_ocr_documents" >= 0),
        "monthly_ttn_submissions" integer NOT NULL CHECK ("monthly_ttn_submissions" >= 0),
        "features_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_public" boolean NOT NULL DEFAULT true,
        "display_order" integer NOT NULL DEFAULT 0
      );

      CREATE TABLE "accounting"."organization_subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "organization_id" uuid NOT NULL UNIQUE,
        "plan_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ESSAI'
          CHECK ("status" IN ('ESSAI', 'ACTIF', 'IMPAYE', 'SUSPENDU', 'ANNULE')),
        "billing_cycle" varchar(20) NOT NULL DEFAULT 'MENSUEL'
          CHECK ("billing_cycle" IN ('MENSUEL', 'ANNUEL')),
        "trial_ends_at_utc" timestamptz,
        "current_period_start_utc" timestamptz NOT NULL,
        "current_period_end_utc" timestamptz NOT NULL,
        "grace_ends_at_utc" timestamptz,
        "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        CONSTRAINT "FK_subscription_organization"
          FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscription_plan"
          FOREIGN KEY ("plan_id") REFERENCES "accounting"."saas_plans"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_subscription_period"
          CHECK ("current_period_end_utc" > "current_period_start_utc")
      );

      CREATE TABLE "accounting"."saas_subscription_invoices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "number" varchar(60) NOT NULL UNIQUE,
        "organization_id" uuid NOT NULL,
        "subscription_id" uuid NOT NULL,
        "period_start_utc" timestamptz NOT NULL,
        "period_end_utc" timestamptz NOT NULL,
        "amount_tnd" numeric(12,3) NOT NULL CHECK ("amount_tnd" >= 0),
        "due_at_utc" timestamptz NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'BROUILLON'
          CHECK ("status" IN ('BROUILLON', 'A_PAYER', 'PAYEE', 'ANNULEE')),
        "paid_at_utc" timestamptz,
        "payment_reference" varchar(160),
        CONSTRAINT "FK_saas_invoice_organization"
          FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_saas_invoice_subscription"
          FOREIGN KEY ("subscription_id") REFERENCES "accounting"."organization_subscriptions"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_saas_invoice_period"
          CHECK ("period_end_utc" > "period_start_utc")
      );

      CREATE INDEX "IDX_subscriptions_status"
        ON "accounting"."organization_subscriptions" ("status");
      CREATE INDEX "IDX_saas_invoices_organization_due"
        ON "accounting"."saas_subscription_invoices" ("organization_id", "due_at_utc");
      CREATE INDEX "IDX_saas_invoices_status"
        ON "accounting"."saas_subscription_invoices" ("status");

      INSERT INTO "accounting"."saas_plans"
        ("code", "name", "description", "monthly_price_tnd", "annual_price_tnd",
         "max_collaborators", "max_active_dossiers", "max_storage_bytes",
         "monthly_ocr_documents", "monthly_ttn_submissions", "features_json", "display_order")
      VALUES
        ('ESSENTIEL', 'Essentiel', 'Pour démarrer la digitalisation d’un petit cabinet.',
         59.000, 590.000, 3, 20, 10737418240, 200, 100,
         '{"reportingAdvanced": false, "prioritySupport": false}'::jsonb, 10),
        ('PRO', 'Professionnel', 'Pour les cabinets en croissance avec automatisation complète.',
         149.000, 1490.000, 10, 100, 53687091200, 1500, 1000,
         '{"reportingAdvanced": true, "prioritySupport": false}'::jsonb, 20),
        ('CABINET_PLUS', 'Cabinet Plus', 'Pour les équipes importantes et les volumes élevés.',
         299.000, 2990.000, 30, 500, 214748364800, 5000, 5000,
         '{"reportingAdvanced": true, "prioritySupport": true}'::jsonb, 30);

      INSERT INTO "accounting"."organization_subscriptions"
        ("organization_id", "plan_id", "status", "billing_cycle",
         "trial_ends_at_utc", "current_period_start_utc", "current_period_end_utc")
      SELECT
        organization."id",
        plan."id",
        'ESSAI',
        'MENSUEL',
        now() + interval '30 days',
        now(),
        now() + interval '30 days'
      FROM "accounting"."organizations" organization
      CROSS JOIN "accounting"."saas_plans" plan
      WHERE plan."code" = 'PRO';

      CREATE OR REPLACE FUNCTION "accounting"."create_default_subscription"()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO "accounting"."organization_subscriptions"
          ("organization_id", "plan_id", "status", "billing_cycle",
           "trial_ends_at_utc", "current_period_start_utc", "current_period_end_utc")
        SELECT
          NEW."id", plan."id", 'ESSAI', 'MENSUEL',
          now() + interval '30 days', now(), now() + interval '30 days'
        FROM "accounting"."saas_plans" plan
        WHERE plan."code" = 'PRO';
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER "TRG_create_default_subscription"
      AFTER INSERT ON "accounting"."organizations"
      FOR EACH ROW EXECUTE FUNCTION "accounting"."create_default_subscription"();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_create_default_subscription" ON "accounting"."organizations";
      DROP FUNCTION IF EXISTS "accounting"."create_default_subscription"();
      DROP TABLE IF EXISTS "accounting"."saas_subscription_invoices";
      DROP TABLE IF EXISTS "accounting"."organization_subscriptions";
      DROP TABLE IF EXISTS "accounting"."saas_plans";
    `);
  }
}
