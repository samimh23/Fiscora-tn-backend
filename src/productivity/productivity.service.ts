import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { fromMillimes, toMillimes } from '../common/money';
import {
  AuditLog,
  CabinetMemberCostRate,
  ClientDossier,
  DossierAssignment,
  MemberCompensationType,
  OrganizationMembership,
  TimeEntry,
  TimeEntryStatus,
  WorkTask,
} from '../database/entities';
import { PermissionNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  CreateMemberCostRateDto,
  CreateTimeEntryDto,
  ProfitabilityQueryDto,
  ReviewTimeEntryDto,
  TimeEntryQueryDto,
  TimeEntryReviewDecision,
  UpdateTimeEntryDto,
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

@Injectable()
export class ProductivityService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CabinetMemberCostRate)
    private readonly costRates: Repository<CabinetMemberCostRate>,
    @InjectRepository(TimeEntry)
    private readonly timeEntries: Repository<TimeEntry>,
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
    dto: UpdateTimeEntryDto,
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
      billable: entry.billable,
      description: entry.description,
      status: entry.status,
      submittedAtUtc: entry.submittedAtUtc,
      reviewedAtUtc: entry.reviewedAtUtc,
      reviewedByUserId: entry.reviewedByUserId,
      reviewComment: entry.reviewComment,
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
