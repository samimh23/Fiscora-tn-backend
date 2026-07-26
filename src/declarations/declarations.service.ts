import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Between, Repository } from 'typeorm';
import { fromMillimes, multiplyRate, toMillimes } from '../common/money';
import {
  AccountingDocument,
  AuditLog,
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceStatus,
  BusinessInvoiceType,
  FiscalParameter,
  FiscalParameterCode,
  MonthlyDeclarationCalculationMode,
  MonthlyDeclarationStatus,
  MonthlyTaxDeclaration,
  ObligationInstance,
  ObligationStatus,
  PayrollRun,
  PayrollRunStatus,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { FiscalSettingsService } from '../fiscal-settings/fiscal-settings.service';
import {
  DeclarationPeriodDto,
  FileMonthlyDeclarationDto,
  UpsertMonthlyDeclarationDto,
} from './dto';
import {
  calculateDeclarationTotal,
  calculateVatPosition,
  previousPeriod,
} from './monthly-declaration.engine';

type CheckSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface DeclarationCheck {
  code: string;
  severity: CheckSeverity;
  message: string;
}

@Injectable()
export class DeclarationsService {
  constructor(
    @InjectRepository(MonthlyTaxDeclaration)
    private readonly declarations: Repository<MonthlyTaxDeclaration>,
    @InjectRepository(ObligationInstance)
    private readonly obligations: Repository<ObligationInstance>,
    @InjectRepository(BusinessInvoice)
    private readonly invoices: Repository<BusinessInvoice>,
    @InjectRepository(PayrollRun)
    private readonly payrollRuns: Repository<PayrollRun>,
    @InjectRepository(AccountingDocument)
    private readonly documents: Repository<AccountingDocument>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    private readonly dossiers: DossiersService,
    private readonly fiscalSettings: FiscalSettingsService,
  ) {}

  async list(
    organizationId: string,
    dossierId: string,
    userId: string,
    year?: number,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.declarations.find({
      where: {
        organizationId,
        dossierId,
        ...(year ? { periodYear: year } : {}),
      },
      relations: { receiptDocument: true },
      order: { periodYear: 'DESC', periodMonth: 'DESC' },
    });
  }

  async previewCalculation(
    organizationId: string,
    dossierId: string,
    userId: string,
    period: DeclarationPeriodDto,
  ) {
    return this.calculateFromSources(
      organizationId,
      dossierId,
      userId,
      period.periodYear,
      period.periodMonth,
    );
  }

  async prepareAutomatic(
    organizationId: string,
    dossierId: string,
    userId: string,
    period: DeclarationPeriodDto,
  ) {
    const automatic = await this.calculateFromSources(
      organizationId,
      dossierId,
      userId,
      period.periodYear,
      period.periodMonth,
    );
    const item = await this.saveDraft(
      organizationId,
      dossierId,
      userId,
      automatic.input,
      automatic,
      MonthlyDeclarationCalculationMode.Automatic,
      null,
    );
    await this.audit(
      organizationId,
      userId,
      'monthly_declaration.prepared_automatically',
      item.id,
      { dossierId, period },
    );
    return item;
  }

  async upsert(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: UpsertMonthlyDeclarationDto,
  ) {
    const automatic = await this.calculateFromSources(
      organizationId,
      dossierId,
      userId,
      dto.periodYear,
      dto.periodMonth,
    );
    const comparedFields: Array<keyof UpsertMonthlyDeclarationDto> = [
      'vatCollected',
      'vatDeductible',
      'vatCreditPrevious',
      'withholdingTax',
      'tfpBase',
      'foprolosBase',
      'tclBase',
      'stampDuty',
    ];
    const adjusted = comparedFields.some(
      (field) =>
        dto[field] !== undefined &&
        String(dto[field]) !== String(automatic.input[field]),
    );
    if (adjusted && !dto.adjustmentReason?.trim()) {
      throw new BadRequestException(
        'Expliquez la raison de l’ajustement manuel avant d’enregistrer.',
      );
    }
    const item = await this.saveDraft(
      organizationId,
      dossierId,
      userId,
      dto,
      automatic,
      adjusted
        ? MonthlyDeclarationCalculationMode.Adjusted
        : MonthlyDeclarationCalculationMode.Automatic,
      dto.adjustmentReason?.trim() || null,
    );
    await this.audit(
      organizationId,
      userId,
      adjusted ? 'monthly_declaration.adjusted' : 'monthly_declaration.saved',
      item.id,
      { dossierId, periodYear: dto.periodYear, periodMonth: dto.periodMonth },
    );
    return item;
  }

  async review(
    organizationId: string,
    dossierId: string,
    declarationId: string,
    userId: string,
    comment?: string,
  ) {
    const item = await this.find(
      organizationId,
      dossierId,
      declarationId,
      userId,
    );
    if (
      ![
        MonthlyDeclarationStatus.Draft,
        MonthlyDeclarationStatus.Rejected,
      ].includes(item.status)
    )
      throw new ConflictException('La déclaration n’est plus modifiable.');
    await this.ensureSourcesAreCurrent(item, userId);
    this.ensureNoBlockingChecks(item);
    item.status = MonthlyDeclarationStatus.ReadyForReview;
    item.reviewedByUserId = userId;
    item.reviewedAtUtc = new Date();
    item.reviewComment = comment?.trim() || null;
    const saved = await this.declarations.save(item);
    await this.audit(
      organizationId,
      userId,
      'monthly_declaration.submitted_for_review',
      item.id,
      { dossierId, comment: item.reviewComment },
    );
    return saved;
  }

  async reject(
    organizationId: string,
    dossierId: string,
    declarationId: string,
    userId: string,
    comment: string,
  ) {
    const item = await this.find(
      organizationId,
      dossierId,
      declarationId,
      userId,
    );
    if (item.status !== MonthlyDeclarationStatus.ReadyForReview)
      throw new ConflictException(
        'Seule une déclaration en révision peut être rejetée.',
      );
    item.status = MonthlyDeclarationStatus.Rejected;
    item.reviewComment = comment.trim();
    const saved = await this.declarations.save(item);
    await this.audit(
      organizationId,
      userId,
      'monthly_declaration.rejected',
      item.id,
      { dossierId, comment: item.reviewComment },
    );
    return saved;
  }

  async validate(
    organizationId: string,
    dossierId: string,
    declarationId: string,
    userId: string,
  ) {
    const item = await this.find(
      organizationId,
      dossierId,
      declarationId,
      userId,
    );
    if (item.status !== MonthlyDeclarationStatus.ReadyForReview)
      throw new ConflictException(
        'La déclaration doit être prête pour révision.',
      );
    await this.ensureSourcesAreCurrent(item, userId);
    this.ensureNoBlockingChecks(item);
    item.status = MonthlyDeclarationStatus.Validated;
    item.validatedByUserId = userId;
    item.validatedAtUtc = new Date();
    item.snapshotJson = this.snapshot(item);
    if (item.obligationId) {
      await this.obligations.update(
        { id: item.obligationId, organizationId },
        {
          status: ObligationStatus.Validated,
          amountDue: item.totalDue,
          validatedByUserId: userId,
          validatedAtUtc: new Date(),
        },
      );
    }
    const saved = await this.declarations.save(item);
    await this.audit(
      organizationId,
      userId,
      'monthly_declaration.validated',
      item.id,
      { dossierId, totalDue: item.totalDue },
    );
    return saved;
  }

  async file(
    organizationId: string,
    dossierId: string,
    declarationId: string,
    userId: string,
    dto: FileMonthlyDeclarationDto,
  ) {
    const item = await this.find(
      organizationId,
      dossierId,
      declarationId,
      userId,
    );
    if (item.status !== MonthlyDeclarationStatus.Validated)
      throw new ConflictException('Validez la déclaration avant son dépôt.');
    if (dto.receiptDocumentId) {
      const exists = await this.documents.existsBy({
        id: dto.receiptDocumentId,
        organizationId,
        dossierId,
      });
      if (!exists)
        throw new NotFoundException(
          'Le justificatif de dépôt est introuvable dans ce dossier.',
        );
    }
    item.status = MonthlyDeclarationStatus.Filed;
    item.filedAtUtc = new Date();
    item.filedByUserId = userId;
    item.filingReference = dto.filingReference.trim();
    item.receiptDocumentId = dto.receiptDocumentId ?? null;
    if (item.obligationId) {
      await this.obligations.update(
        { id: item.obligationId, organizationId },
        {
          status: ObligationStatus.Filed,
          amountDue: item.totalDue,
          filedByUserId: userId,
          filedAtUtc: new Date(),
          paymentReference: item.filingReference,
        },
      );
    }
    const saved = await this.declarations.save(item);
    await this.audit(
      organizationId,
      userId,
      'monthly_declaration.filed',
      item.id,
      {
        dossierId,
        filingReference: item.filingReference,
        receiptDocumentId: item.receiptDocumentId,
      },
    );
    return saved;
  }

  private async saveDraft(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: UpsertMonthlyDeclarationDto,
    automatic: Awaited<ReturnType<DeclarationsService['calculateFromSources']>>,
    mode: MonthlyDeclarationCalculationMode,
    adjustmentReason: string | null,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    let item = await this.declarations.findOneBy({
      organizationId,
      dossierId,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
    });
    if (
      item &&
      ![
        MonthlyDeclarationStatus.Draft,
        MonthlyDeclarationStatus.Rejected,
      ].includes(item.status)
    ) {
      throw new ConflictException(
        'Une déclaration envoyée en révision ou validée est immuable.',
      );
    }
    const values = await this.calculate(
      organizationId,
      dossier.activitySector,
      dto,
      automatic.checks.items,
    );
    const obligation = await this.findObligation(
      organizationId,
      dossierId,
      dto.periodYear,
      dto.periodMonth,
    );
    item ??= this.declarations.create({
      organizationId,
      dossierId,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
    });
    Object.assign(item, values, {
      obligationId: obligation?.id ?? null,
      status: MonthlyDeclarationStatus.Draft,
      sourceSnapshot: automatic.sourceSnapshot,
      checksJson: automatic.checks,
      calculationMode: mode,
      adjustmentReason,
      snapshotJson: null,
      validatedByUserId: null,
      validatedAtUtc: null,
      filedByUserId: null,
      filedAtUtc: null,
      filingReference: null,
      receiptDocumentId: null,
    });
    return this.declarations.save(item);
  }

  private async calculateFromSources(
    organizationId: string,
    dossierId: string,
    userId: string,
    periodYear: number,
    periodMonth: number,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const startsOn = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
    const endsOn = new Date(Date.UTC(periodYear, periodMonth, 0))
      .toISOString()
      .slice(0, 10);
    const invoices = await this.invoices.find({
      where: {
        organizationId,
        dossierId,
        invoiceDate: Between(startsOn, endsOn),
      },
      relations: { lines: true },
      order: { invoiceDate: 'ASC', number: 'ASC' },
    });
    const payrollRuns = await this.payrollRuns.find({
      where: { organizationId, dossierId, periodYear, periodMonth },
      relations: { lines: true },
    });

    let vatCollected = 0n;
    let vatDeductible = 0n;
    let withholdingTax = 0n;
    let withholdingCredit = 0n;
    let salesNet = 0n;
    let purchaseNet = 0n;
    let stampDuty = 0n;
    const vatByRate = new Map<
      string,
      { code: string; rate: string; collected: bigint; deductible: bigint }
    >();
    const withholdingByNature = new Map<string, bigint>();
    const postedInvoices = invoices.filter(
      (invoice) => invoice.status === BusinessInvoiceStatus.Posted,
    );
    for (const invoice of postedInvoices) {
      const sign = invoice.kind === BusinessInvoiceKind.CreditNote ? -1n : 1n;
      if (invoice.type === BusinessInvoiceType.Sale) {
        salesNet += sign * toMillimes(invoice.netAmount);
        vatCollected += sign * toMillimes(invoice.vatAmount);
        stampDuty += sign * toMillimes(invoice.stampDuty);
        withholdingCredit += sign * toMillimes(invoice.withholdingAmount);
      } else {
        purchaseNet += sign * toMillimes(invoice.netAmount);
        vatDeductible += sign * toMillimes(invoice.vatAmount);
        withholdingTax += sign * toMillimes(invoice.withholdingAmount);
        const nature = this.withholdingNature(invoice);
        withholdingByNature.set(
          nature,
          (withholdingByNature.get(nature) ?? 0n) +
            sign * toMillimes(invoice.withholdingAmount),
        );
      }
      for (const line of invoice.lines ?? []) {
        const code = line.vatCode || 'SANS_CODE';
        const key = `${code}|${line.vatRate}`;
        const current = vatByRate.get(key) ?? {
          code,
          rate: line.vatRate,
          collected: 0n,
          deductible: 0n,
        };
        if (invoice.type === BusinessInvoiceType.Sale)
          current.collected += sign * toMillimes(line.vatAmount);
        else current.deductible += sign * toMillimes(line.vatAmount);
        vatByRate.set(key, current);
      }
    }

    const validatedPayroll = payrollRuns.find(
      (run) => run.status === PayrollRunStatus.Validated,
    );
    let payrollGross = 0n;
    let salaryWithholding = 0n;
    if (validatedPayroll) {
      payrollGross = toMillimes(validatedPayroll.totalGross);
      salaryWithholding = (validatedPayroll.lines ?? []).reduce(
        (sum, line) => sum + toMillimes(line.incomeTax),
        0n,
      );
      withholdingTax += salaryWithholding;
      withholdingByNature.set(
        'SALAIRES',
        (withholdingByNature.get('SALAIRES') ?? 0n) + salaryWithholding,
      );
    }

    const previous = previousPeriod(periodYear, periodMonth);
    const previousDeclaration = await this.declarations.findOneBy({
      organizationId,
      dossierId,
      periodYear: previous.year,
      periodMonth: previous.month,
    });
    const vatCreditPrevious = previousDeclaration
      ? toMillimes(previousDeclaration.vatCreditNext)
      : 0n;
    const tclBase = dossier.isTotallyExporting ? 0n : salesNet;
    const checks: DeclarationCheck[] = [];
    const unposted = invoices.length - postedInvoices.length;
    if (!dossier.taxIdentifier)
      checks.push({
        code: 'DOSSIER_TAX_ID_MISSING',
        severity: 'ERROR',
        message: 'Le matricule fiscal du dossier doit être renseigné.',
      });
    if (unposted > 0)
      checks.push({
        code: 'UNPOSTED_INVOICES',
        severity: 'ERROR',
        message: `${unposted} facture(s) de la période ne sont pas comptabilisées.`,
      });
    if (dossier.employeeCount > 0 && !validatedPayroll)
      checks.push({
        code: 'PAYROLL_MISSING',
        severity: 'ERROR',
        message:
          'Le dossier déclare des salariés mais aucune paie validée n’existe pour ce mois.',
      });
    if (payrollRuns.some((run) => run.status === PayrollRunStatus.Draft))
      checks.push({
        code: 'PAYROLL_DRAFT',
        severity: 'ERROR',
        message: 'Le traitement de paie du mois est encore en brouillon.',
      });
    if (!dossier.isVatSubject && (vatCollected !== 0n || vatDeductible !== 0n))
      checks.push({
        code: 'VAT_NOT_APPLICABLE',
        severity: 'ERROR',
        message:
          'Des montants de TVA existent alors que le dossier est déclaré non assujetti.',
      });
    if (dossier.isVatSubject && postedInvoices.length === 0)
      checks.push({
        code: 'NO_POSTED_INVOICES',
        severity: 'WARNING',
        message:
          'Aucune facture comptabilisée pour ce mois. Confirmez qu’il s’agit d’une déclaration néant.',
      });
    if (dossier.hasVatSuspension || dossier.isTotallyExporting)
      checks.push({
        code: 'SPECIAL_VAT_REGIME',
        severity: 'WARNING',
        message:
          'Régime TVA spécial détecté : contrôlez manuellement les opérations en suspension ou à l’export.',
      });
    if (
      previousDeclaration &&
      ![
        MonthlyDeclarationStatus.Validated,
        MonthlyDeclarationStatus.Filed,
      ].includes(previousDeclaration.status)
    )
      checks.push({
        code: 'PREVIOUS_CREDIT_NOT_VALIDATED',
        severity: 'WARNING',
        message:
          'Le crédit TVA repris provient d’une déclaration précédente non validée.',
      });
    if (!previousDeclaration)
      checks.push({
        code: 'PREVIOUS_DECLARATION_MISSING',
        severity: 'WARNING',
        message:
          'Aucune déclaration du mois précédent : vérifiez manuellement le report TVA.',
      });
    checks.push({
      code: 'SOURCE_SUMMARY',
      severity: 'INFO',
      message: `${postedInvoices.length} facture(s) comptabilisée(s) et ${validatedPayroll ? 'une paie validée' : 'aucune paie validée'} prises en compte.`,
    });

    const sourcePayload = {
      period: { periodYear, periodMonth, startsOn, endsOn },
      invoiceIds: postedInvoices.map((invoice) => invoice.id),
      payrollRunId: validatedPayroll?.id ?? null,
      summary: {
        postedInvoiceCount: postedInvoices.length,
        unpostedInvoiceCount: unposted,
        salesNet: fromMillimes(salesNet),
        purchaseNet: fromMillimes(purchaseNet),
        payrollGross: fromMillimes(payrollGross),
        salaryWithholding: fromMillimes(salaryWithholding),
        purchaseWithholding: fromMillimes(withholdingTax - salaryWithholding),
        withholdingCredit: fromMillimes(withholdingCredit),
      },
      vatByRate: [...vatByRate.values()].map((row) => ({
        code: row.code,
        rate: row.rate,
        collected: fromMillimes(row.collected),
        deductible: fromMillimes(row.deductible),
      })),
      withholdingByNature: [...withholdingByNature.entries()].map(
        ([nature, amount]) => ({ nature, amount: fromMillimes(amount) }),
      ),
    };
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(sourcePayload))
      .digest('hex');
    const input: UpsertMonthlyDeclarationDto = {
      periodYear,
      periodMonth,
      vatCollected: fromMillimes(vatCollected),
      vatDeductible: fromMillimes(vatDeductible),
      vatCreditPrevious: fromMillimes(vatCreditPrevious),
      withholdingTax: fromMillimes(withholdingTax),
      tfpBase: fromMillimes(payrollGross),
      foprolosBase: fromMillimes(payrollGross),
      tclBase: fromMillimes(tclBase),
      stampDuty: fromMillimes(stampDuty),
    };
    const calculated = await this.calculate(
      organizationId,
      dossier.activitySector,
      input,
      checks,
    );
    return {
      input,
      calculated,
      sourceSnapshot: {
        ...sourcePayload,
        fingerprint,
        generatedAtUtc: new Date().toISOString(),
      },
      checks: {
        blockingCount: checks.filter((check) => check.severity === 'ERROR')
          .length,
        warningCount: checks.filter((check) => check.severity === 'WARNING')
          .length,
        items: checks,
      },
    };
  }

  private async calculate(
    organizationId: string,
    activitySector: string | null,
    dto: UpsertMonthlyDeclarationDto,
    checks?: DeclarationCheck[],
  ) {
    const applicableOn = `${dto.periodYear}-${String(dto.periodMonth).padStart(2, '0')}-01`;
    const tfpCode = activitySector?.toLocaleLowerCase('fr').includes('industr')
      ? FiscalParameterCode.TfpIndustryRate
      : FiscalParameterCode.TfpOtherRate;
    const tfp = await this.resolveParameter(
      organizationId,
      tfpCode,
      applicableOn,
      dto.tfpRate,
      checks,
    );
    const foprolos = await this.resolveParameter(
      organizationId,
      FiscalParameterCode.FoprolosRate,
      applicableOn,
      dto.foprolosRate,
      checks,
    );
    const tcl = await this.resolveParameter(
      organizationId,
      FiscalParameterCode.TclRate,
      applicableOn,
      dto.tclRate,
      checks,
    );
    const stamp = await this.resolveParameter(
      organizationId,
      FiscalParameterCode.StampDuty,
      applicableOn,
      dto.stampDuty,
      checks,
    );

    let withholdingRate: string | null = null;
    let withholdingTax = toMillimes(dto.withholdingTax);
    let withholdingSource: Record<string, unknown> | null = null;
    if (dto.withholdingBase && dto.withholdingNature) {
      const rate = await this.fiscalSettings.resolveWithholdingRate(
        organizationId,
        dto.withholdingNature,
        applicableOn,
      );
      withholdingRate = rate.rate;
      withholdingTax = multiplyRate(
        toMillimes(dto.withholdingBase, 'Base de retenue'),
        rate.rate,
      );
      withholdingSource = this.settingSnapshot(rate);
    }

    const collected = toMillimes(dto.vatCollected, 'TVA collectée');
    const deductible = toMillimes(dto.vatDeductible, 'TVA déductible');
    const previous = toMillimes(dto.vatCreditPrevious, 'Report TVA');
    const { vatDue, vatCreditNext } = calculateVatPosition(
      collected,
      deductible,
      previous,
    );
    const tfpDue = multiplyRate(toMillimes(dto.tfpBase), tfp.value);
    const foprolosDue = multiplyRate(
      toMillimes(dto.foprolosBase),
      foprolos.value,
    );
    const tclDue = multiplyRate(toMillimes(dto.tclBase), tcl.value);
    const stampAmount = toMillimes(
      stamp.value.replace(/(\.\d{3})0{1,2}$/, '$1'),
      'Droit de timbre',
    );
    const totalDue = calculateDeclarationTotal({
      vatDue,
      withholdingTax,
      tfpDue,
      foprolosDue,
      tclDue,
      stampDuty: stampAmount,
    });
    return {
      ...dto,
      vatCollected: fromMillimes(collected),
      vatDeductible: fromMillimes(deductible),
      vatCreditPrevious: fromMillimes(previous),
      vatDue: fromMillimes(vatDue),
      vatCreditNext: fromMillimes(vatCreditNext),
      withholdingBase: dto.withholdingBase
        ? fromMillimes(toMillimes(dto.withholdingBase))
        : null,
      withholdingNature: dto.withholdingNature?.trim().toUpperCase() || null,
      withholdingRate,
      withholdingTax: fromMillimes(withholdingTax),
      tfpBase: fromMillimes(toMillimes(dto.tfpBase)),
      tfpRate: tfp.value,
      tfpDue: fromMillimes(tfpDue),
      foprolosBase: fromMillimes(toMillimes(dto.foprolosBase)),
      foprolosRate: foprolos.value,
      foprolosDue: fromMillimes(foprolosDue),
      tclBase: fromMillimes(toMillimes(dto.tclBase)),
      tclRate: tcl.value,
      tclDue: fromMillimes(tclDue),
      stampDuty: fromMillimes(stampAmount),
      totalDue: fromMillimes(totalDue),
      parameterSnapshot: {
        applicableOn,
        tfp: tfp.snapshot,
        foprolos: foprolos.snapshot,
        tcl: tcl.snapshot,
        stampDuty: stamp.snapshot,
        withholding: withholdingSource,
      },
    };
  }

  private async ensureSourcesAreCurrent(
    item: MonthlyTaxDeclaration,
    userId: string,
  ) {
    const current = await this.calculateFromSources(
      item.organizationId,
      item.dossierId,
      userId,
      item.periodYear,
      item.periodMonth,
    );
    const savedFingerprint = (item.sourceSnapshot as { fingerprint?: string })
      ?.fingerprint;
    const currentFingerprint = (
      current.sourceSnapshot as { fingerprint?: string }
    ).fingerprint;
    if (!savedFingerprint || savedFingerprint !== currentFingerprint)
      throw new ConflictException(
        'Les factures ou la paie ont changé. Recalculez la déclaration avant de continuer.',
      );
    item.checksJson = current.checks;
    await this.declarations.save(item);
  }

  private ensureNoBlockingChecks(item: MonthlyTaxDeclaration) {
    const blockingCount = Number(
      (item.checksJson as { blockingCount?: number })?.blockingCount ?? 0,
    );
    if (blockingCount > 0)
      throw new ConflictException(
        `${blockingCount} contrôle(s) bloquant(s) doivent être corrigés avant validation.`,
      );
  }

  private findObligation(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    periodMonth: number,
  ) {
    return this.obligations
      .createQueryBuilder('obligation')
      .innerJoin('obligation.template', 'template')
      .where('obligation.organization_id = :organizationId', { organizationId })
      .andWhere('obligation.dossier_id = :dossierId', { dossierId })
      .andWhere('obligation.period_year = :periodYear', { periodYear })
      .andWhere('obligation.period_month = :periodMonth', { periodMonth })
      .andWhere('template.code = :code', {
        code: 'DECLARATION_MENSUELLE_REEL',
      })
      .getOne();
  }

  private async resolveParameter(
    organizationId: string,
    code: FiscalParameterCode,
    date: string,
    override?: string,
    checks?: DeclarationCheck[],
  ) {
    if (override !== undefined) {
      return {
        value: override,
        snapshot: { code, value: override, source: 'SAISIE_MANUELLE' },
      };
    }
    const parameter = await this.fiscalSettings.resolveParameter(
      organizationId,
      code,
      date,
      checks ? false : true,
    );
    if (!parameter) {
      checks!.push({
        code: `FISCAL_PARAMETER_MISSING_${code}`,
        severity: 'ERROR',
        message: `Le paramètre fiscal ${code} doit être configuré pour le ${date}.`,
      });
      return {
        value: '0',
        snapshot: {
          code,
          value: null,
          applicableOn: date,
          source: 'PARAMETRE_MANQUANT',
        },
      };
    }
    return {
      value: parameter.value,
      snapshot: this.settingSnapshot(parameter),
    };
  }

  private settingSnapshot(
    item:
      | FiscalParameter
      | {
          rate: string;
          sourceLabel: string | null;
          sourceUrl: string | null;
          effectiveFrom: string;
          effectiveTo: string | null;
        },
  ) {
    return {
      value: 'value' in item ? item.value : item.rate,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
    };
  }

  private withholdingNature(invoice: BusinessInvoice) {
    const taxSnapshot = invoice.taxSnapshot as {
      withholding?: { natureCode?: string };
    } | null;
    return taxSnapshot?.withholding?.natureCode ?? 'AUTRE';
  }

  private async find(
    organizationId: string,
    dossierId: string,
    id: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const item = await this.declarations.findOne({
      where: { id, organizationId, dossierId },
      relations: { receiptDocument: true },
    });
    if (!item) throw new NotFoundException('La déclaration est introuvable.');
    return item;
  }

  private snapshot(item: MonthlyTaxDeclaration) {
    return {
      periodYear: item.periodYear,
      periodMonth: item.periodMonth,
      vatCollected: item.vatCollected,
      vatDeductible: item.vatDeductible,
      vatCreditPrevious: item.vatCreditPrevious,
      vatDue: item.vatDue,
      vatCreditNext: item.vatCreditNext,
      withholdingTax: item.withholdingTax,
      withholdingBase: item.withholdingBase,
      withholdingNature: item.withholdingNature,
      withholdingRate: item.withholdingRate,
      tfpBase: item.tfpBase,
      tfpRate: item.tfpRate,
      tfpDue: item.tfpDue,
      foprolosBase: item.foprolosBase,
      foprolosRate: item.foprolosRate,
      foprolosDue: item.foprolosDue,
      tclBase: item.tclBase,
      tclRate: item.tclRate,
      tclDue: item.tclDue,
      stampDuty: item.stampDuty,
      totalDue: item.totalDue,
      calculationMode: item.calculationMode,
      adjustmentReason: item.adjustmentReason,
      parameterSnapshot: item.parameterSnapshot,
      sourceSnapshot: item.sourceSnapshot,
      checks: item.checksJson,
      validatedAtUtc: item.validatedAtUtc?.toISOString() ?? null,
      validatedByUserId: item.validatedByUserId,
    };
  }

  private audit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    return this.auditLogs.save(
      this.auditLogs.create({
        organizationId,
        actorUserId,
        action,
        entityType: 'MonthlyTaxDeclaration',
        entityId,
        detailsJson,
      }),
    );
  }
}
