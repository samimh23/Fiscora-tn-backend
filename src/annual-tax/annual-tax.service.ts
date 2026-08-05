import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { DataSource } from 'typeorm';
import { DossiersService } from '../dossiers/dossiers.service';
import { AnnualTaxCalculationDto } from './dto';

type MoneySource = string | number | bigint;

export interface AnnualTaxReport {
  generatedAtUtc: string;
  warning: string;
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
    fiscalResult: string;
    corporateTaxRate: string;
    grossCorporateTax: string;
    minimumTax: string;
    taxCredits: string;
    forfaitaireTax: string;
    netTaxDue: string;
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
    private readonly dossiers: DossiersService,
  ) {}

  async calculate(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
    input: AnnualTaxCalculationDto = {},
  ): Promise<AnnualTaxReport> {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const period = this.fiscalPeriod(year, dossier.fiscalYearStartMonth, dossier.fiscalYearStartDay);
    const totals = await this.ledgerTotals(organizationId, dossierId, period.startsOn, period.endsOn);
    const revenue = this.toMillimes(totals.revenue);
    const expenses = this.toMillimes(totals.expenses);
    const accountingResult = revenue - expenses;
    const reintegrationsTotal = this.adjustmentTotal(input.reintegrations);
    const deductionsTotal = this.adjustmentTotal(input.deductions);
    const fiscalResult = accountingResult + reintegrationsTotal - deductionsTotal;
    const regime = input.regime ?? (dossier.taxRegime === 'FORFAITAIRE' ? 'FORFAITAIRE' : 'IS');
    const corporateTaxRate = input.corporateTaxRate ?? '0.15000';
    const grossCorporateTax =
      regime === 'FORFAITAIRE'
        ? 0n
        : this.multiplyRate(fiscalResult > 0n ? fiscalResult : 0n, corporateTaxRate);
    const minimumTax = this.toMillimes(input.minimumTax ?? '0');
    const forfaitaireTax = this.toMillimes(input.forfaitaireTax ?? '0');
    const taxCredits = this.toMillimes(input.taxCredits ?? '0');
    const baseTax =
      regime === 'FORFAITAIRE'
        ? forfaitaireTax
        : grossCorporateTax > minimumTax
          ? grossCorporateTax
          : minimumTax;
    const netTaxDue = baseTax > taxCredits ? baseTax - taxCredits : 0n;
    return {
      generatedAtUtc: new Date().toISOString(),
      warning:
        'Préparation fiscale non certifiée : les taux, minimums, crédits et corrections doivent être validés selon le texte officiel applicable au client.',
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
        fiscalResult: this.fromMillimes(fiscalResult),
        corporateTaxRate,
        grossCorporateTax: this.fromMillimes(grossCorporateTax),
        minimumTax: this.fromMillimes(minimumTax),
        taxCredits: this.fromMillimes(taxCredits),
        forfaitaireTax: this.fromMillimes(forfaitaireTax),
        netTaxDue: this.fromMillimes(netTaxDue),
      },
      installments: this.installments(year + 1, netTaxDue),
      liasseChecklist: [
        { label: 'Identité fiscale du dossier', status: dossier.taxIdentifier && dossier.rneNumber ? 'OK' : 'A_COMPLETER' },
        { label: 'Balance comptable de clôture', status: revenue || expenses ? 'OK' : 'A_COMPLETER' },
        { label: 'Réintégrations et déductions fiscales revues', status: input.reintegrations?.length || input.deductions?.length ? 'OK' : 'A_COMPLETER' },
        { label: 'Acomptes provisionnels préparés', status: netTaxDue > 0n ? 'OK' : 'A_COMPLETER' },
        { label: 'Pièces et états financiers annexés', status: 'A_COMPLETER' },
      ],
      inputs: input,
    };
  }

  async toCsv(report: AnnualTaxReport) {
    const rows = [
      ['Section', 'Libellé', 'Valeur'],
      ['Dossier', 'Raison sociale', report.dossier.legalName],
      ['Dossier', 'Matricule fiscal', report.dossier.taxIdentifier ?? ''],
      ['Dossier', 'RNE', report.dossier.rneNumber ?? ''],
      ['Période', 'Début', report.period.startsOn],
      ['Période', 'Fin', report.period.endsOn],
      ['Comptabilité', 'Produits classe 7', report.accounting.revenue],
      ['Comptabilité', 'Charges classe 6', report.accounting.expenses],
      ['Comptabilité', 'Résultat comptable', report.accounting.accountingResult],
      ['Fiscal', 'Réintégrations', report.fiscal.reintegrationsTotal],
      ['Fiscal', 'Déductions', report.fiscal.deductionsTotal],
      ['Fiscal', 'Résultat fiscal', report.fiscal.fiscalResult],
      ['Fiscal', 'Régime', report.fiscal.regime],
      ['Fiscal', 'Taux IS saisi', report.fiscal.corporateTaxRate],
      ['Fiscal', 'IS brut', report.fiscal.grossCorporateTax],
      ['Fiscal', 'Minimum', report.fiscal.minimumTax],
      ['Fiscal', 'Crédits', report.fiscal.taxCredits],
      ['Fiscal', 'Impôt / forfaitaire net à payer', report.fiscal.netTaxDue],
      ...report.installments.map((item) => [
        'Acompte provisionnel',
        `${item.label} - ${item.dueOn}`,
        item.amount,
      ]),
    ];
    return Buffer.from(
      rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n'),
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
      .text(`Exercice ${report.period.year}`, 42, 82);
    document
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text(report.dossier.legalName, 42, 170)
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#475569')
      .text(`MF : ${report.dossier.taxIdentifier ?? 'Non renseigné'}  |  RNE : ${report.dossier.rneNumber ?? 'Non renseigné'}`, 42, 198)
      .text(`Période : ${report.period.startsOn} au ${report.period.endsOn}`, 42, 216);
    let y = 255;
    y = this.pdfBlock(document, y, 'Résultat comptable', [
      ['Produits classe 7', report.accounting.revenue],
      ['Charges classe 6', report.accounting.expenses],
      ['Résultat comptable', report.accounting.accountingResult],
    ]);
    y = this.pdfBlock(document, y + 12, 'Passage fiscal', [
      ['Réintégrations', report.fiscal.reintegrationsTotal],
      ['Déductions', report.fiscal.deductionsTotal],
      ['Résultat fiscal', report.fiscal.fiscalResult],
      ['Régime', report.fiscal.regime],
      ['Taux IS saisi', report.fiscal.corporateTaxRate],
      ['IS brut', report.fiscal.grossCorporateTax],
      ['Minimum / forfaitaire', report.fiscal.regime === 'FORFAITAIRE' ? report.fiscal.forfaitaireTax : report.fiscal.minimumTax],
      ['Crédits imputés', report.fiscal.taxCredits],
      ['Net à payer estimé', report.fiscal.netTaxDue],
    ]);
    y = this.pdfBlock(document, y + 12, 'Acomptes provisionnels', report.installments.map((item) => [
      `${item.label} (${item.dueOn})`,
      item.amount,
    ]));
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

  private async ledgerTotals(
    organizationId: string,
    dossierId: string,
    startsOn: string,
    endsOn: string,
  ) {
    const rows = await this.dataSource.query<Array<{ revenue: string; expenses: string }>>(
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
      { label: '1er acompte', dueOn: `${nextYear}-06-25`, baseTax: this.fromMillimes(netTaxDue), rate: '0.30000', amount },
      { label: '2e acompte', dueOn: `${nextYear}-09-25`, baseTax: this.fromMillimes(netTaxDue), rate: '0.30000', amount },
      { label: '3e acompte', dueOn: `${nextYear}-12-25`, baseTax: this.fromMillimes(netTaxDue), rate: '0.30000', amount },
    ];
  }

  private pdfBlock(document: PDFKit.PDFDocument, y: number, title: string, rows: Array<[string, string]>) {
    document.fillColor('#14532D').font('Helvetica-Bold').fontSize(13).text(title, 42, y);
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

  private adjustmentTotal(items: AnnualTaxCalculationDto['reintegrations']) {
    return (items ?? []).reduce((total, item) => total + this.toMillimes(item.amount), 0n);
  }

  private toMillimes(value: MoneySource | null | undefined) {
    const [whole, decimals = ''] = String(value ?? '0').split('.');
    const sign = whole.startsWith('-') ? -1n : 1n;
    const cleanWhole = whole.replace('-', '') || '0';
    return sign * (BigInt(cleanWhole) * 1000n + BigInt(decimals.padEnd(3, '0').slice(0, 3) || '0'));
  }

  private fromMillimes(value: bigint) {
    const sign = value < 0n ? '-' : '';
    const absolute = value < 0n ? -value : value;
    return `${sign}${absolute / 1000n}.${(absolute % 1000n).toString().padStart(3, '0')}`;
  }

  private multiplyRate(amount: bigint, rate: string) {
    const [, decimals = ''] = rate.split('.');
    const whole = BigInt(rate.split('.')[0] || '0');
    const scaledRate = whole * 100000n + BigInt(decimals.padEnd(5, '0').slice(0, 5) || '0');
    return (amount * scaledRate + 50000n) / 100000n;
  }
}
