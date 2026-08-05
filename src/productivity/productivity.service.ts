import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AuditLog,
  CabinetMemberCostRate,
  ClientDossier,
  DossierAssignment,
  MemberCompensationType,
  OrganizationMembership,
  TimeEntry,
  TimeEntrySource,
  TimeEntryStatus,
  WorkSession,
  WorkSessionStatus,
  WorkTask,
} from '../database/entities';
import { PermissionNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  CreateMemberCostRateDto,
  CreateTimeEntryDto,
  CorrectTimeEntryDto,
  ProfitabilityQueryDto,
  ReviewTimeEntryDto,
  StartWorkSessionDto,
  TimeEntryQueryDto,
  TimeEntryReviewDecision,
} from './dto';

interface DossierMetric {
  id: string;
  name: string;
  approvedMinutes: number;
  billableMinutes: number;
  budgetMinutes: number;
  allocatedPay: bigint;
  employerCost: bigint;
  billedRevenue: bigint;
  collectedRevenue: bigint;
  missingCostMembershipIds: Set<string>;
  workers: Map<string, DossierWorkerMetric>;
}

interface DossierWorkerMetric {
  membershipId: string;
  fullName: string;
  approvedMinutes: number;
  billableMinutes: number;
  budgetMinutes: number;
  allocatedPay: bigint;
  employerCost: bigint;
  allocatedBilledRevenue: bigint;
  allocatedCollectedRevenue: bigint;
}

interface MemberMetric {
  membershipId: string;
  fullName: string;
  approvedMinutes: number;
  billableMinutes: number;
  budgetMinutes: number;
  allocatedPay: bigint;
  allocatedEmployerCost: bigint;
  hourlyPay: bigint;
  hourlyEmployerCost: bigint;
  allocatedBilledRevenue: bigint;
  allocatedCollectedRevenue: bigint;
  missingCostRate: boolean;
}

type CockpitSeverity = 'success' | 'info' | 'warning' | 'error';

interface CockpitItem {
  id: string;
  sourceType: string;
  dossierId: string;
  dossierName: string;
  title: string;
  subtitle: string;
  dueOn: string | null;
  status: string;
  amount: string | null;
  actionLabel: string;
  actionPath: string;
}

interface CockpitLane {
  key: string;
  title: string;
  description: string;
  severity: CockpitSeverity;
  count: number;
  actionLabel: string;
  actionPath: string;
  items: CockpitItem[];
}

