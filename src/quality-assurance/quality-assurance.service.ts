import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  AccountingDocument,
  BankTransaction,
  BankTransactionStatus,
  BusinessInvoice,
  BusinessInvoiceStatus,
  ClientDossier,
  DocumentProcessingStatus,
  DossierStatus,
  Employee,
  FiscalParameter,
  FiscalParameterCode,
  JournalEntry,
  JournalEntryStatus,
  MalwareScanStatus,
  MissingDocumentExpectation,
  MonthlyTaxDeclaration,
  MonthlyDeclarationStatus,
  ObligationInstance,
  ObligationStatus,
  PayrollRun,
  PayrollRunStatus,
  WorkTask,
  WorkTaskStatus,
} from '../database/entities';

export type QualitySeverity = 'BLOCKER' | 'WARNING' | 'INFO';
export type QualityCategory =
  | 'DOSSIER'
  | 'DOCUMENTS'
  | 'TASKS'
  | 'OBLIGATIONS'
  | 'ACCOUNTING'
  | 'BANK'
  | 'FISCAL'
  | 'PAYROLL'
  | 'INVOICES';

export interface QualityFinding {
  code: string;
  severity: QualitySeverity;
  category: QualityCategory;
  title: string;
  details: string;
  count?: number;
  actionLabel: string;
  actionPath: string;
}

export interface DossierReference {
  id: string;
  legalName: string;
  tradeName?: string | null;
}

@Injectable()
export class QualityAssuranceService {
  constructor(
    private readonly dossiersService: DossiersService,
    @InjectRepository(ClientDossier)
    private readonly dossiers: Repository<ClientDossier>,
    @InjectRepository(AccountingDocument)
    private readonly documents: Repository<AccountingDocument>,
    @InjectRepository(MissingDocumentExpectation)
    private readonly expectations: Repository<MissingDocumentExpectation>,
    @InjectRepository(WorkTask)
    private readonly tasks: Repository<WorkTask>,
    @InjectRepository(ObligationInstance)
    private readonly obligations: Repository<ObligationInstance>,
    @InjectRepository(JournalEntry)
    private readonly entries: Repository<JournalEntry>,
    @InjectRepository(BankTransaction)
    private readonly bankTransactions: Repository<BankTransaction>,
    @InjectRepository(FiscalParameter)
    private readonly fiscalParameters: Repository<FiscalParameter>,
    @InjectRepository(MonthlyTaxDeclaration)
    private readonly monthlyDeclarations: Repository<MonthlyTaxDeclaration>,
    @InjectRepository(BusinessInvoice)
    private readonly invoices: Repository<BusinessInvoice>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(PayrollRun)
    private readonly payrollRuns: Repository<PayrollRun>,
  ) {}

  async getSummary(
    organizationId: string,
    userId: string,
    dossierId?: string,
  ) {
    if (dossierId) {
      const report = await this.getDossierReport(
        organizationId,
        dossierId,
        userId,
      );
      return {
        generatedAtUtc: new Date().toISOString(),
        totals: this.aggregate([report]),
        dossiers: [report],
      };
    }

    const dossiers = await this.dossiersService.list(organizationId, userId, {
      page: 1,
      pageSize: 100,
      status: DossierStatus.Active,
    });
    const reports = await Promise.all(
      dossiers.items.map((dossier) =>
        this.buildReport(organizationId, dossier as DossierReference),
      ),
    );
    return {
      generatedAtUtc: new Date().toISOString(),
      totals: this.aggregate(reports),
      dossiers: reports.sort((left, right) => left.score - right.score),
    };
  }

  async getDossierReport(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    const dossier = await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    return this.buildReport(organizationId, dossier);
  }

  private async buildReport(organizationId: string, dossier: DossierReference) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthYear = previousMonth.getFullYear();
    const previousMonthNumber = previousMonth.getMonth() + 1;

