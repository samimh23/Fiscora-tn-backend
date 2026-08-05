import { MigrationInterface, QueryRunner } from 'typeorm';

export class WithholdingRateCatalog1784368000000
  implements MigrationInterface
{
  name = 'WithholdingRateCatalog1784368000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sourceUrl = 'https://www.finances.gov.tn/fr/code-de-lirpp-et-de-lis';
    const sourceLabel =
      "Code de l'IRPP et de l'IS — article 52 (barème des retenues à la source) — taux à confirmer par le cabinet selon la nature exacte du revenu, le statut du bénéficiaire et la loi de finances en vigueur";

    await queryRunner.query(
      `
      INSERT INTO "accounting"."withholding_tax_rates"
        ("organization_id","nature_code","label","rate","effective_from","source_label","source_url","is_system")
      VALUES
        (NULL,'RS_1_5_ACHATS','1,5% — Achats de marchandises, matériel, équipements, services et travaux (montant ≥ 1 000 TND TTC)',0.01500,'2026-01-01',$1,$2,true),
        (NULL,'RS_5_HONORAIRES','5% — Honoraires, commissions, courtages, loyers et rémunérations de prestations de services',0.05000,'2026-01-01',$1,$2,true),
        (NULL,'RS_10_JETONS_PRESENCE','10% — Jetons de présence servis aux membres du conseil d''administration ou de surveillance',0.10000,'2026-01-01',$1,$2,true),
        (NULL,'RS_15_BNC_OCCASIONNEL','15% — Rémunérations occasionnelles ou accidentelles à caractère non commercial',0.15000,'2026-01-01',$1,$2,true),
        (NULL,'RS_20_NON_RESIDENT','20% — Montants payés à des personnes non résidentes et non établies en Tunisie (taux de droit commun, sous réserve des conventions de non double imposition)',0.20000,'2026-01-01',$1,$2,true),
        (NULL,'RS_25_PARADIS_FISCAL','25% — Montants servis à des personnes résidentes ou établies dans un État ou territoire dont le régime fiscal est privilégié',0.25000,'2026-01-01',$1,$2,true)
      `,
      [sourceLabel, sourceUrl],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounting"."withholding_tax_rates"
        WHERE "organization_id" IS NULL AND "effective_from" = '2026-01-01'
          AND "nature_code" IN (
            'RS_1_5_ACHATS','RS_5_HONORAIRES','RS_10_JETONS_PRESENCE',
            'RS_15_BNC_OCCASIONNEL','RS_20_NON_RESIDENT','RS_25_PARADIS_FISCAL'
          );
    `);
  }
}
