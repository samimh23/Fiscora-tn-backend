import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { DataSource, Repository } from 'typeorm';
import {
  AnnualTaxFiling,
  DossierTaxRegime,
  FiscalParameterCode,
  TaxLossCarryforward,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { FiscalSettingsService } from '../fiscal-settings/fiscal-settings.service';
import { AnnualTaxCalculationDto } from './dto';

type MoneySource = string | number | bigint;

const LOSS_CARRYFORWARD_YEARS = 4;

export interface AnnualTaxReport {
  generatedAtUtc: string;
  warning: string;
  finalized: boolean;
  dossier: {
    id: string;
    legalName: string;
    taxIdentifier: string | null;
    rneNumber: string | null;
    legalForm: string;
    taxRegime: string;
  };
  period: { year: number; startsOn: string; endsOn: string };
  accounting: {
    revenue: string;
    expenses: string;
    accountingResult: string;
    source: string;
  };
  fiscal: {
    regime: 'IS' | 'FORFAITAIRE';
    reintegrationsTotal: string;
    deductionsTotal: string;
    fiscalResultBeforeCarryforward: string;
    carryforwardApplied: string;
    carryforwardAvailable: string;
    fiscalResult: string;
    corporateTaxRate: string;
    grossCorporateTax: string;
    minimumTax: string;
    forfaitaireTax: string;
    baseTax: string;
    taxCredits: string;
    netTaxDue: string;
  };
  regularisation: {
    impotDu: string;
    retenueALaSourceSubie: string;
    acomptesVerses: string;
    excedentsAnterieurs: string;
    autresCredits: string;
    resultat: string;
    sens: 'REPORT' | 'DU';
  };
  installments: Array<{
    label: string;
    dueOn: string;
    baseTax: string;
    rate: string;
    amount: string;
  }>;
  liasseChecklist: Array<{ label: string; status: 'OK' | 'A_COMPLETER' }>;
  inputs: AnnualTaxCalculationDto;
}

@Injectable()
export class AnnualTaxService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(TaxLossCarryforward)
    private readonly carryforwards: Repository<TaxLossCarryforward>,
    @InjectRepository(AnnualTaxFiling)
    private readonly filings: Repository<AnnualTaxFiling>,
    private readonly dossiers: DossiersService,
    private readonly fiscalSettings: FiscalSettingsService,
  ) {}

  async calculate(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
    input: AnnualTaxCalculationDto = {},
  ): Promise<AnnualTaxReport> {
    return this.buildReport(
      organizationId,
      dossierId,
      userId,
      year,
      input,
      false,
    );
  }

  async finalize(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
    input: AnnualTaxCalculationDto = {},
  ): Promise<AnnualTaxReport> {
    if (
      await this.filings.existsBy({
        organizationId,
        dossierId,
        periodYear: year,
      })
    )
      throw new ConflictException(
        `L'exercice ${year} a déjà été clôturé pour la préparation fiscale annuelle.`,
      );
    return this.dataSource.transaction(async (manager) => {
      const report = await this.buildReport(
        organizationId,
        dossierId,
        userId,
        year,
        input,
        true,
        manager,
      );
      await manager.save(
        manager.create(AnnualTaxFiling, {
          organizationId,
          dossierId,
          periodYear: year,
          fiscalResultBeforeCarryforward:
            report.fiscal.fiscalResultBeforeCarryforward,
          carryforwardApplied: report.fiscal.carryforwardApplied,
          fiscalResultAfterCarryforward: report.fiscal.fiscalResult,
          netTaxDue: report.fiscal.netTaxDue,
          finalizedByUserId: userId,
          finalizedAtUtc: new Date(),
        }),
      );
      return report;
    });
  }

  async listDeficits(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const rows = await this.carryforwards.find({
      where: { organizationId, dossierId },
      order: { originYear: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      originYear: row.originYear,
      originalAmount: row.originalAmount,
      remainingAmount: row.remainingAmount,
      expiresAfterYear: row.expiresAfterYear,
      status:
        this.toMillimes(row.remainingAmount) <= 0n
          ? ('EPUISE' as const)
          : ('DISPONIBLE' as const),
    }));
  }

  private async buildReport(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
    input: AnnualTaxCalculationDto,
    finalizing: boolean,
    manager = this.dataSource.manager,
  ): Promise<AnnualTaxReport> {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const period = this.fiscalPeriod(
      year,
      dossier.fiscalYearStartMonth,
      dossier.fiscalYearStartDay,
    );
    const totals = await this.ledgerTotals(
      organizationId,
      dossierId,
      period.startsOn,
      period.endsOn,
    );
    const revenue = this.toMillimes(totals.revenue);
    const expenses = this.toMillimes(totals.expenses);
    const accountingResult = revenue - expenses;
    const reintegrationsTotal = this.adjustmentTotal(input.reintegrations);
    const deductionsTotal = this.adjustmentTotal(input.deductions);
    const fiscalResultBeforeCarryforward =
      accountingResult + reintegrationsTotal - deductionsTotal;
    const regime =
      input.regime ??
      (dossier.taxRegime === DossierTaxRegime.FlatRate ? 'FORFAITAIRE' : 'IS');

    const carryforwardRows =
      regime === 'FORFAITAIRE'
        ? []
        : await this.availableCarryforwards(
            organizationId,
            dossierId,
            year,
            manager,
          );
    const carryforwardAvailable = carryforwardRows.reduce(
      (sum, row) => sum + this.toMillimes(row.remainingAmount),
      0n,
    );
    let carryforwardApplied = 0n;
    if (regime !== 'FORFAITAIRE' && fiscalResultBeforeCarryforward > 0n) {
      let remainingToOffset = fiscalResultBeforeCarryforward;
      for (const row of carryforwardRows) {
        if (remainingToOffset <= 0n) break;
        const available = this.toMillimes(row.remainingAmount);
        const used =
          available < remainingToOffset ? available : remainingToOffset;
        carryforwardApplied += used;
        remainingToOffset -= used;
        if (finalizing && used > 0n) {
          row.remainingAmount = this.fromMillimes(available - used);
          await manager.save(TaxLossCarryforward, row);
        }
      }
    }
    const fiscalResult = fiscalResultBeforeCarryforward - carryforwardApplied;

    if (finalizing && fiscalResultBeforeCarryforward < 0n) {
      await manager.save(
        manager.create(TaxLossCarryforward, {
          organizationId,
          dossierId,
          originYear: year,
          originalAmount: this.fromMillimes(-fiscalResultBeforeCarryforward),
          remainingAmount: this.fromMillimes(-fiscalResultBeforeCarryforward),
          expiresAfterYear: year + LOSS_CARRYFORWARD_YEARS,
          sourceFilingId: null,
        }),
      );
    }

    const corporateTaxRate =
      input.corporateTaxRate ??
      (regime === 'FORFAITAIRE'
        ? '0.00000'
        : ((
            await this.fiscalSettings.resolveParameter(
              organizationId,
              this.resolveIsRateCode(dossier),
              period.endsOn,
              false,
            )
          )?.value ?? '0.15000'));
    const grossCorporateTax =
      regime === 'FORFAITAIRE'
        ? 0n
        : this.multiplyRate(
            fiscalResult > 0n ? fiscalResult : 0n,
            corporateTaxRate,
          );

    let minimumTax: bigint;
    if (input.minimumTax !== undefined) {
      minimumTax = this.toMillimes(input.minimumTax);
    } else if (regime === 'FORFAITAIRE') {
      minimumTax = 0n;
    } else {
      const [minRate, minFloor] = await Promise.all([
        this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.IsMinimumTaux,
          period.endsOn,
          false,
        ),
        this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.IsMinimumPlancher,
          period.endsOn,
          false,
        ),
      ]);
      const computed = minRate ? this.multiplyRate(revenue, minRate.value) : 0n;
      const floor = minFloor ? this.toMillimes(minFloor.value) : 0n;
      minimumTax = computed > floor ? computed : floor;
    }

    let forfaitaireTax: bigint;
    let forfaitaireWarning: string | null = null;
    if (input.forfaitaireTax !== undefined) {
      forfaitaireTax = this.toMillimes(input.forfaitaireTax);
    } else if (regime === 'FORFAITAIRE') {
      const [seuilBas, montantBas, seuilHaut, montantHaut] = await Promise.all([
        this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.ForfaitaireSeuilBas,
          period.endsOn,
          false,
        ),
        this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.ForfaitaireMontantBas,
          period.endsOn,
          false,
        ),
        this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.ForfaitaireSeuilHaut,
          period.endsOn,
          false,
        ),
        this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.ForfaitaireMontantHaut,
          period.endsOn,
          false,
        ),
      ]);
      if (seuilBas && montantBas && seuilHaut && montantHaut) {
        const seuilBasM = this.toMillimes(seuilBas.value);
        const seuilHautM = this.toMillimes(seuilHaut.value);
        if (revenue <= seuilBasM) {
          forfaitaireTax = this.toMillimes(montantBas.value);
        } else if (revenue <= seuilHautM) {
          forfaitaireTax = this.toMillimes(montantHaut.value);
        } else {
          forfaitaireTax = 0n;
          forfaitaireWarning =
            "Le chiffre d'affaires comptabilisé dépasse le plafond du régime forfaitaire (100 000 TND) — vérifier l'éligibilité du client à ce régime avant de retenir ce montant.";
        }
      } else {
        forfaitaireTax = 0n;
      }
    } else {
      forfaitaireTax = 0n;
    }

    const taxCredits = this.toMillimes(input.taxCredits ?? '0');
    const baseTax =
      regime === 'FORFAITAIRE'
        ? forfaitaireTax
        : grossCorporateTax > minimumTax
          ? grossCorporateTax
          : minimumTax;

    const withholdingCreditYear = await this.withholdingCreditForYear(
      organizationId,
      dossierId,
      period.startsOn,
      period.endsOn,
    );
    const acomptesVerses = this.toMillimes(input.acomptesVerses ?? '0');
    const excedentsAnterieurs = this.toMillimes(
      input.excedentsAnterieurs ?? '0',
    );
    const totalDeductible =
      withholdingCreditYear + acomptesVerses + excedentsAnterieurs + taxCredits;
    const regularisationResult = baseTax - totalDeductible;
    const netTaxDue = regularisationResult > 0n ? regularisationResult : 0n;

    return {
      generatedAtUtc: new Date().toISOString(),
      finalized: finalizing,
      warning: [
        'Préparation fiscale non certifiée : les taux, minimums, crédits et corrections doivent être validés selon le texte officiel applicable au client.',
        forfaitaireWarning,
      ]
        .filter(Boolean)
        .join(' '),
      dossier: {
        id: dossier.id,
        legalName: dossier.legalName,
        taxIdentifier: dossier.taxIdentifier,
        rneNumber: dossier.rneNumber,
        legalForm: dossier.legalForm,
        taxRegime: dossier.taxRegime,
      },
      period,
      accounting: {
        revenue: this.fromMillimes(revenue),
        expenses: this.fromMillimes(expenses),
        accountingResult: this.fromMillimes(accountingResult),
        source: 'Écritures comptabilisées du grand livre, comptes 6 et 7.',
      },
      fiscal: {
        regime,
        reintegrationsTotal: this.fromMillimes(reintegrationsTotal),
        deductionsTotal: this.fromMillimes(deductionsTotal),
        fiscalResultBeforeCarryforward: this.fromMillimes(
          fiscalResultBeforeCarryforward,
        ),
        carryforwardApplied: this.fromMillimes(carryforwardApplied),
        carryforwardAvailable: this.fromMillimes(carryforwardAvailable),
        fiscalResult: this.fromMillimes(fiscalResult),
        corporateTaxRate,
        grossCorporateTax: this.fromMillimes(grossCorporateTax),
        minimumTax: this.fromMillimes(minimumTax),
        forfaitaireTax: this.fromMillimes(forfaitaireTax),
        baseTax: this.fromMillimes(baseTax),
        taxCredits: this.fromMillimes(taxCredits),
        netTaxDue: this.fromMillimes(netTaxDue),
      },
      regularisation: {
        impotDu: this.fromMillimes(baseTax),
        retenueALaSourceSubie: this.fromMillimes(withholdingCreditYear),
        acomptesVerses: this.fromMillimes(acomptesVerses),
        excedentsAnterieurs: this.fromMillimes(excedentsAnterieurs),
        autresCredits: this.fromMillimes(taxCredits),
        resultat: this.fromMillimes(
          regularisationResult < 0n
            ? -regularisationResult
            : regularisationResult,
        ),
        sens: regularisationResult < 0n ? 'REPORT' : 'DU',
      },
      installments: this.installments(year + 1, netTaxDue),
      liasseChecklist: [
        {
          label: 'Identité fiscale du dossier',
          status:
            dossier.taxIdentifier && dossier.rneNumber ? 'OK' : 'A_COMPLETER',
        },
        {
          label: 'Balance comptable de clôture',
          status: revenue || expenses ? 'OK' : 'A_COMPLETER',
        },
        {
          label: 'Réintégrations et déductions fiscales revues',
          status:
            input.reintegrations?.length || input.deductions?.length
              ? 'OK'
              : 'A_COMPLETER',
        },
        {
          label: 'Acomptes provisionnels préparés',
          status: netTaxDue > 0n ? 'OK' : 'A_COMPLETER',
        },
        { label: 'Pièces et états financiers annexés', status: 'A_COMPLETER' },
      ],
      inputs: input,
    };
  }

  toCsv(report: AnnualTaxReport) {
    const rows = [
      ['Section', 'Libellé', 'Valeur'],
      ['Dossier', 'Raison sociale', report.dossier.legalName],
      ['Dossier', 'Matricule fiscal', report.dossier.taxIdentifier ?? ''],
      ['Dossier', 'RNE', report.dossier.rneNumber ?? ''],
      ['Période', 'Début', report.period.startsOn],
      ['Période', 'Fin', report.period.endsOn],
      ['Comptabilité', 'Produits classe 7', report.accounting.revenue],
      ['Comptabilité', 'Charges classe 6', report.accounting.expenses],
      [
        'Comptabilité',
        'Résultat comptable',
        report.accounting.accountingResult,
      ],
      ['Passage fiscal', 'Réintégrations', report.fiscal.reintegrationsTotal],
      ['Passage fiscal', 'Déductions', report.fiscal.deductionsTotal],
      [
        'Passage fiscal',
        'Résultat fiscal avant report déficitaire',
        report.fiscal.fiscalResultBeforeCarryforward,
      ],
      [
        'Passage fiscal',
        'Report déficitaire imputé',
        report.fiscal.carryforwardApplied,
      ],
      [
        'Passage fiscal',
        'Déficits disponibles (avant imputation)',
        report.fiscal.carryforwardAvailable,
      ],
      ['Passage fiscal', 'Résultat fiscal', report.fiscal.fiscalResult],
      ['Liquidation', 'Régime', report.fiscal.regime],
      ['Liquidation', 'Taux IS', report.fiscal.corporateTaxRate],
      ['Liquidation', 'IS brut', report.fiscal.grossCorporateTax],
      [
        'Liquidation',
        'Minimum / forfaitaire',
        report.fiscal.regime === 'FORFAITAIRE'
          ? report.fiscal.forfaitaireTax
          : report.fiscal.minimumTax,
      ],
      ['Liquidation', 'Impôt dû (I)', report.fiscal.baseTax],
      [
        'Régularisation',
        'Retenue à la source subie',
        report.regularisation.retenueALaSourceSubie,
      ],
      [
        'Régularisation',
        'Acomptes provisionnels versés',
        report.regularisation.acomptesVerses,
      ],
      [
        'Régularisation',
        'Excédents antérieurs',
        report.regularisation.excedentsAnterieurs,
      ],
      ['Régularisation', 'Autres crédits', report.regularisation.autresCredits],
      [
        'Régularisation',
        report.regularisation.sens === 'REPORT'
          ? 'Report (crédit)'
          : 'Net à payer (IV)',
        report.regularisation.resultat,
      ],
      ...report.installments.map((item) => [
        'Acompte provisionnel',
        `${item.label} - ${item.dueOn}`,
        item.amount,
      ]),
    ];
    return Buffer.from(
      rows
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'),
        )
        .join('\r\n'),
      'utf8',
    );
  }

  async toPdf(report: AnnualTaxReport) {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 42, right: 42, bottom: 42, left: 42 },
      info: {
        Title: `Pré-liasse fiscale ${report.period.year} - ${report.dossier.legalName}`,
        Author: 'Fiscora',
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    document.rect(0, 0, 595, 135).fill('#14532D');
    document
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(24)
      .text('Pré-liasse fiscale', 42, 48)
      .fontSize(13)
      .font('Helvetica')
      .text(
        `Exercice ${report.period.year}${report.finalized ? ' — clôturé' : ''}`,
        42,
        82,
      );
    document
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text(report.dossier.legalName, 42, 170)
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#475569')
      .text(
        `MF : ${report.dossier.taxIdentifier ?? 'Non renseigné'}  |  RNE : ${report.dossier.rneNumber ?? 'Non renseigné'}`,
        42,
        198,
      )
      .text(
        `Période : ${report.period.startsOn} au ${report.period.endsOn}`,
        42,
        216,
      );
    let y = 255;
    y = this.pdfBlock(document, y, 'Résultat comptable', [
      ['Produits classe 7', report.accounting.revenue],
      ['Charges classe 6', report.accounting.expenses],
      ['Résultat comptable', report.accounting.accountingResult],
    ]);
    y = this.pdfBlock(
      document,
      y + 12,
      'Tableau de détermination du résultat fiscal',
      [
        ['Réintégrations', report.fiscal.reintegrationsTotal],
        ['Déductions', report.fiscal.deductionsTotal],
        [
          'Résultat fiscal avant report déficitaire',
          report.fiscal.fiscalResultBeforeCarryforward,
        ],
        ['Report déficitaire imputé', report.fiscal.carryforwardApplied],
        ['Résultat fiscal', report.fiscal.fiscalResult],
      ],
    );
    y = this.pdfBlock(document, y + 12, "Liquidation de l'impôt dû", [
      ['Régime', report.fiscal.regime],
      ['Taux IS saisi', report.fiscal.corporateTaxRate],
      ['IS brut', report.fiscal.grossCorporateTax],
      [
        'Minimum / forfaitaire',
        report.fiscal.regime === 'FORFAITAIRE'
          ? report.fiscal.forfaitaireTax
          : report.fiscal.minimumTax,
      ],
      ['Impôt dû (I)', report.fiscal.baseTax],
    ]);
    y = this.pdfBlock(document, y + 12, 'Régularisation', [
      [
        'Retenue à la source subie (relevé annexe)',
        report.regularisation.retenueALaSourceSubie,
      ],
      ['Acomptes provisionnels versés', report.regularisation.acomptesVerses],
      ['Excédents antérieurs', report.regularisation.excedentsAnterieurs],
      ['Autres crédits imputables', report.regularisation.autresCredits],
      [
        report.regularisation.sens === 'REPORT'
          ? 'Report (crédit)'
          : 'Résultat : net à payer (IV)',
        report.regularisation.resultat,
      ],
    ]);
    y = this.pdfBlock(
      document,
      y + 12,
      'Acomptes provisionnels',
      report.installments.map((item) => [
        `${item.label} (${item.dueOn})`,
        item.amount,
      ]),
    );
    document
      .roundedRect(42, Math.min(y + 16, 704), 511, 56, 6)
      .fillAndStroke('#FEF3C7', '#F59E0B')
      .fillColor('#78350F')
      .font('Helvetica')
      .fontSize(8.5)
      .text(report.warning, 54, Math.min(y + 31, 719), { width: 487 });
    document.end();
    return done;
  }

  async depreciationAnnex(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const rows = await this.dataSource.query<
      Array<{
        code: string;
        name: string;
        category: string;
        acquisitionCost: string;
        accounting: string;
        fiscal: string;
        difference: string;
      }>
    >(
      `SELECT a.code AS "code", a.name AS "name", c.name AS "category",
         a.acquisition_cost::text AS "acquisitionCost",
         COALESCE(SUM(p.accounting_amount),0)::numeric(15,3) AS "accounting",
         COALESCE(SUM(p.fiscal_amount),0)::numeric(15,3) AS "fiscal",
         COALESCE(SUM(p.temporary_difference),0)::numeric(15,3) AS "difference"
       FROM accounting.fixed_assets a
       JOIN accounting.fixed_asset_categories c ON c.id = a.category_id
       LEFT JOIN accounting.asset_depreciation_periods p
         ON p.asset_id = a.id AND p.period_year = $3
       WHERE a.organization_id = $1 AND a.dossier_id = $2
       GROUP BY a.id, a.code, a.name, c.name, a.acquisition_cost
       ORDER BY a.code`,
      [organizationId, dossierId, year],
    );
    const totals = rows.reduce(
      (acc, row) => ({
        accounting: acc.accounting + this.toMillimes(row.accounting),
        fiscal: acc.fiscal + this.toMillimes(row.fiscal),
        difference: acc.difference + this.toMillimes(row.difference),
      }),
      { accounting: 0n, fiscal: 0n, difference: 0n },
    );
    return {
      year,
      dossier: {
        legalName: dossier.legalName,
        taxIdentifier: dossier.taxIdentifier,
      },
      rows,
      totals: {
        accounting: this.fromMillimes(totals.accounting),
        fiscal: this.fromMillimes(totals.fiscal),
        difference: this.fromMillimes(totals.difference),
      },
    };
  }

  depreciationAnnexCsv(
    annex: Awaited<ReturnType<AnnualTaxService['depreciationAnnex']>>,
  ) {
    const rows = [
      [
        'Code',
        'Immobilisation',
        'Catégorie',
        "Coût d'acquisition",
        'Dotation comptable',
        'Dotation fiscale',
        'Écart temporaire',
      ],
      ...annex.rows.map((row) => [
        row.code,
        row.name,
        row.category,
        row.acquisitionCost,
        row.accounting,
        row.fiscal,
        row.difference,
      ]),
      [
        '',
        '',
        '',
        'TOTAL',
        annex.totals.accounting,
        annex.totals.fiscal,
        annex.totals.difference,
      ],
    ];
    return Buffer.from(
      rows
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'),
        )
        .join('\r\n'),
      'utf8',
    );
  }

  async depreciationAnnexPdf(
    annex: Awaited<ReturnType<AnnualTaxService['depreciationAnnex']>>,
  ) {
    return this.tablePdf({
      title: 'État détaillé des amortissements',
      subtitle: `Exercice ${annex.year} — ${annex.dossier.legalName}`,
      columns: [
        { label: 'Code', width: 60 },
        { label: 'Immobilisation', width: 160 },
        { label: 'Catégorie', width: 100 },
        { label: 'Dotation compt.', width: 90, align: 'right' },
        { label: 'Dotation fiscale', width: 90, align: 'right' },
        { label: 'Écart', width: 60, align: 'right' },
      ],
      rows: annex.rows.map((row) => [
        row.code,
        row.name,
        row.category,
        row.accounting,
        row.fiscal,
        row.difference,
      ]),
      totalsRow: [
        '',
        '',
        'TOTAL',
        annex.totals.accounting,
        annex.totals.fiscal,
        annex.totals.difference,
      ],
    });
  }

  async withholdingAnnex(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const period = this.fiscalPeriod(
      year,
      dossier.fiscalYearStartMonth,
      dossier.fiscalYearStartDay,
    );
    const rows = await this.dataSource.query<
      Array<{
        thirdPartyTaxIdentifier: string | null;
        thirdPartyName: string;
        invoiceDate: string;
        number: string;
        netAmount: string;
        withholdingRate: string | null;
        withholdingAmount: string;
        netPayable: string;
      }>
    >(
      `SELECT third_party_tax_identifier AS "thirdPartyTaxIdentifier",
         third_party_name AS "thirdPartyName",
         invoice_date::text AS "invoiceDate",
         number AS "number",
         net_amount::text AS "netAmount",
         withholding_rate::text AS "withholdingRate",
         withholding_amount::text AS "withholdingAmount",
         net_payable::text AS "netPayable"
       FROM accounting.business_invoices
       WHERE organization_id=$1 AND dossier_id=$2 AND type='VENTE' AND status='COMPTABILISEE'
         AND invoice_date BETWEEN $3 AND $4 AND withholding_amount <> 0
       ORDER BY invoice_date, number`,
      [organizationId, dossierId, period.startsOn, period.endsOn],
    );
    const total = rows.reduce(
      (sum, row) => sum + this.toMillimes(row.withholdingAmount),
      0n,
    );
    return {
      year,
      dossier: {
        legalName: dossier.legalName,
        taxIdentifier: dossier.taxIdentifier,
      },
      rows,
      total: this.fromMillimes(total),
    };
  }

  withholdingAnnexCsv(
    annex: Awaited<ReturnType<AnnualTaxService['withholdingAnnex']>>,
  ) {
    const rows = [
      [
        'Matricule fiscal',
        'Débiteur',
        'Facture',
        'Date',
        'Montant brut',
        'Taux',
        'Retenue',
        'Net payé',
      ],
      ...annex.rows.map((row) => [
        row.thirdPartyTaxIdentifier ?? '',
        row.thirdPartyName,
        row.number,
        row.invoiceDate,
        row.netAmount,
        row.withholdingRate ?? '',
        row.withholdingAmount,
        row.netPayable,
      ]),
      ['', '', '', '', '', 'TOTAL', annex.total, ''],
    ];
    return Buffer.from(
      rows
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'),
        )
        .join('\r\n'),
      'utf8',
    );
  }

  async withholdingAnnexPdf(
    annex: Awaited<ReturnType<AnnualTaxService['withholdingAnnex']>>,
  ) {
    return this.tablePdf({
      title: 'Relevé détaillé des retenues à la source subies',
      subtitle: `Exercice ${annex.year} — ${annex.dossier.legalName}`,
      columns: [
        { label: 'Débiteur', width: 160 },
        { label: 'MF', width: 90 },
        { label: 'Facture', width: 70 },
        { label: 'Date', width: 65 },
        { label: 'Brut', width: 55, align: 'right' },
        { label: 'Retenue', width: 65, align: 'right' },
      ],
      rows: annex.rows.map((row) => [
        row.thirdPartyName,
        row.thirdPartyTaxIdentifier ?? '—',
        row.number,
        row.invoiceDate,
        row.netAmount,
        row.withholdingAmount,
      ]),
      totalsRow: ['', '', '', '', 'TOTAL', annex.total],
    });
  }

  private async withholdingCreditForYear(
    organizationId: string,
    dossierId: string,
    startsOn: string,
    endsOn: string,
  ) {
    const rows = await this.dataSource.query<Array<{ total: string }>>(
      `SELECT COALESCE(SUM(withholding_amount),0)::numeric(15,3) AS total
       FROM accounting.business_invoices
       WHERE organization_id=$1 AND dossier_id=$2 AND type='VENTE' AND status='COMPTABILISEE'
         AND invoice_date BETWEEN $3 AND $4`,
      [organizationId, dossierId, startsOn, endsOn],
    );
    return this.toMillimes(rows[0]?.total ?? '0');
  }

  private async availableCarryforwards(
    organizationId: string,
    dossierId: string,
    year: number,
    manager = this.dataSource.manager,
  ) {
    return manager
      .getRepository(TaxLossCarryforward)
      .createQueryBuilder('row')
      .where('row.organization_id = :organizationId', { organizationId })
      .andWhere('row.dossier_id = :dossierId', { dossierId })
      .andWhere('row.expires_after_year >= :year', { year })
      .andWhere('row.remaining_amount > 0')
      .orderBy('row.origin_year', 'ASC')
      .getMany();
  }

  private async ledgerTotals(
    organizationId: string,
    dossierId: string,
    startsOn: string,
    endsOn: string,
  ) {
    const rows = await this.dataSource.query<
      Array<{ revenue: string; expenses: string }>
    >(
      `SELECT
         COALESCE(SUM(CASE WHEN a.code LIKE '7%' THEN l.credit - l.debit ELSE 0 END),0)::numeric(15,3) AS revenue,
         COALESCE(SUM(CASE WHEN a.code LIKE '6%' THEN l.debit - l.credit ELSE 0 END),0)::numeric(15,3) AS expenses
       FROM accounting.journal_entry_lines l
       JOIN accounting.journal_entries e ON e.id = l.entry_id
       JOIN accounting.ledger_accounts a ON a.id = l.account_id
       WHERE e.organization_id=$1 AND e.dossier_id=$2
         AND e.entry_date BETWEEN $3 AND $4
         AND e.status IN ('COMPTABILISEE','EXTOURNEE')`,
      [organizationId, dossierId, startsOn, endsOn],
    );
    return rows[0] ?? { revenue: '0', expenses: '0' };
  }

  private fiscalPeriod(year: number, startMonth = 1, startDay = 1) {
    const startsYear = startMonth === 1 && startDay === 1 ? year : year - 1;
    const startsOn = `${startsYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const end = new Date(Date.UTC(startsYear + 1, startMonth - 1, startDay));
    end.setUTCDate(end.getUTCDate() - 1);
    return { year, startsOn, endsOn: end.toISOString().slice(0, 10) };
  }

  private installments(nextYear: number, netTaxDue: bigint) {
    const amount = this.fromMillimes(this.multiplyRate(netTaxDue, '0.30000'));
    return [
      {
        label: '1er acompte',
        dueOn: `${nextYear}-06-25`,
        baseTax: this.fromMillimes(netTaxDue),
        rate: '0.30000',
        amount,
      },
      {
        label: '2e acompte',
        dueOn: `${nextYear}-09-25`,
        baseTax: this.fromMillimes(netTaxDue),
        rate: '0.30000',
        amount,
      },
      {
        label: '3e acompte',
        dueOn: `${nextYear}-12-25`,
        baseTax: this.fromMillimes(netTaxDue),
        rate: '0.30000',
        amount,
      },
    ];
  }

  private pdfBlock(
    document: PDFKit.PDFDocument,
    y: number,
    title: string,
    rows: Array<[string, string]>,
  ) {
    document
      .fillColor('#14532D')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(title, 42, y);
    y += 24;
    for (const [label, value] of rows) {
      document.rect(42, y, 511, 24).fill('#F8FAFC');
      document
        .fillColor('#0F172A')
        .font('Helvetica')
        .fontSize(9)
        .text(label, 54, y + 7, { width: 300 })
        .font('Helvetica-Bold')
        .text(value, 375, y + 7, { width: 160, align: 'right' });
      y += 26;
    }
    return y;
  }

  private async tablePdf(spec: {
    title: string;
    subtitle: string;
    columns: Array<{ label: string; width: number; align?: 'left' | 'right' }>;
    rows: string[][];
    totalsRow: string[];
  }) {
    const document = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      info: { Title: spec.title, Author: 'Fiscora' },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    document.rect(0, 0, 842, 96).fill('#14532D');
    document
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(19)
      .text(spec.title, 36, 30)
      .font('Helvetica')
      .fontSize(11)
      .text(spec.subtitle, 36, 62);
    let y = 118;
    document.fillColor('#14532D').font('Helvetica-Bold').fontSize(9);
    let x = 36;
    for (const column of spec.columns) {
      document.text(column.label, x, y, {
        width: column.width,
        align: column.align ?? 'left',
      });
      x += column.width;
    }
    y += 18;
    document.font('Helvetica').fontSize(8.5).fillColor('#0F172A');
    for (const row of spec.rows) {
      if (y > 520) {
        document.addPage({
          size: 'A4',
          layout: 'landscape',
          margins: { top: 36, right: 36, bottom: 36, left: 36 },
        });
        y = 36;
      }
      document.rect(36, y - 4, 770, 20).fill('#F8FAFC');
      document.fillColor('#0F172A');
      x = 36;
      for (let index = 0; index < spec.columns.length; index++) {
        document.text(row[index] ?? '', x, y, {
          width: spec.columns[index].width,
          align: spec.columns[index].align ?? 'left',
        });
        x += spec.columns[index].width;
      }
      y += 20;
    }
    y += 6;
    document.rect(36, y - 4, 770, 22).fillAndStroke('#DCFCE7', '#16A34A');
    document.fillColor('#14532D').font('Helvetica-Bold').fontSize(9);
    x = 36;
    for (let index = 0; index < spec.columns.length; index++) {
      document.text(spec.totalsRow[index] ?? '', x, y, {
        width: spec.columns[index].width,
        align: spec.columns[index].align ?? 'left',
      });
      x += spec.columns[index].width;
    }
    document.end();
    return done;
  }

  private resolveIsRateCode(dossier: {
    activitySector: string | null;
    isTotallyExporting: boolean;
  }) {
    const sector = (dossier.activitySector ?? '').toLowerCase();
    const majoreKeywords = [
      'banque',
      'assurance',
      'réassurance',
      'télécom',
      'telecom',
      'hydrocarbure',
    ];
    if (majoreKeywords.some((keyword) => sector.includes(keyword)))
      return FiscalParameterCode.IsTauxMajore;
    if (dossier.isTotallyExporting)
      return FiscalParameterCode.IsTauxExportateur;
    return FiscalParameterCode.IsTauxStandard;
  }

  private adjustmentTotal(items: AnnualTaxCalculationDto['reintegrations']) {
    return (items ?? []).reduce(
      (total, item) => total + this.toMillimes(item.amount),
      0n,
    );
  }

  private toMillimes(value: MoneySource | null | undefined) {
    const [whole, decimals = ''] = String(value ?? '0').split('.');
    const sign = whole.startsWith('-') ? -1n : 1n;
    const cleanWhole = whole.replace('-', '') || '0';
    return (
      sign *
      (BigInt(cleanWhole) * 1000n +
        BigInt(decimals.padEnd(3, '0').slice(0, 3) || '0'))
    );
  }

  private fromMillimes(value: bigint) {
    const sign = value < 0n ? '-' : '';
    const absolute = value < 0n ? -value : value;
    return `${sign}${absolute / 1000n}.${(absolute % 1000n).toString().padStart(3, '0')}`;
  }

  private multiplyRate(amount: bigint, rate: string) {
    const [, decimals = ''] = rate.split('.');
    const whole = BigInt(rate.split('.')[0] || '0');
    const scaledRate =
      whole * 100000n + BigInt(decimals.padEnd(5, '0').slice(0, 5) || '0');
    return (amount * scaledRate + 50000n) / 100000n;
  }
}