    const [
      fullDossier,
      missingDocuments,
      unprocessedDocuments,
      notScannedDocuments,
      infectedDocuments,
      overdueTasks,
      overdueObligations,
      draftEntries,
      pendingEntries,
      rejectedEntries,
      imbalancedEntries,
      unmatchedBankTransactions,
      unpostedInvoices,
      draftMonthlyDeclarations,
      activeEmployees,
      lastPayrollRuns,
      coreFiscalParameters,
    ] = await Promise.all([
      this.dossiers.findOneBy({ id: dossier.id, organizationId }),
      this.expectations.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          receivedDocumentId: IsNull(),
        },
      }),
      this.documents.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          deletedAtUtc: IsNull(),
          processingStatus: DocumentProcessingStatus.ToProcess,
        },
      }),
      this.documents.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          deletedAtUtc: IsNull(),
          malwareScanStatus: In([
            MalwareScanStatus.NotScanned,
            MalwareScanStatus.Failed,
          ]),
        },
      }),
      this.documents.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          deletedAtUtc: IsNull(),
          malwareScanStatus: MalwareScanStatus.Infected,
        },
      }),
      this.tasks.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          dueOn: LessThan(today),
          status: Not(In([WorkTaskStatus.Completed, WorkTaskStatus.Cancelled])),
        },
      }),
      this.obligations.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          dueOn: LessThan(today),
          status: Not(In([ObligationStatus.Filed, ObligationStatus.Paid])),
        },
      }),
      this.entries.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          status: JournalEntryStatus.Draft,
        },
      }),
      this.entries.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          status: JournalEntryStatus.PendingReview,
        },
      }),
      this.entries.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          status: JournalEntryStatus.Rejected,
        },
      }),
      this.entries
        .createQueryBuilder('entry')
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.dossier_id = :dossierId', { dossierId: dossier.id })
        .andWhere('entry.total_debit <> entry.total_credit')
        .getCount(),
      this.bankTransactions.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          status: BankTransactionStatus.Unmatched,
        },
      }),
      this.invoices.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          status: In([BusinessInvoiceStatus.Draft, BusinessInvoiceStatus.Validated]),
          journalEntryId: IsNull(),
        },
      }),
      this.monthlyDeclarations.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          status: In([
            MonthlyDeclarationStatus.Draft,
            MonthlyDeclarationStatus.Rejected,
            MonthlyDeclarationStatus.ReadyForReview,
          ]),
        },
      }),
      this.employees.count({
        where: { organizationId, dossierId: dossier.id, isActive: true },
      }),
      this.payrollRuns.count({
        where: {
          organizationId,
          dossierId: dossier.id,
          periodYear: previousMonthYear,
          periodMonth: previousMonthNumber,
          status: PayrollRunStatus.Validated,
        },
      }),
      this.fiscalParameters.count({
        where: [
          {
            organizationId,
            code: In(Object.values(FiscalParameterCode)),
            effectiveFrom: LessThan(today),
            effectiveTo: IsNull(),
          },
          {
            organizationId: IsNull(),
            code: In(Object.values(FiscalParameterCode)),
            effectiveFrom: LessThan(today),
            effectiveTo: IsNull(),
          },
          {
            organizationId,
            code: In(Object.values(FiscalParameterCode)),
            effectiveFrom: LessThan(today),
            effectiveTo: MoreThan(today),
          },
          {
            organizationId: IsNull(),
            code: In(Object.values(FiscalParameterCode)),
            effectiveFrom: LessThan(today),
            effectiveTo: MoreThan(today),
          },
        ],
      }),
    ]);

    const findings: QualityFinding[] = [];
    const dossierPath = `/dossiers/${dossier.id}`;

    if (!fullDossier?.taxIdentifier) {
      findings.push({
        code: 'DOSSIER_TAX_IDENTIFIER_MISSING',
        severity: 'WARNING',
        category: 'DOSSIER',
        title: 'Matricule fiscal manquant',
        details:
          'Le matricule fiscal est nécessaire pour les déclarations, factures et contrôles fiscaux.',
        actionLabel: 'Compléter le dossier',
        actionPath: dossierPath,
      });
    }
    if (!fullDossier?.rneNumber) {
      findings.push({
        code: 'DOSSIER_RNE_MISSING',
        severity: 'INFO',
        category: 'DOSSIER',
        title: 'Numéro RNE non renseigné',
        details:
          'Le RNE améliore la conformité des factures, contrats et dossiers juridiques.',
        actionLabel: 'Compléter le dossier',
        actionPath: dossierPath,
      });
    }
    if (!fullDossier?.activitySector) {
      findings.push({
        code: 'DOSSIER_ACTIVITY_MISSING',
        severity: 'INFO',
        category: 'DOSSIER',
        title: 'Activité non précisée',
        details:
          'Le secteur d’activité aide à choisir les obligations et les contrôles adaptés.',
        actionLabel: 'Compléter le dossier',
        actionPath: dossierPath,
      });
    }
    if ((fullDossier?.employeeCount ?? 0) > 0 && !fullDossier?.cnssEmployerNumber) {
      findings.push({
        code: 'DOSSIER_CNSS_MISSING',
        severity: 'BLOCKER',
        category: 'PAYROLL',
        title: 'Numéro employeur CNSS manquant',
        details:
          'Le dossier indique des salariés, mais le numéro CNSS employeur n’est pas renseigné.',
        actionLabel: 'Compléter la CNSS',
        actionPath: dossierPath,
      });
    }
    if (infectedDocuments > 0) {
      findings.push({
        code: 'DOCUMENT_MALWARE_DETECTED',
        severity: 'BLOCKER',
        category: 'DOCUMENTS',
        title: 'Document dangereux détecté',
        details:
          'Un ou plusieurs documents ont été signalés par le scan antivirus. Ne les traitez pas avant vérification.',
        count: infectedDocuments,
        actionLabel: 'Voir les documents',
        actionPath: '/documents',
      });
    }
    if (missingDocuments > 0) {
      findings.push({
        code: 'DOCUMENTS_EXPECTED_MISSING',
        severity: 'WARNING',
        category: 'DOCUMENTS',
        title: 'Pièces attendues manquantes',
        details:
          'Des pièces demandées au client ne sont pas encore rattachées au dossier.',
        count: missingDocuments,
        actionLabel: 'Relancer le client',
        actionPath: `${dossierPath}?onglet=documents`,
      });
    }
    if (unprocessedDocuments > 0) {
      findings.push({
        code: 'DOCUMENTS_UNPROCESSED',
        severity: 'WARNING',
        category: 'DOCUMENTS',
        title: 'Documents à traiter',
        details:
          'Des documents sont déposés mais pas encore marqués comme traités.',
        count: unprocessedDocuments,
        actionLabel: 'Traiter les pièces',
        actionPath: '/documents',
      });
    }
    if (notScannedDocuments > 0) {
      findings.push({
        code: 'DOCUMENTS_SCAN_PENDING',
        severity: 'INFO',
        category: 'DOCUMENTS',
        title: 'Scan antivirus à finaliser',
        details:
          'Des documents n’ont pas encore un statut antivirus sain confirmé.',
        count: notScannedDocuments,
        actionLabel: 'Voir les documents',
        actionPath: '/documents',
      });
    }
    if (overdueTasks > 0) {
      findings.push({
        code: 'TASKS_OVERDUE',
        severity: 'BLOCKER',
        category: 'TASKS',
        title: 'Tâches en retard',
        details:
          'Des tâches internes ont dépassé leur échéance et ne sont pas terminées.',
        count: overdueTasks,
        actionLabel: 'Voir les tâches',
        actionPath: '/taches',
      });
    }
    if (overdueObligations > 0) {
      findings.push({
        code: 'OBLIGATIONS_OVERDUE',
        severity: 'BLOCKER',
        category: 'OBLIGATIONS',
        title: 'Obligations fiscales en retard',
        details:
          'Des obligations ont dépassé leur échéance sans dépôt ou paiement enregistré.',
        count: overdueObligations,
        actionLabel: 'Voir le calendrier',
        actionPath: '/obligations',
      });
    }
    if (imbalancedEntries > 0) {
      findings.push({
        code: 'ACCOUNTING_IMBALANCED_ENTRIES',
        severity: 'BLOCKER',
        category: 'ACCOUNTING',
        title: 'Écritures non équilibrées',
        details:
          'Des écritures ont un total débit différent du total crédit.',
        count: imbalancedEntries,
        actionLabel: 'Corriger les écritures',
        actionPath: '/comptabilite',
      });
    }
    if (rejectedEntries > 0) {
      findings.push({
        code: 'ACCOUNTING_REJECTED_ENTRIES',
        severity: 'WARNING',
        category: 'ACCOUNTING',
        title: 'Écritures rejetées',
        details:
          'Des écritures ont été rejetées en revue et attendent une correction.',
        count: rejectedEntries,
        actionLabel: 'Corriger les écritures',
        actionPath: '/comptabilite',
      });
    }
    if (pendingEntries > 0) {
      findings.push({
        code: 'ACCOUNTING_PENDING_REVIEW',
        severity: 'WARNING',
        category: 'ACCOUNTING',
        title: 'Écritures à valider',
        details:
          'Des écritures sont prêtes pour revue mais pas encore comptabilisées.',
        count: pendingEntries,
        actionLabel: 'Valider les écritures',
        actionPath: '/comptabilite',
      });
    }
    if (draftEntries > 0) {
      findings.push({
        code: 'ACCOUNTING_DRAFT_ENTRIES',
        severity: 'INFO',
        category: 'ACCOUNTING',
        title: 'Écritures brouillon',
        details:
          'Des écritures sont encore en brouillon.',
        count: draftEntries,
        actionLabel: 'Finaliser les écritures',
        actionPath: '/comptabilite',
      });
    }
    if (unmatchedBankTransactions > 0) {
      findings.push({
        code: 'BANK_UNMATCHED_TRANSACTIONS',
        severity: 'WARNING',
        category: 'BANK',
        title: 'Transactions bancaires non rapprochées',
        details:
          'Des lignes bancaires importées ne sont pas encore rapprochées.',
        count: unmatchedBankTransactions,
        actionLabel: 'Rapprocher la banque',
        actionPath: '/banque',
      });
    }
    if (unpostedInvoices > 0) {
      findings.push({
        code: 'INVOICES_NOT_POSTED',
        severity: 'WARNING',
        category: 'INVOICES',
        title: 'Factures non comptabilisées',
        details:
          'Des factures existent sans écriture comptable rattachée.',
        count: unpostedInvoices,
        actionLabel: 'Comptabiliser les factures',
        actionPath: '/factures',
      });
    }
    if (draftMonthlyDeclarations > 0) {
      findings.push({
        code: 'FISCAL_DECLARATIONS_OPEN',
        severity: 'WARNING',
        category: 'FISCAL',
        title: 'Déclarations mensuelles ouvertes',
        details:
          'Des déclarations mensuelles ne sont pas encore validées ou déposées.',
        count: draftMonthlyDeclarations,
        actionLabel: 'Voir les déclarations',
        actionPath: '/declarations',
      });
    }
    if (coreFiscalParameters < Object.values(FiscalParameterCode).length) {
      findings.push({
        code: 'FISCAL_PARAMETERS_INCOMPLETE',
        severity: 'WARNING',
        category: 'FISCAL',
        title: 'Paramètres fiscaux incomplets',
        details:
          'Certains taux ou montants officiels ne sont pas encore configurés pour la période actuelle.',
        actionLabel: 'Configurer les taux',
        actionPath: '/fiscalite',
      });
    }
    if ((fullDossier?.employeeCount ?? 0) > 0 && activeEmployees === 0) {
      findings.push({
        code: 'PAYROLL_EMPLOYEE_REGISTER_EMPTY',
        severity: 'WARNING',
        category: 'PAYROLL',
        title: 'Registre salariés vide',
        details:
          'Le dossier indique des salariés, mais aucun salarié actif n’est saisi dans la paie.',
        actionLabel: 'Configurer la paie',
        actionPath: '/paie',
      });
    }
    if (activeEmployees > 0 && lastPayrollRuns === 0) {
      findings.push({
        code: 'PAYROLL_PREVIOUS_MONTH_NOT_VALIDATED',
        severity: 'WARNING',
        category: 'PAYROLL',
        title: 'Paie du mois précédent non validée',
        details:
          `Aucun traitement de paie validé trouvé pour ${String(previousMonthNumber).padStart(2, '0')}/${previousMonthYear}.`,
        actionLabel: 'Valider la paie',
        actionPath: '/paie',
      });
    }

    const counts = this.countFindings(findings);
    return {
      dossier: {
        id: dossier.id,
        legalName: dossier.legalName,
        tradeName: dossier.tradeName ?? null,
      },
      score: this.score(counts),
      counts,
      findings,
    };
  }

  private aggregate(reports: Array<{ score: number; counts: Record<QualitySeverity, number> }>) {
    const counts = reports.reduce(
      (acc, report) => ({
        BLOCKER: acc.BLOCKER + report.counts.BLOCKER,
        WARNING: acc.WARNING + report.counts.WARNING,
        INFO: acc.INFO + report.counts.INFO,
      }),
      { BLOCKER: 0, WARNING: 0, INFO: 0 },
    );
    const averageScore =
      reports.length === 0
        ? 100
        : Math.round(
            reports.reduce((total, report) => total + report.score, 0) /
              reports.length,
          );
    return {
      dossiersChecked: reports.length,
      averageScore,
      ...counts,
    };
  }

  private countFindings(findings: QualityFinding[]) {
    return findings.reduce(
      (acc, finding) => ({
        ...acc,
        [finding.severity]: acc[finding.severity] + 1,
      }),
      { BLOCKER: 0, WARNING: 0, INFO: 0 },
    );
  }

  private score(counts: Record<QualitySeverity, number>) {
    return Math.max(0, 100 - counts.BLOCKER * 18 - counts.WARNING * 8 - counts.INFO * 2);
  }
}