@Injectable()
export class ProductivityService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CabinetMemberCostRate)
    private readonly costRates: Repository<CabinetMemberCostRate>,
    @InjectRepository(TimeEntry)
    private readonly timeEntries: Repository<TimeEntry>,
    @InjectRepository(WorkSession)
    private readonly workSessions: Repository<WorkSession>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectRepository(WorkTask)
    private readonly tasks: Repository<WorkTask>,
    @InjectRepository(ClientDossier)
    private readonly dossierRepository: Repository<ClientDossier>,
    @InjectRepository(DossierAssignment)
    private readonly assignments: Repository<DossierAssignment>,
    private readonly dossiers: DossiersService,
  ) {}

  async listCostRates(organizationId: string) {
    const rates = await this.costRates.find({
      where: { organizationId },
      relations: { membership: { user: true } },
      order: { effectiveFrom: 'DESC' },
    });
    return rates.map((rate) => this.toCostRate(rate));
  }

  async cockpit(organizationId: string, actorUserId: string) {
    const actor = await this.getActor(organizationId, actorUserId);
    const canSeeAll = actor.permissions.has(PermissionNames.DossiersAssign);
    const params = [organizationId, actor.membership.id, canSeeAll];
    const accessFilter = `
      AND ($3::boolean OR EXISTS (
        SELECT 1
        FROM accounting.dossier_assignments access_assignment
        WHERE access_assignment.dossier_id = d.id
          AND access_assignment.membership_id = $2
          AND access_assignment.is_active = true
      ))
    `;
    const activeDossierFilter = `
      d.organization_id = $1
      AND d.deleted_at_utc IS NULL
      AND d.status <> 'ARCHIVE'
      ${accessFilter}
    `;

    const [
      overdueTasks,
      reviewTasks,
      documents,
      invoiceValidation,
      unpaidInvoices,
      bankTransactions,
      obligations,
      payrollRuns,
    ] = await Promise.all([
      this.dataSource.query(
        `
        SELECT t.id, t.dossier_id AS "dossierId", d.legal_name AS "dossierName",
               t.title, t.due_on AS "dueOn", t.priority, t.status,
               COUNT(*) OVER() AS total
        FROM accounting.work_tasks t
        JOIN accounting.client_dossiers d ON d.id = t.dossier_id
        WHERE ${activeDossierFilter}
          AND t.status IN ('A_FAIRE','EN_COURS')
          AND t.due_on <= CURRENT_DATE
        ORDER BY t.due_on ASC,
          CASE t.priority WHEN 'URGENTE' THEN 0 WHEN 'HAUTE' THEN 1 WHEN 'NORMALE' THEN 2 ELSE 3 END,
          t.created_at_utc ASC
        LIMIT 8
        `,
        params,
      ),
      this.dataSource.query(
        `
        SELECT t.id, t.dossier_id AS "dossierId", d.legal_name AS "dossierName",
               t.title, t.due_on AS "dueOn", t.priority, t.status,
               COUNT(*) OVER() AS total
        FROM accounting.work_tasks t
        JOIN accounting.client_dossiers d ON d.id = t.dossier_id
        WHERE ${activeDossierFilter}
          AND t.status = 'PRETE_POUR_REVISION'
        ORDER BY t.due_on ASC, t.created_at_utc ASC
        LIMIT 8
        `,
        params,
      ),
      this.dataSource.query(
        `
        SELECT doc.id, doc.dossier_id AS "dossierId", d.legal_name AS "dossierName",
               doc.original_name AS title, doc.category, doc.period_year AS "periodYear",
               doc.period_month AS "periodMonth", doc.processing_status AS "processingStatus",
               doc.extraction_status AS "extractionStatus", doc.malware_scan_status AS "malwareScanStatus",
               doc.created_at_utc AS "createdAtUtc", COUNT(*) OVER() AS total
        FROM accounting.accounting_documents doc
        JOIN accounting.client_dossiers d ON d.id = doc.dossier_id
        WHERE ${activeDossierFilter}
          AND doc.deleted_at_utc IS NULL
          AND (
            doc.processing_status = 'A_TRAITER'
            OR doc.extraction_status = 'ECHEC'
            OR doc.malware_scan_status IN ('INFECTE','ERREUR')
          )
        ORDER BY
          CASE
            WHEN doc.malware_scan_status IN ('INFECTE','ERREUR') THEN 0
            WHEN doc.extraction_status = 'ECHEC' THEN 1
            ELSE 2
          END,
          doc.created_at_utc DESC
        LIMIT 8
        `,
        params,
      ),
      this.dataSource.query(
        `
        SELECT inv.id, inv.dossier_id AS "dossierId", d.legal_name AS "dossierName",
               inv.number, inv.type, inv.kind, inv.third_party_name AS "thirdPartyName",
               inv.invoice_date AS "invoiceDate", inv.gross_amount AS amount, inv.status,
               COUNT(*) OVER() AS total
        FROM accounting.business_invoices inv
        JOIN accounting.client_dossiers d ON d.id = inv.dossier_id
        WHERE ${activeDossierFilter}
          AND inv.status IN ('BROUILLON','VALIDEE')
        ORDER BY
          CASE inv.status WHEN 'VALIDEE' THEN 0 ELSE 1 END,
          inv.invoice_date DESC,
          inv.created_at_utc DESC
        LIMIT 8
        `,
        params,
      ),
      this.dataSource.query(
        `
        SELECT inv.id, inv.dossier_id AS "dossierId", d.legal_name AS "dossierName",
               inv.number, inv.type, inv.third_party_name AS "thirdPartyName",
               inv.due_date AS "dueOn", inv.outstanding_amount AS amount,
               inv.settlement_status AS status, COUNT(*) OVER() AS total
        FROM accounting.business_invoices inv
        JOIN accounting.client_dossiers d ON d.id = inv.dossier_id
        WHERE ${activeDossierFilter}
          AND inv.status = 'COMPTABILISEE'
          AND inv.settlement_status <> 'REGLEE'
          AND inv.due_date IS NOT NULL
          AND inv.due_date <= CURRENT_DATE
        ORDER BY inv.due_date ASC, inv.outstanding_amount DESC
        LIMIT 8
        `,
        params,
      ),
      this.dataSource.query(
        `
        SELECT tx.id, tx.dossier_id AS "dossierId", d.legal_name AS "dossierName",
               tx.description AS title, tx.transaction_date AS "dueOn",
               tx.amount, tx.status, bs.source_file_name AS "sourceFileName",
               COUNT(*) OVER() AS total
        FROM accounting.bank_transactions tx
        JOIN accounting.client_dossiers d ON d.id = tx.dossier_id
        JOIN accounting.bank_statements bs ON bs.id = tx.statement_id
        WHERE ${activeDossierFilter}
          AND tx.status <> 'RAPPROCHEE'
        ORDER BY tx.transaction_date ASC, ABS(tx.amount::numeric) DESC
        LIMIT 8
        `,
        params,
      ),
      this.dataSource.query(
        `
        SELECT obl.id, obl.dossier_id AS "dossierId", d.legal_name AS "dossierName",
               tpl.title, obl.due_on AS "dueOn", obl.status,
               obl.amount_due AS amount, COUNT(*) OVER() AS total
        FROM accounting.obligation_instances obl
        JOIN accounting.client_dossiers d ON d.id = obl.dossier_id
        JOIN accounting.obligation_templates tpl ON tpl.id = obl.template_id
        WHERE ${activeDossierFilter}
          AND obl.status NOT IN ('DEPOSEE','PAYEE')
          AND obl.due_on <= CURRENT_DATE + INTERVAL '7 days'
        ORDER BY obl.due_on ASC
        LIMIT 8
        `,
        params,
      ),
      this.dataSource.query(
        `
        SELECT pr.id, pr.dossier_id AS "dossierId", d.legal_name AS "dossierName",
               pr.period_year AS "periodYear", pr.period_month AS "periodMonth",
               pr.total_net AS amount, pr.status, COUNT(*) OVER() AS total
        FROM accounting.payroll_runs pr
        JOIN accounting.client_dossiers d ON d.id = pr.dossier_id
        WHERE ${activeDossierFilter}
          AND pr.status = 'BROUILLON'
        ORDER BY pr.period_year DESC, pr.period_month DESC
        LIMIT 8
        `,
        params,
      ),
    ]);

    const lanes: CockpitLane[] = [
      this.lane(
        'overdue_tasks',
        'Tâches en retard',
        'Travaux arrivés à échéance et non terminés.',
        'error',
        'Ouvrir les tâches',
        '/taches',
        overdueTasks,
        (row) => ({
          id: row.id,
          sourceType: 'TASK',
          dossierId: row.dossierId,
          dossierName: row.dossierName,
          title: row.title,
          subtitle: `Priorité ${row.priority}`,
          dueOn: row.dueOn,
          status: row.status,
          amount: null,
          actionLabel: 'Traiter',
          actionPath: `/dossiers/${row.dossierId}?espace=suivi`,
        }),
      ),
      this.lane(
        'review_tasks',
        'À valider',
        'Travaux préparés par l’équipe et en attente de validation.',
        'warning',
        'Revoir les validations',
        '/taches',
        reviewTasks,
        (row) => ({
          id: row.id,
          sourceType: 'TASK_REVIEW',
          dossierId: row.dossierId,
          dossierName: row.dossierName,
          title: row.title,
          subtitle: 'Prêt pour révision',
          dueOn: row.dueOn,
          status: row.status,
          amount: null,
          actionLabel: 'Valider',
          actionPath: `/dossiers/${row.dossierId}?espace=suivi`,
        }),
      ),
      this.lane(
        'documents',
        'Pièces à traiter',
        'Documents déposés, extractions en échec ou scan à vérifier.',
        'warning',
        'Ouvrir les documents',
        '/documents',
        documents,
        (row) => ({
          id: row.id,
          sourceType: 'DOCUMENT',
          dossierId: row.dossierId,
          dossierName: row.dossierName,
          title: row.title,
          subtitle: `${row.category} · ${row.extractionStatus} · ${row.malwareScanStatus}`,
          dueOn: null,
          status: row.processingStatus,
          amount: null,
          actionLabel: 'Classer',
          actionPath: `/documents?dossierId=${row.dossierId}`,
        }),
      ),
      this.lane(
        'invoice_validation',
        'Factures à finaliser',
        'Brouillons à valider ou factures validées à comptabiliser.',
        'info',
        'Ouvrir achats & ventes',
        '/factures',
        invoiceValidation,
        (row) => ({
          id: row.id,
          sourceType: 'INVOICE',
          dossierId: row.dossierId,
          dossierName: row.dossierName,
          title: `${row.number} · ${row.thirdPartyName}`,
          subtitle: `${row.type} · ${row.kind}`,
          dueOn: row.invoiceDate,
          status: row.status,
          amount: row.amount,
          actionLabel: row.status === 'VALIDEE' ? 'Comptabiliser' : 'Valider',
          actionPath: `/factures?dossierId=${row.dossierId}`,
        }),
      ),
      this.lane(
        'unpaid_invoices',
        'Règlements à suivre',
        'Factures comptabilisées non réglées et échues.',
        'warning',
        'Ouvrir les règlements',
        '/factures',
        unpaidInvoices,
        (row) => ({
          id: row.id,
          sourceType: 'PAYMENT',
          dossierId: row.dossierId,
          dossierName: row.dossierName,
          title: `${row.number} · ${row.thirdPartyName}`,
          subtitle: row.type === 'VENTE' ? 'Client à relancer' : 'Fournisseur à régler',
          dueOn: row.dueOn,
          status: row.status,
          amount: row.amount,
          actionLabel: 'Régler',
          actionPath: `/factures?dossierId=${row.dossierId}`,
        }),
      ),
      this.lane(
        'bank',
        'Banque à rapprocher',
        'Mouvements bancaires non rapprochés.',
        'info',
        'Ouvrir la banque',
        '/banque',
        bankTransactions,
        (row) => ({
          id: row.id,
          sourceType: 'BANK',
          dossierId: row.dossierId,
          dossierName: row.dossierName,
          title: row.title,
          subtitle: row.sourceFileName,
          dueOn: row.dueOn,
          status: row.status,
          amount: row.amount,
          actionLabel: 'Rapprocher',
          actionPath: `/banque?dossierId=${row.dossierId}`,
        }),
      ),
      this.lane(
        'obligations',
        'Échéances 7 jours',
        'Obligations fiscales/sociales arrivant bientôt.',
        'error',
        'Ouvrir calendrier fiscal',
        '/obligations',
        obligations,
        (row) => ({
          id: row.id,
          sourceType: 'OBLIGATION',
          dossierId: row.dossierId,
          dossierName: row.dossierName,
          title: row.title,
          subtitle: 'Déclaration ou paiement à préparer',
          dueOn: row.dueOn,
          status: row.status,
          amount: row.amount,
          actionLabel: 'Préparer',
          actionPath: `/obligations?dossierId=${row.dossierId}`,
        }),
      ),
      this.lane(
        'payroll',
        'Paies brouillon',
        'Traitements de paie calculés mais pas encore validés.',
        'info',
        'Ouvrir la paie',
        '/paie',
        payrollRuns,
        (row) => ({
          id: row.id,
          sourceType: 'PAYROLL',
          dossierId: row.dossierId,
          dossierName: row.dossierName,
          title: `Paie ${String(row.periodMonth).padStart(2, '0')}/${row.periodYear}`,
          subtitle: 'À contrôler avant validation',
          dueOn: null,
          status: row.status,
          amount: row.amount,
          actionLabel: 'Contrôler',
          actionPath: `/paie?dossierId=${row.dossierId}`,
        }),
      ),
    ];

    const totalActions = lanes.reduce((sum, lane) => sum + lane.count, 0);
    return {
      generatedAtUtc: new Date().toISOString(),
      totals: {
        totalActions,
        criticalActions: lanes
          .filter((lane) => lane.severity === 'error')
          .reduce((sum, lane) => sum + lane.count, 0),
        validationActions: this.count(reviewTasks) + this.count(invoiceValidation),
        collectionActions: this.count(documents) + this.count(bankTransactions),
      },
      lanes,
    };
  }

  async createCostRate(
    organizationId: string,
    actorUserId: string,
    dto: CreateMemberCostRateDto,
  ) {
    const membership = await this.memberships.findOne({
      where: { id: dto.membershipId, organizationId, isActive: true },
      relations: { user: true },
    });
    if (!membership)
      throw new NotFoundException('Le membre actif est introuvable.');
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom)
      throw new BadRequestException(
        'La date de fin ne peut pas précéder la date de début.',
      );
    if (toMillimes(dto.employerCostRateAmount) < toMillimes(dto.payRateAmount))
      throw new BadRequestException(
        'Le coût employeur doit être supérieur ou égal au montant versé.',
      );
    const overlap = await this.costRates
      .createQueryBuilder('rate')
      .where('rate.organization_id = :organizationId', { organizationId })
      .andWhere('rate.membership_id = :membershipId', {
        membershipId: dto.membershipId,
      })
      .andWhere('rate.effective_from <= :effectiveTo', {
        effectiveTo: dto.effectiveTo ?? '9999-12-31',
      })
      .andWhere("COALESCE(rate.effective_to, '9999-12-31') >= :effectiveFrom", {
        effectiveFrom: dto.effectiveFrom,
      })
      .getOne();
    if (overlap)
      throw new ConflictException(
        'Une configuration de rémunération couvre déjà cette période.',
      );
    const rate = await this.costRates.save(
      this.costRates.create({
        organizationId,
        membershipId: dto.membershipId,
        compensationType: dto.compensationType,
        payRateAmount: dto.payRateAmount,
        employerCostRateAmount: dto.employerCostRateAmount,
        monthlyTargetMinutes: dto.monthlyTargetMinutes,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
        createdByUserId: actorUserId,
        membership,
      }),
    );
    await this.audit(
      organizationId,
      actorUserId,
      'team_cost_rate.created',
      'CabinetMemberCostRate',
      rate.id,
      {
        membershipId: rate.membershipId,
        compensationType: rate.compensationType,
        effectiveFrom: rate.effectiveFrom,
        effectiveTo: rate.effectiveTo,
      },
    );
    return this.toCostRate(rate);
  }

  async listTimeEntries(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    query: TimeEntryQueryDto,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const actor = await this.getActor(organizationId, actorUserId);
    const { from, to } = this.resolveRange(query.from, query.to);
    const canReview =
      actor.permissions.has(PermissionNames.TimeTrackingApprove) ||
      actor.permissions.has(PermissionNames.ProfitabilityView);
    const builder = this.timeEntries
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.membership', 'membership')
      .leftJoinAndSelect('membership.user', 'user')
      .leftJoinAndSelect('entry.task', 'task')
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.dossier_id = :dossierId', { dossierId })
      .andWhere('entry.work_date BETWEEN :from AND :to', { from, to });
    if (canReview && query.membershipId) {
      builder.andWhere('entry.membership_id = :membershipId', {
        membershipId: query.membershipId,
      });
    } else if (!canReview) {
      builder.andWhere('entry.membership_id = :membershipId', {
        membershipId: actor.membership.id,
      });
    }
    if (query.status)
      builder.andWhere('entry.status = :status', { status: query.status });
    const entries = await builder
      .orderBy('entry.work_date', 'DESC')
      .addOrderBy('entry.created_at_utc', 'DESC')
      .getMany();
    return entries.map((entry) => this.toTimeEntry(entry));
  }

  async createTimeEntry(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    dto: CreateTimeEntryDto,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const actor = await this.getActor(organizationId, actorUserId);
    this.ensureWorkDate(dto.workDate);
    await this.ensureTask(organizationId, dossierId, dto.taskId);
    await this.ensureDailyCapacity(
      organizationId,
      actor.membership.id,
      dto.workDate,
      dto.durationMinutes,
    );
    const entry = await this.timeEntries.save(
      this.timeEntries.create({
        organizationId,
        dossierId,
        membershipId: actor.membership.id,
        taskId: dto.taskId ?? null,
        workDate: dto.workDate,
        durationMinutes: dto.durationMinutes,
        source: TimeEntrySource.Manual,
        sourceSessionId: null,
        startedAtUtc: null,
        stoppedAtUtc: null,
        originalDurationMinutes: null,
        correctionReason: null,
        requiresReview: true,
        anomalyCode: 'SAISIE_MANUELLE',
        billable: dto.billable,
        description: this.description(dto.description),
        status: TimeEntryStatus.Draft,
        submittedAtUtc: null,
        reviewedAtUtc: null,
        reviewedByUserId: null,
        reviewComment: null,
        createdByUserId: actorUserId,
        membership: actor.membership,
      }),
    );
    return this.toTimeEntry(entry);
  }

  async updateTimeEntry(
    organizationId: string,
    dossierId: string,
    entryId: string,
    actorUserId: string,
    dto: CorrectTimeEntryDto,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const actor = await this.getActor(organizationId, actorUserId);
    const entry = await this.getOwnedEntry(
      organizationId,
      dossierId,
      entryId,
      actor.membership.id,
    );
    if (
      ![TimeEntryStatus.Draft, TimeEntryStatus.Rejected].includes(entry.status)
    )
      throw new ConflictException(
        'Seul un temps en brouillon ou rejeté peut être modifié.',
      );
    const workDate = dto.workDate ?? entry.workDate;
    const durationMinutes = dto.durationMinutes ?? entry.durationMinutes;
    this.ensureWorkDate(workDate);
    await this.ensureTask(
      organizationId,
      dossierId,
      dto.taskId === undefined ? entry.taskId : dto.taskId,
    );
    await this.ensureDailyCapacity(
      organizationId,
      actor.membership.id,
      workDate,
      durationMinutes,
      entry.id,
    );
    entry.workDate = workDate;
    if (durationMinutes !== entry.durationMinutes) {
      const reason = dto.correctionReason?.trim();
      if (!reason)
        throw new BadRequestException(
          'Un motif est obligatoire pour modifier la durée enregistrée.',
        );
      entry.originalDurationMinutes ??= entry.durationMinutes;
      entry.correctionReason = reason;
      entry.requiresReview = true;
      entry.anomalyCode = 'DUREE_CORRIGEE';
    }
    entry.durationMinutes = durationMinutes;
    if (dto.billable !== undefined) entry.billable = dto.billable;
    if (dto.description !== undefined)
      entry.description = this.description(dto.description);
    if (dto.taskId !== undefined) entry.taskId = dto.taskId ?? null;
    entry.status = TimeEntryStatus.Draft;
    entry.reviewComment = null;
    entry.reviewedAtUtc = null;
    entry.reviewedByUserId = null;
    return this.toTimeEntry(await this.timeEntries.save(entry));
  }

  async activeWorkSession(organizationId: string, actorUserId: string) {
    const actor = await this.getActor(organizationId, actorUserId);
    const session = await this.findOpenSession(
      organizationId,
      actor.membership.id,
    );
    if (!session) return null;
    await this.pauseIfStale(session);
    return this.toWorkSession(session);
  }

  async startWorkSession(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    dto: StartWorkSessionDto,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const actor = await this.getActor(organizationId, actorUserId);
    await this.ensureTask(organizationId, dossierId, dto.taskId);
    const description = this.description(dto.description);
    const current = await this.findOpenSession(
      organizationId,
      actor.membership.id,
    );
    if (current) {
      if (
        current.dossierId === dossierId &&
        current.taskId === (dto.taskId ?? null)
      ) {
        current.description = description;
        current.billable = dto.billable;
        current.status = WorkSessionStatus.Active;
        current.lastHeartbeatAtUtc = new Date();
        return this.toWorkSession(await this.workSessions.save(current));
      }
      await this.completeWorkSession(current, actorUserId, new Date());
    }

    const now = new Date();
    const session = await this.workSessions.save(
      this.workSessions.create({
        organizationId,
        dossierId,
        membershipId: actor.membership.id,
        taskId: dto.taskId ?? null,
        description,
        billable: dto.billable,
        status: WorkSessionStatus.Active,
        startedAtUtc: now,
        lastHeartbeatAtUtc: now,
        stoppedAtUtc: null,
        activeSeconds: 0,
        inactiveSeconds: 0,
        heartbeatCount: 0,
        idleTimeoutSeconds: 120,
        createdByUserId: actorUserId,
        membership: actor.membership,
      }),
    );
    await this.audit(
      organizationId,
      actorUserId,
      'work_session.started',
      'WorkSession',
      session.id,
      { dossierId, taskId: session.taskId },
    );
    return this.toWorkSession(session);
  }

  async heartbeatWorkSession(
    organizationId: string,
    sessionId: string,
    actorUserId: string,
    active: boolean,
  ) {
    const actor = await this.getActor(organizationId, actorUserId);
    const session = await this.getOwnedOpenSession(
      organizationId,
      sessionId,
      actor.membership.id,
    );
    this.accrueSession(session, new Date(), active);
    await this.workSessions.save(session);
    return this.toWorkSession(session);
  }

  async stopWorkSession(
    organizationId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    const actor = await this.getActor(organizationId, actorUserId);
    const session = await this.getOwnedOpenSession(
      organizationId,
      sessionId,
      actor.membership.id,
    );
    const entry = await this.completeWorkSession(
      session,
      actorUserId,
      new Date(),
    );
    return {
      session: this.toWorkSession(session),
      timeEntry: entry ? this.toTimeEntry(entry) : null,
    };
  }

  async submitTimeEntry(
    organizationId: string,
    dossierId: string,
    entryId: string,
    actorUserId: string,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const actor = await this.getActor(organizationId, actorUserId);
    const entry = await this.getOwnedEntry(
      organizationId,
      dossierId,
      entryId,
      actor.membership.id,
    );
    if (
      ![TimeEntryStatus.Draft, TimeEntryStatus.Rejected].includes(entry.status)
    )
      throw new ConflictException('Ce temps ne peut pas être soumis.');
    entry.status = TimeEntryStatus.Submitted;
    entry.submittedAtUtc = new Date();
    entry.reviewedAtUtc = null;
    entry.reviewedByUserId = null;
    entry.reviewComment = null;
    await this.timeEntries.save(entry);
    await this.audit(
      organizationId,
      actorUserId,
      'time_entry.submitted',
      'TimeEntry',
      entry.id,
      {
        dossierId,
        workDate: entry.workDate,
        durationMinutes: entry.durationMinutes,
      },
    );
    return this.toTimeEntry(entry);
  }

  async reviewTimeEntry(
    organizationId: string,
    dossierId: string,
    entryId: string,
    actorUserId: string,
    dto: ReviewTimeEntryDto,
  ) {
    await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const entry = await this.timeEntries.findOne({
      where: { id: entryId, organizationId, dossierId },
      relations: { membership: { user: true }, task: true },
    });
    if (!entry) throw new NotFoundException('Le temps est introuvable.');
    if (entry.status !== TimeEntryStatus.Submitted)
      throw new ConflictException('Seul un temps soumis peut être contrôlé.');
    const comment = dto.comment?.trim() || null;
    if (dto.decision === TimeEntryReviewDecision.Reject && !comment)
      throw new BadRequestException('Un motif est obligatoire pour le rejet.');
    entry.status =
      dto.decision === TimeEntryReviewDecision.Approve
        ? TimeEntryStatus.Approved
        : TimeEntryStatus.Rejected;
    entry.reviewComment = comment;
    entry.reviewedAtUtc = new Date();
    entry.reviewedByUserId = actorUserId;
    await this.timeEntries.save(entry);
    await this.audit(
      organizationId,
      actorUserId,
      `time_entry.${entry.status === TimeEntryStatus.Approved ? 'approved' : 'rejected'}`,
      'TimeEntry',
      entry.id,
      { dossierId, comment },
    );
    return this.toTimeEntry(entry);
  }

  async profitability(
    organizationId: string,
    actorUserId: string,
    query: ProfitabilityQueryDto,
  ) {
    const { from, to } = this.resolveRange(query.from, query.to);
    const actor = await this.getActor(organizationId, actorUserId);
    const dossiers = await this.accessibleDossiers(
      organizationId,
      actor.membership.id,
      actor.permissions.has(PermissionNames.DossiersAssign),
    );
    const dossierIds = dossiers.map((dossier) => dossier.id);
    const months = this.monthsTouched(from, to);
    if (!dossierIds.length) return this.emptyProfitability(from, to, months);

    const [entries, rates, assignments, revenueRows] = await Promise.all([
      this.timeEntries
        .createQueryBuilder('entry')
        .leftJoinAndSelect('entry.membership', 'membership')
        .leftJoinAndSelect('membership.user', 'user')
        .leftJoinAndSelect('entry.dossier', 'dossier')
        .where('entry.organization_id = :organizationId', { organizationId })
        .andWhere('entry.dossier_id = ANY(:dossierIds)', { dossierIds })
        .andWhere('entry.work_date BETWEEN :from AND :to', { from, to })
        .andWhere('entry.status = :status', {
          status: TimeEntryStatus.Approved,
        })
        .getMany(),
      this.costRates
        .createQueryBuilder('rate')
        .leftJoinAndSelect('rate.membership', 'membership')
        .leftJoinAndSelect('membership.user', 'user')
        .where('rate.organization_id = :organizationId', { organizationId })
        .andWhere('rate.effective_from <= :to', { to })
        .andWhere("COALESCE(rate.effective_to, '9999-12-31') >= :from", {
          from,
        })
        .orderBy('rate.effective_from', 'ASC')
        .getMany(),
      this.assignments.find({
        where: dossierIds.map((dossierId) => ({
          organizationId,
          dossierId,
          isActive: true,
        })),
        relations: { membership: { user: true } },
      }),
      this.dataSource.query<
        Array<{
          dossier_id: string;
          billed: string;
          collected: string;
        }>
      >(
        `SELECT dossier_id,
          COALESCE(SUM(net_amount),0)::numeric(15,3) AS billed,
          COALESCE(SUM(CASE WHEN total_amount > 0
            THEN net_amount * paid_amount / total_amount ELSE 0 END),0)::numeric(15,3) AS collected
         FROM accounting.cabinet_invoices
         WHERE organization_id=$1 AND dossier_id=ANY($2::uuid[])
           AND issue_date BETWEEN $3 AND $4 AND status <> 'ANNULEE'
         GROUP BY dossier_id`,
        [organizationId, dossierIds, from, to],
      ),
    ]);

    const dossierMetrics = new Map<string, DossierMetric>();
    for (const dossier of dossiers) {
      dossierMetrics.set(dossier.id, {
        id: dossier.id,
        name: dossier.legalName,
        approvedMinutes: 0,
        billableMinutes: 0,
        budgetMinutes: 0,
        allocatedPay: 0n,
        employerCost: 0n,
        billedRevenue: 0n,
        collectedRevenue: 0n,
        missingCostMembershipIds: new Set<string>(),
        workers: new Map<string, DossierWorkerMetric>(),
      });
    }
    const memberMetrics = new Map<string, MemberMetric>();
    const getMember = (membershipId: string, fullName: string) => {
      let metric = memberMetrics.get(membershipId);
      if (!metric) {
        metric = {
          membershipId,
          fullName,
          approvedMinutes: 0,
          billableMinutes: 0,
          budgetMinutes: 0,
          allocatedPay: 0n,
          allocatedEmployerCost: 0n,
          hourlyPay: 0n,
          hourlyEmployerCost: 0n,
          allocatedBilledRevenue: 0n,
          allocatedCollectedRevenue: 0n,
          missingCostRate: false,
        };
        memberMetrics.set(membershipId, metric);
      }
      return metric;
    };

    for (const assignment of assignments) {
      const budget = (assignment.monthlyTimeBudgetMinutes ?? 0) * months;
      const dossier = dossierMetrics.get(assignment.dossierId);
      if (!dossier) continue;
      const member = getMember(
        assignment.membershipId,
        assignment.membership.user.fullName,
      );
      dossier.budgetMinutes += budget;
      member.budgetMinutes += budget;
      const worker = this.getDossierWorker(
        dossier,
        assignment.membershipId,
        assignment.membership.user.fullName,
      );
      worker.budgetMinutes += budget;
    }

    for (const row of revenueRows) {
      const dossier = dossierMetrics.get(row.dossier_id);
      if (!dossier) continue;
      dossier.billedRevenue = toMillimes(row.billed);
      dossier.collectedRevenue = toMillimes(row.collected);
    }

    for (const entry of entries) {
      const dossier = dossierMetrics.get(entry.dossierId);
      if (!dossier) continue;
      const fullName = entry.membership.user.fullName;
      const member = getMember(entry.membershipId, fullName);
      const worker = this.getDossierWorker(
        dossier,
        entry.membershipId,
        fullName,
      );
      const rate = this.rateAt(rates, entry.membershipId, entry.workDate);
      const pay = rate
        ? this.amountForMinutes(rate, rate.payRateAmount, entry.durationMinutes)
        : 0n;
      const employerCost = rate
        ? this.amountForMinutes(
            rate,
            rate.employerCostRateAmount,
            entry.durationMinutes,
          )
        : 0n;
      for (const metric of [dossier, member, worker]) {
        metric.approvedMinutes += entry.durationMinutes;
        metric.billableMinutes += entry.billable ? entry.durationMinutes : 0;
      }
      dossier.allocatedPay += pay;
      dossier.employerCost += employerCost;
      member.allocatedPay += pay;
      member.allocatedEmployerCost += employerCost;
      worker.allocatedPay += pay;
      worker.employerCost += employerCost;
      if (!rate) {
        dossier.missingCostMembershipIds.add(entry.membershipId);
        member.missingCostRate = true;
      } else if (rate.compensationType === MemberCompensationType.Hourly) {
        member.hourlyPay += pay;
        member.hourlyEmployerCost += employerCost;
      }
    }

    for (const dossier of dossierMetrics.values()) {
      if (dossier.billableMinutes <= 0) continue;
      for (const worker of dossier.workers.values()) {
        worker.allocatedBilledRevenue = this.prorate(
          dossier.billedRevenue,
          worker.billableMinutes,
          dossier.billableMinutes,
        );
        worker.allocatedCollectedRevenue = this.prorate(
          dossier.collectedRevenue,
          worker.billableMinutes,
          dossier.billableMinutes,
        );
        const member = memberMetrics.get(worker.membershipId);
        if (member) {
          member.allocatedBilledRevenue += worker.allocatedBilledRevenue;
          member.allocatedCollectedRevenue += worker.allocatedCollectedRevenue;
        }
      }
    }

    const memberRows = [...memberMetrics.values()].map((member) => {
      const fixedPay = this.fixedAmountForPeriod(
        rates,
        member.membershipId,
        from,
        to,
        'payRateAmount',
      );
      const fixedEmployerCost = this.fixedAmountForPeriod(
        rates,
        member.membershipId,
        from,
        to,
        'employerCostRateAmount',
      );
      const paid = fixedPay + member.hourlyPay;
      const employerCost = fixedEmployerCost + member.hourlyEmployerCost;
      const unallocatedCost =
        employerCost > member.allocatedEmployerCost
          ? employerCost - member.allocatedEmployerCost
          : 0n;
      return {
        membershipId: member.membershipId,
        fullName: member.fullName,
        approvedHours: this.hours(member.approvedMinutes),
        billableHours: this.hours(member.billableMinutes),
        billableRate: this.percentage(
          member.billableMinutes,
          member.approvedMinutes,
        ),
        budgetHours: this.hours(member.budgetMinutes),
        budgetConsumptionRate: this.percentage(
          member.approvedMinutes,
          member.budgetMinutes,
        ),
        payAmount: fromMillimes(paid),
        employerCost: fromMillimes(employerCost),
        allocatedClientCost: fromMillimes(member.allocatedEmployerCost),
        unallocatedEmployerCost: fromMillimes(unallocatedCost),
        allocatedBilledRevenue: fromMillimes(member.allocatedBilledRevenue),
        allocatedCollectedRevenue: fromMillimes(
          member.allocatedCollectedRevenue,
        ),
        contributionMarginBilled: fromMillimes(
          member.allocatedBilledRevenue - employerCost,
        ),
        contributionMarginCollected: fromMillimes(
          member.allocatedCollectedRevenue - employerCost,
        ),
        missingCostRate: member.missingCostRate,
      };
    });

    const dossierRows = [...dossierMetrics.values()].map((dossier) => ({
      dossierId: dossier.id,
      dossierName: dossier.name,
      approvedHours: this.hours(dossier.approvedMinutes),
      billableHours: this.hours(dossier.billableMinutes),
      billableRate: this.percentage(
        dossier.billableMinutes,
        dossier.approvedMinutes,
      ),
      budgetHours: this.hours(dossier.budgetMinutes),
      budgetConsumptionRate: this.percentage(
        dossier.approvedMinutes,
        dossier.budgetMinutes,
      ),
      allocatedPay: fromMillimes(dossier.allocatedPay),
      allocatedEmployerCost: fromMillimes(dossier.employerCost),
      billedRevenueNet: fromMillimes(dossier.billedRevenue),
      collectedRevenueNet: fromMillimes(dossier.collectedRevenue),
      marginOnBilled: fromMillimes(
        dossier.billedRevenue - dossier.employerCost,
      ),
      marginOnCollected: fromMillimes(
        dossier.collectedRevenue - dossier.employerCost,
      ),
      marginRateOnBilled: this.moneyPercentage(
        dossier.billedRevenue - dossier.employerCost,
        dossier.billedRevenue,
      ),
      missingCostRateCount: dossier.missingCostMembershipIds.size,
      workers: [...dossier.workers.values()].map((worker) => ({
        membershipId: worker.membershipId,
        fullName: worker.fullName,
        approvedHours: this.hours(worker.approvedMinutes),
        billableHours: this.hours(worker.billableMinutes),
        budgetHours: this.hours(worker.budgetMinutes),
        allocatedPay: fromMillimes(worker.allocatedPay),
        allocatedEmployerCost: fromMillimes(worker.employerCost),
        allocatedBilledRevenue: fromMillimes(worker.allocatedBilledRevenue),
        marginOnBilled: fromMillimes(
          worker.allocatedBilledRevenue - worker.employerCost,
        ),
      })),
    }));

    const billed = [...dossierMetrics.values()].reduce(
      (total, item) => total + item.billedRevenue,
      0n,
    );
    const collected = [...dossierMetrics.values()].reduce(
      (total, item) => total + item.collectedRevenue,
      0n,
    );
    const allocatedCost = [...dossierMetrics.values()].reduce(
      (total, item) => total + item.employerCost,
      0n,
    );
    return {
      period: { from, to, monthsTouched: months },
      basis: {
        revenue: 'Honoraires nets hors TVA émis et encaissés sur la période',
        cost: 'Coût employeur standard affecté selon les temps approuvés',
        warning:
          'Ces indicateurs aident au pilotage et ne doivent pas être utilisés seuls pour évaluer une personne.',
      },
      totals: {
        approvedHours: this.hours(
          dossierRows.reduce(
            (total, dossier) => total + Number(dossier.approvedHours) * 60,
            0,
          ),
        ),
        billedRevenueNet: fromMillimes(billed),
        collectedRevenueNet: fromMillimes(collected),
        allocatedEmployerCost: fromMillimes(allocatedCost),
        marginOnBilled: fromMillimes(billed - allocatedCost),
        marginOnCollected: fromMillimes(collected - allocatedCost),
      },
      dossiers: dossierRows,
      members: memberRows,
    };
  }

  private lane(
    key: string,
    title: string,
    description: string,
    severity: CockpitSeverity,
    actionLabel: string,
    actionPath: string,
    rows: any[],
    map: (row: any) => CockpitItem,
  ): CockpitLane {
    return {
      key,
      title,
      description,
      severity,
      count: this.count(rows),
      actionLabel,
      actionPath,
      items: rows.map(map),
    };
  }

  private count(rows: any[]) {
    return Number(rows[0]?.total ?? 0);
  }

  private async getActor(organizationId: string, userId: string) {
    const membership = await this.memberships.findOne({
      where: { organizationId, userId, isActive: true },
      relations: { user: true, role: { rolePermissions: true } },
    });
    if (!membership)
      throw new ForbiddenException("Vous n'appartenez pas à ce cabinet.");
    return {
      membership,
      permissions: new Set(
        membership.role.rolePermissions.map((item) => item.permissionName),
      ),
    };
  }

  private async getOwnedEntry(
    organizationId: string,
    dossierId: string,
    entryId: string,
    membershipId: string,
  ) {
    const entry = await this.timeEntries.findOne({
      where: { id: entryId, organizationId, dossierId, membershipId },
      relations: { membership: { user: true }, task: true },
    });
    if (!entry)
      throw new NotFoundException(
        'Le temps est introuvable ou appartient à un autre collaborateur.',
      );
    return entry;
  }

  private async findOpenSession(
    organizationId: string,
    membershipId: string,
  ) {
    return this.workSessions.findOne({
      where: {
        organizationId,
        membershipId,
        status: In([WorkSessionStatus.Active, WorkSessionStatus.Paused]),
      },
      relations: { dossier: true, task: true, membership: { user: true } },
      order: { startedAtUtc: 'DESC' },
    });
  }

  private async getOwnedOpenSession(
    organizationId: string,
    sessionId: string,
    membershipId: string,
  ) {
    const session = await this.workSessions.findOne({
      where: {
        id: sessionId,
        organizationId,
        membershipId,
        status: In([WorkSessionStatus.Active, WorkSessionStatus.Paused]),
      },
      relations: { dossier: true, task: true, membership: { user: true } },
    });
    if (!session)
      throw new NotFoundException(
        'La session de travail est introuvable ou déjà terminée.',
      );
    return session;
  }

  private async pauseIfStale(session: WorkSession) {
    const now = new Date();
    const elapsedSeconds = Math.max(
      0,
      Math.floor(
        (now.getTime() - session.lastHeartbeatAtUtc.getTime()) / 1_000,
      ),
    );
    if (
      session.status === WorkSessionStatus.Active &&
      elapsedSeconds > session.idleTimeoutSeconds
    ) {
      session.inactiveSeconds += elapsedSeconds;
      session.lastHeartbeatAtUtc = now;
      session.status = WorkSessionStatus.Paused;
      await this.workSessions.save(session);
    }
  }

  private accrueSession(
    session: WorkSession,
    now: Date,
    clientIsActive: boolean,
  ) {
    const elapsedSeconds = Math.max(
      0,
      Math.floor(
        (now.getTime() - session.lastHeartbeatAtUtc.getTime()) / 1_000,
      ),
    );
    const canAccrue =
      clientIsActive &&
      session.status === WorkSessionStatus.Active &&
      elapsedSeconds <= session.idleTimeoutSeconds;
    if (canAccrue) session.activeSeconds += elapsedSeconds;
    else session.inactiveSeconds += elapsedSeconds;
    session.lastHeartbeatAtUtc = now;
    session.heartbeatCount += 1;
    session.status = clientIsActive
      ? WorkSessionStatus.Active
      : WorkSessionStatus.Paused;
  }

  private async completeWorkSession(
    session: WorkSession,
    actorUserId: string,
    now: Date,
  ) {
    this.accrueSession(
      session,
      now,
      session.status === WorkSessionStatus.Active,
    );
    session.status = WorkSessionStatus.Completed;
    session.stoppedAtUtc = now;
    await this.workSessions.save(session);

    let entry: TimeEntry | null = null;
    if (session.activeSeconds >= 10) {
      const durationMinutes = Math.max(
        1,
        Math.min(1_440, Math.ceil(session.activeSeconds / 60)),
      );
      const workDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Tunis',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(session.startedAtUtc);
      await this.ensureDailyCapacity(
        session.organizationId,
        session.membershipId,
        workDate,
        durationMinutes,
      );
      const anomalyCode =
        durationMinutes > 480
          ? 'SESSION_LONGUE'
          : session.taskId
            ? null
            : 'SANS_TACHE';
      entry = await this.timeEntries.save(
        this.timeEntries.create({
          organizationId: session.organizationId,
          dossierId: session.dossierId,
          membershipId: session.membershipId,
          taskId: session.taskId,
          workDate,
          durationMinutes,
          source: TimeEntrySource.Automatic,
          sourceSessionId: session.id,
          startedAtUtc: session.startedAtUtc,
          stoppedAtUtc: now,
          originalDurationMinutes: null,
          correctionReason: null,
          requiresReview: Boolean(anomalyCode),
          anomalyCode,
          billable: session.billable,
          description: session.description,
          status: TimeEntryStatus.Draft,
          submittedAtUtc: null,
          reviewedAtUtc: null,
          reviewedByUserId: null,
          reviewComment: null,
          createdByUserId: actorUserId,
          membership: session.membership,
          task: session.task,
        }),
      );
    }

    await this.audit(
      session.organizationId,
      actorUserId,
      'work_session.completed',
      'WorkSession',
      session.id,
      {
        dossierId: session.dossierId,
        taskId: session.taskId,
        activeSeconds: session.activeSeconds,
        inactiveSeconds: session.inactiveSeconds,
        timeEntryId: entry?.id ?? null,
      },
    );
    return entry;
  }

  private async ensureTask(
    organizationId: string,
    dossierId: string,
    taskId?: string | null,
  ) {
    if (!taskId) return;
    const task = await this.tasks.findOneBy({
      id: taskId,
      organizationId,
      dossierId,
    });
    if (!task) throw new NotFoundException('La tâche liée est introuvable.');
  }

  private async ensureDailyCapacity(
    organizationId: string,
    membershipId: string,
    workDate: string,
    durationMinutes: number,
    excludedId?: string,
  ) {
    const builder = this.timeEntries
      .createQueryBuilder('entry')
      .select('COALESCE(SUM(entry.duration_minutes),0)', 'total')
      .where('entry.organization_id = :organizationId', { organizationId })
      .andWhere('entry.membership_id = :membershipId', { membershipId })
      .andWhere('entry.work_date = :workDate', { workDate });
    if (excludedId) builder.andWhere('entry.id <> :excludedId', { excludedId });
    const row = await builder.getRawOne<{ total: string }>();
    if (Number(row?.total ?? 0) + durationMinutes > 1_440)
      throw new BadRequestException(
        'Le total des temps ne peut pas dépasser 24 heures pour une journée.',
      );
  }

  private resolveRange(from?: string, to?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const resolvedTo = to ?? today;
    const resolvedFrom = from ?? `${resolvedTo.slice(0, 7)}-01`;
    if (resolvedFrom > resolvedTo)
      throw new BadRequestException('La période demandée est invalide.');
    const days =
      Math.round(
        (Date.parse(`${resolvedTo}T00:00:00Z`) -
          Date.parse(`${resolvedFrom}T00:00:00Z`)) /
          86_400_000,
      ) + 1;
    if (!Number.isFinite(days) || days < 1 || days > 366)
      throw new BadRequestException(
        'La période doit contenir entre 1 et 366 jours.',
      );
    return { from: resolvedFrom, to: resolvedTo };
  }

  private ensureWorkDate(workDate: string) {
    if (workDate > new Date().toISOString().slice(0, 10))
      throw new BadRequestException(
        'Un temps de travail réel ne peut pas être saisi dans le futur.',
      );
  }

  private description(value: string) {
    const result = value.trim();
    if (!result)
      throw new BadRequestException('La description est obligatoire.');
    return result;
  }

  private toTimeEntry(entry: TimeEntry) {
    return {
      id: entry.id,
      dossierId: entry.dossierId,
      membershipId: entry.membershipId,
      fullName: entry.membership?.user?.fullName ?? null,
      taskId: entry.taskId,
      taskTitle: entry.task?.title ?? null,
      workDate: entry.workDate,
      durationMinutes: entry.durationMinutes,
      durationHours: this.hours(entry.durationMinutes),
      source: entry.source,
      sourceSessionId: entry.sourceSessionId,
      startedAtUtc: entry.startedAtUtc,
      stoppedAtUtc: entry.stoppedAtUtc,
      originalDurationMinutes: entry.originalDurationMinutes,
      correctionReason: entry.correctionReason,
      requiresReview: entry.requiresReview,
      anomalyCode: entry.anomalyCode,
      billable: entry.billable,
      description: entry.description,
      status: entry.status,
      submittedAtUtc: entry.submittedAtUtc,
      reviewedAtUtc: entry.reviewedAtUtc,
      reviewedByUserId: entry.reviewedByUserId,
      reviewComment: entry.reviewComment,
    };
  }

  private toWorkSession(session: WorkSession) {
    return {
      id: session.id,
      organizationId: session.organizationId,
      dossierId: session.dossierId,
      dossierName: session.dossier?.legalName ?? null,
      membershipId: session.membershipId,
      fullName: session.membership?.user?.fullName ?? null,
      taskId: session.taskId,
      taskTitle: session.task?.title ?? null,
      description: session.description,
      billable: session.billable,
      status: session.status,
      startedAtUtc: session.startedAtUtc,
      lastHeartbeatAtUtc: session.lastHeartbeatAtUtc,
      stoppedAtUtc: session.stoppedAtUtc,
      activeSeconds: session.activeSeconds,
      inactiveSeconds: session.inactiveSeconds,
      heartbeatCount: session.heartbeatCount,
      idleTimeoutSeconds: session.idleTimeoutSeconds,
    };
  }

  private toCostRate(rate: CabinetMemberCostRate) {
    return {
      id: rate.id,
      membershipId: rate.membershipId,
      fullName: rate.membership.user.fullName,
      compensationType: rate.compensationType,
      payRateAmount: rate.payRateAmount,
      employerCostRateAmount: rate.employerCostRateAmount,
      monthlyTargetMinutes: rate.monthlyTargetMinutes,
      monthlyTargetHours: this.hours(rate.monthlyTargetMinutes),
      effectiveFrom: rate.effectiveFrom,
      effectiveTo: rate.effectiveTo,
    };
  }

  private async accessibleDossiers(
    organizationId: string,
    membershipId: string,
    canSeeAll: boolean,
  ) {
    const builder = this.dossierRepository
      .createQueryBuilder('dossier')
      .where('dossier.organization_id = :organizationId', { organizationId });
    if (!canSeeAll) {
      builder.innerJoin(
        'dossier.assignments',
        'assignment',
        'assignment.membership_id = :membershipId AND assignment.is_active = true',
        { membershipId },
      );
    }
    return builder.orderBy('dossier.legal_name', 'ASC').getMany();
  }

  private rateAt(
    rates: CabinetMemberCostRate[],
    membershipId: string,
    date: string,
  ) {
    return [...rates]
      .reverse()
      .find(
        (rate) =>
          rate.membershipId === membershipId &&
          rate.effectiveFrom <= date &&
          (!rate.effectiveTo || rate.effectiveTo >= date),
      );
  }

  private amountForMinutes(
    rate: CabinetMemberCostRate,
    amount: string,
    minutes: number,
  ) {
    return this.prorate(
      toMillimes(amount),
      minutes,
      rate.compensationType === MemberCompensationType.Hourly
        ? 60
        : rate.monthlyTargetMinutes,
    );
  }

  private fixedAmountForPeriod(
    rates: CabinetMemberCostRate[],
    membershipId: string,
    from: string,
    to: string,
    field: 'payRateAmount' | 'employerCostRateAmount',
  ) {
    let total = 0n;
    for (
      let current = new Date(`${from}T00:00:00Z`);
      current <= new Date(`${to}T00:00:00Z`);
      current = new Date(current.getTime() + 86_400_000)
    ) {
      const date = current.toISOString().slice(0, 10);
      const rate = this.rateAt(rates, membershipId, date);
      if (!rate || rate.compensationType !== MemberCompensationType.Monthly)
        continue;
      const daysInMonth = new Date(
        Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0),
      ).getUTCDate();
      total += this.prorate(toMillimes(rate[field]), 1, daysInMonth);
    }
    return total;
  }

  private getDossierWorker(
    dossier: DossierMetric,
    membershipId: string,
    fullName: string,
  ) {
    let worker = dossier.workers.get(membershipId);
    if (!worker) {
      worker = {
        membershipId,
        fullName,
        approvedMinutes: 0,
        billableMinutes: 0,
        budgetMinutes: 0,
        allocatedPay: 0n,
        employerCost: 0n,
        allocatedBilledRevenue: 0n,
        allocatedCollectedRevenue: 0n,
      };
      dossier.workers.set(membershipId, worker);
    }
    return worker;
  }

  private prorate(amount: bigint, numerator: number, denominator: number) {
    if (!denominator || !numerator) return 0n;
    const n = BigInt(numerator);
    const d = BigInt(denominator);
    return (amount * n + d / 2n) / d;
  }

  private hours(minutes: number) {
    return (minutes / 60).toFixed(2);
  }

  private percentage(numerator: number, denominator: number) {
    if (!denominator) return '0.00';
    return ((numerator / denominator) * 100).toFixed(2);
  }

  private moneyPercentage(numerator: bigint, denominator: bigint) {
    if (!denominator) return '0.00';
    return (Number((numerator * 10_000n) / denominator) / 100).toFixed(2);
  }

  private monthsTouched(from: string, to: string) {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    return (
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() -
      start.getUTCMonth() +
      1
    );
  }

  private emptyProfitability(from: string, to: string, monthsTouched: number) {
    return {
      period: { from, to, monthsTouched },
      totals: {
        approvedHours: '0.00',
        billedRevenueNet: '0.000',
        collectedRevenueNet: '0.000',
        allocatedEmployerCost: '0.000',
        marginOnBilled: '0.000',
        marginOnCollected: '0.000',
      },
      dossiers: [],
      members: [],
    };
  }

  private async audit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    await this.dataSource.manager.save(
      this.dataSource.manager.create(AuditLog, {
        organizationId,
        actorUserId,
        action,
        entityType,
        entityId,
        detailsJson,
      }),
    );
  }
}
