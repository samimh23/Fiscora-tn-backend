import { MigrationInterface, QueryRunner } from 'typeorm';

export class IsAndForfaitaireParameters1784369000000 implements MigrationInterface {
  name = 'IsAndForfaitaireParameters1784369000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSource =
      "Code de l'IRPP et de l'IS, tel que modifié par la loi de finances 2021 (réforme du taux de l'IS) — taux et minimum à confirmer par le cabinet selon le secteur exact et la loi de finances en vigueur";
    const isSourceUrl =
      'https://www.finances.gov.tn/fr/code-de-lirpp-et-de-lis';
    await queryRunner.query(
      `
      INSERT INTO "accounting"."fiscal_parameters"
        ("organization_id","code","label","value_type","value","effective_from","source_label","source_url","notes","is_system")
      VALUES
        (NULL,'IS_TAUX_STANDARD','IS — taux standard (droit commun)','TAUX',0.15000,'2021-01-01',$1,$2,'Taux de droit commun depuis la réforme de la loi de finances 2021. Ne pas appliquer sans vérifier le secteur d''activité du client.',true),
        (NULL,'IS_TAUX_MAJORE','IS — taux majoré (secteurs réglementés : banques, assurances, télécommunications, hydrocarbures)','TAUX',0.35000,'2021-01-01',$1,$2,'Concerne les secteurs listés par le texte. Vérifier l''appartenance sectorielle exacte du client avant application.',true),
        (NULL,'IS_TAUX_EXPORTATEUR','IS — taux réduit sociétés totalement exportatrices','TAUX',0.10000,'2021-01-01',$1,$2,'S''applique aux sociétés totalement exportatrices depuis la suppression du régime d''exonération totale. Vérifier l''éligibilité et la période transitoire du client.',true),
        (NULL,'IS_MINIMUM_TAUX','IS — taux du minimum d''impôt (assis sur le chiffre d''affaires local TTC)','TAUX',0.00200,'2021-01-01',$1,$2,'Minimum d''impôt dû même en l''absence de bénéfice fiscal, sous réserve des exonérations et plafonds applicables au client.',true),
        (NULL,'IS_MINIMUM_PLANCHER','IS — plancher du minimum d''impôt','MONTANT',500.00000,'2021-01-01',$1,$2,'Montant plancher annuel du minimum d''impôt. À confirmer selon le régime exact du client.',true)
      `,
      [isSource, isSourceUrl],
    );

    const forfaitaireSource =
      'Loi n° 2025-17 du 12 décembre 2025 — Loi de finances 2026, article 91 (régime forfaitaire optionnel)';
    const forfaitaireSourceUrl =
      'https://www.finances.gov.tn/fr/document/loi-des-finances-pour-lannee-2026-ar';
    await queryRunner.query(
      `
      INSERT INTO "accounting"."fiscal_parameters"
        ("organization_id","code","label","value_type","value","effective_from","source_label","source_url","notes","is_system")
      VALUES
        (NULL,'FORFAITAIRE_SEUIL_BAS','Régime forfaitaire — plafond de chiffre d''affaires de la tranche basse','MONTANT',50000.00000,'2026-01-01',$1,$2,'Voir la règle réglementaire LF2026_ART91_FORFAIT. Vérifier les exclusions d''activité et l''option du contribuable.',true),
        (NULL,'FORFAITAIRE_MONTANT_BAS','Régime forfaitaire — montant annuel forfaitaire jusqu''au seuil bas','MONTANT',4000.00000,'2026-01-01',$1,$2,'Voir la règle réglementaire LF2026_ART91_FORFAIT.',true),
        (NULL,'FORFAITAIRE_SEUIL_HAUT','Régime forfaitaire — plafond de chiffre d''affaires maximal d''éligibilité','MONTANT',100000.00000,'2026-01-01',$1,$2,'Voir la règle réglementaire LF2026_ART91_FORFAIT.',true),
        (NULL,'FORFAITAIRE_MONTANT_HAUT','Régime forfaitaire — montant annuel forfaitaire entre les deux seuils','MONTANT',5000.00000,'2026-01-01',$1,$2,'Voir la règle réglementaire LF2026_ART91_FORFAIT.',true)
      `,
      [forfaitaireSource, forfaitaireSourceUrl],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounting"."fiscal_parameters"
        WHERE "organization_id" IS NULL AND "code" IN (
          'IS_TAUX_STANDARD','IS_TAUX_MAJORE','IS_TAUX_EXPORTATEUR',
          'IS_MINIMUM_TAUX','IS_MINIMUM_PLANCHER',
          'FORFAITAIRE_SEUIL_BAS','FORFAITAIRE_MONTANT_BAS',
          'FORFAITAIRE_SEUIL_HAUT','FORFAITAIRE_MONTANT_HAUT'
        );
    `);
  }
}
