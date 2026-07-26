import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinanceLaw20261784355000000 implements MigrationInterface {
  name = 'FinanceLaw20261784355000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounting"."regulatory_rules" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at_utc" timestamptz NOT NULL DEFAULT now(),
        "updated_at_utc" timestamptz DEFAULT now(),
        "code" varchar(80) NOT NULL,
        "category" varchar(80) NOT NULL,
        "title" varchar(240) NOT NULL,
        "summary" text NOT NULL,
        "article_reference" varchar(80) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(40) NOT NULL,
        "impacted_modules" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "applicability" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "source_label" varchar(250) NOT NULL,
        "source_url" varchar(1000) NOT NULL,
        "notes" text,
        CONSTRAINT "UQ_regulatory_rule_version" UNIQUE ("code","effective_from"),
        CONSTRAINT "CHK_regulatory_rule_dates"
          CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
      );
      CREATE INDEX "IDX_regulatory_rule_applicable"
        ON "accounting"."regulatory_rules" ("effective_from","effective_to","status");

      ALTER TABLE "accounting"."business_invoices"
        ADD COLUMN "nature" varchar(20) NOT NULL DEFAULT 'MIXTE';

      ALTER TABLE "accounting"."employees"
        ADD COLUMN "is_higher_education_graduate" boolean NOT NULL DEFAULT false,
        ADD COLUMN "employer_support_eligible" boolean NOT NULL DEFAULT false,
        ADD COLUMN "employer_support_start_date" date;

      ALTER TABLE "accounting"."payroll_runs"
        ADD COLUMN "total_employer_support" numeric(15,3) NOT NULL DEFAULT 0;

      ALTER TABLE "accounting"."payroll_lines"
        ADD COLUMN "employer_cnss_gross" numeric(15,3) NOT NULL DEFAULT 0,
        ADD COLUMN "employer_support_rate" numeric(8,5) NOT NULL DEFAULT 0,
        ADD COLUMN "employer_support_amount" numeric(15,3) NOT NULL DEFAULT 0;

      UPDATE "accounting"."payroll_lines"
        SET "employer_cnss_gross" = "employer_cnss";

      ALTER TABLE "accounting"."foreign_trade_operations"
        ADD COLUMN "repatriation_date" date,
        ADD COLUMN "repatriation_bank_reference" varchar(160),
        ADD COLUMN "repatriation_proof_document_id" uuid;
    `);

    const sourceUrl =
      'https://www.finances.gov.tn/fr/document/loi-des-finances-pour-lannee-2026-ar';
    await queryRunner.query(
      `
      INSERT INTO "accounting"."regulatory_rules"
        ("code","category","title","summary","article_reference","effective_from",
         "status","impacted_modules","applicability","source_label","source_url","notes")
      VALUES
        ('LF2026_ART13_EMPLOI','SOCIAL',
         'Prise en charge dégressive des cotisations patronales',
         'Pour les recrutements éligibles de diplômés de l’enseignement supérieur à compter du 1er janvier 2026, la prise en charge est de 100 %, 80 %, 60 %, 40 % puis 20 % sur cinq années.',
         'Article 13','2026-01-01','ACTION_REQUISE',
         '["PAIE","CNSS"]'::jsonb,
         '{"rates":[1,0.8,0.6,0.4,0.2],"eligibilityMustBeConfirmed":true}'::jsonb,
         'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026',$1,
         'L’éligibilité doit être vérifiée et documentée par le cabinet avant activation sur un salarié.'),
        ('LF2026_ART20_TIMBRE_GRANDE_DISTRIBUTION','FISCAL',
         'Droit de timbre spécifique à la grande distribution',
         'Pour les entreprises relevant de la grande distribution, le droit est de 1,500 TND pour une facture de 50 à 100 TND et de 2,000 TND au-delà de 100 TND.',
         'Article 20','2026-01-01','ACTION_REQUISE',
         '["FACTURES","PARAMETRES_FISCAUX"]'::jsonb,
         '{"sector":"GRANDE_DISTRIBUTION","tiers":[{"from":50,"to":100,"amount":1.5},{"fromExclusive":100,"amount":2}]}'::jsonb,
         'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026',$1,
         'Ne pas appliquer automatiquement sans confirmer le secteur et l’assiette avec le conseil fiscal.'),
        ('LF2026_ART53_EFACTURES_SERVICES','FACTURATION_ELECTRONIQUE',
         'Extension de la facturation électronique aux services',
         'Le champ de la facturation électronique est étendu aux opérations de prestations de services à compter de 2026.',
         'Article 53','2026-01-01','ACTIVE',
         '["FACTURES","FACTURATION_TTN"]'::jsonb,
         '{"invoiceNatures":["SERVICES","MIXTE"]}'::jsonb,
         'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026',$1,
         'La transmission réelle dépend du schéma, des certificats et de l’habilitation TTN du contribuable.'),
        ('LF2026_ART56_PENSIONS','IRPP',
         'Relèvement progressif de la déduction sur les pensions',
         'La déduction sur les pensions et rentes viagères est portée à 25 % en 2026, 30 % en 2027, 40 % en 2028 et 50 % en 2029.',
         'Article 56','2026-01-01','INFORMATION',
         '["DECLARATIONS","IRPP"]'::jsonb,
         '{"ratesByYear":{"2026":0.25,"2027":0.3,"2028":0.4,"2029":0.5}}'::jsonb,
         'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026',$1,NULL),
        ('LF2026_ART74_RAPATRIEMENT','COMMERCE_EXTERIEUR',
         'Justification bancaire du rapatriement des recettes d’export',
         'Les relevés bancaires peuvent constituer une preuve du rapatriement des recettes d’exportation lorsque les conditions prévues par le texte sont réunies.',
         'Article 74','2026-01-01','ACTIVE',
         '["COMMERCE_EXTERIEUR","DOCUMENTS"]'::jsonb,
         '{"direction":"EXPORT","proof":"BANK_STATEMENT"}'::jsonb,
         'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026',$1,
         'Conserver la référence bancaire et la pièce justificative avec l’opération.'),
        ('LF2026_ART87_CSS','FISCAL',
         'Contribution sociale de solidarité 2026',
         'La contribution sociale de solidarité est maintenue pour les bénéfices et revenus soumis aux échéances déclaratives de 2026.',
         'Article 87','2026-01-01','ACTION_REQUISE',
         '["DECLARATIONS","CALENDRIER_FISCAL"]'::jsonb,
         '{"year":2026,"requiresTaxpayerQualification":true}'::jsonb,
         'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026',$1,
         'Le taux et l’assiette doivent être résolus selon la catégorie du contribuable.'),
        ('LF2026_ART88_PATRIMOINE','FISCAL',
         'Impôt sur la fortune',
         'Taux de 0,5 % entre 3 et 5 millions de dinars et de 1 % au-delà de 5 millions, avec déclaration électronique avant fin juin et exemptions prévues par la loi.',
         'Article 88','2026-01-01','ACTION_REQUISE',
         '["DECLARATIONS","CALENDRIER_FISCAL"]'::jsonb,
         '{"thresholds":[{"from":3000000,"to":5000000,"rate":0.005},{"fromExclusive":5000000,"rate":0.01}],"dueMonth":6}'::jsonb,
         'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026',$1,
         'Une collecte détaillée du patrimoine, des dettes et des exemptions est nécessaire avant calcul.'),
        ('LF2026_ART91_FORFAIT','REGIME_FISCAL',
         'Régime forfaitaire optionnel jusqu’à 100 000 TND',
         'Régime optionnel sous conditions : 4 000 TND jusqu’à 50 000 TND de chiffre d’affaires et 5 000 TND entre 50 001 et 100 000 TND, avec exclusions et réduction territoriale prévues par la loi.',
         'Article 91','2026-01-01','ACTION_REQUISE',
         '["DOSSIERS","DECLARATIONS","CALENDRIER_FISCAL"]'::jsonb,
         '{"turnoverMaximum":100000,"amounts":[{"to":50000,"amount":4000},{"from":50001,"to":100000,"amount":5000}],"deadlines":["04-25","10-25"]}'::jsonb,
         'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026',$1,
         'Vérifier les exclusions d’activité et l’option du contribuable avant activation.')
      `,
      [sourceUrl],
    );

    await queryRunner.query(
      `
      INSERT INTO "accounting"."vat_rates"
        ("organization_id","code","label","rate","effective_from","source_label","source_url","is_system")
      VALUES
        (NULL,'TVA_7','TVA 7 %',0.07000,'2026-01-01','Référentiel fiscal tunisien — à confirmer selon activité',$1,true),
        (NULL,'TVA_13','TVA 13 %',0.13000,'2026-01-01','Référentiel fiscal tunisien — à confirmer selon activité',$1,true),
        (NULL,'TVA_19','TVA 19 %',0.19000,'2026-01-01','Référentiel fiscal tunisien — à confirmer selon activité',$1,true);
      `,
      [sourceUrl],
    );
    await queryRunner.query(
      `
      INSERT INTO "accounting"."fiscal_parameters"
        ("organization_id","code","label","value_type","value","effective_from","source_label","source_url","notes","is_system")
      VALUES
        (NULL,'TIMBRE_MONTANT','Droit de timbre standard','MONTANT',1.00000,'2026-01-01','Référentiel fiscal tunisien — valeur cabinet à confirmer',$1,'Le cas spécifique grande distribution est présenté séparément et ne doit pas être appliqué sans qualification.',true),
        (NULL,'TFP_TAUX_INDUSTRIE','TFP — activité industrielle','TAUX',0.01000,'2026-01-01','Référentiel fiscal tunisien — à confirmer selon activité',$1,'Vérifier le régime et les exonérations du client.',true),
        (NULL,'TFP_TAUX_AUTRES','TFP — autres activités','TAUX',0.02000,'2026-01-01','Référentiel fiscal tunisien — à confirmer selon activité',$1,'Vérifier le régime et les exonérations du client.',true),
        (NULL,'FOPROLOS_TAUX','FOPROLOS','TAUX',0.01000,'2026-01-01','Référentiel fiscal tunisien — à confirmer selon activité',$1,'Vérifier l’assujettissement du client.',true),
        (NULL,'TCL_TAUX','TCL','TAUX',0.00200,'2026-01-01','Référentiel fiscal tunisien — à confirmer selon activité',$1,'Vérifier le minimum, le plafond et les règles locales applicables.',true);
      `,
      [sourceUrl],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounting"."fiscal_parameters"
        WHERE "organization_id" IS NULL AND "effective_from" = '2026-01-01'
          AND "code" IN ('TIMBRE_MONTANT','TFP_TAUX_INDUSTRIE','TFP_TAUX_AUTRES','FOPROLOS_TAUX','TCL_TAUX');
      DELETE FROM "accounting"."vat_rates"
        WHERE "organization_id" IS NULL AND "effective_from" = '2026-01-01'
          AND "code" IN ('TVA_7','TVA_13','TVA_19');
      ALTER TABLE "accounting"."foreign_trade_operations"
        DROP COLUMN IF EXISTS "repatriation_proof_document_id",
        DROP COLUMN IF EXISTS "repatriation_bank_reference",
        DROP COLUMN IF EXISTS "repatriation_date";
      ALTER TABLE "accounting"."payroll_lines"
        DROP COLUMN IF EXISTS "employer_support_amount",
        DROP COLUMN IF EXISTS "employer_support_rate",
        DROP COLUMN IF EXISTS "employer_cnss_gross";
      ALTER TABLE "accounting"."payroll_runs"
        DROP COLUMN IF EXISTS "total_employer_support";
      ALTER TABLE "accounting"."employees"
        DROP COLUMN IF EXISTS "employer_support_start_date",
        DROP COLUMN IF EXISTS "employer_support_eligible",
        DROP COLUMN IF EXISTS "is_higher_education_graduate";
      ALTER TABLE "accounting"."business_invoices"
        DROP COLUMN IF EXISTS "nature";
      DROP TABLE IF EXISTS "accounting"."regulatory_rules";
    `);
  }
}
