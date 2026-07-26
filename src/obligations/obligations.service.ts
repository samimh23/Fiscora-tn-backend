import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLog,
  ClientDossier,
  DossierAssignment,
  DossierAssignmentRole,
  DossierStatus,
  ObligationFrequency,
  ObligationInstance,
  ObligationStatus,
  ObligationTemplate,
  TaskChecklistItem,
  WorkTask,
  WorkTaskPriority,
  WorkTaskStatus,
  WorkTaskType,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  CreateObligationTemplateDto,
  FileObligationDto,
  ObligationQueryDto,
  PayObligationDto,
  UpdateObligationProgressDto,
} from './dto';
import { buildObligationPeriods } from './obligation-calendar';

@Injectable()
export class ObligationsService {
  constructor(
    private readonly dossiersService: DossiersService,
    @InjectRepository(ObligationTemplate)
    private readonly templates: Repository<ObligationTemplate>,
    @InjectRepository(ObligationInstance)
    private readonly instances: Repository<ObligationInstance>,
    @InjectRepository(DossierAssignment)
    private readonly assignments: Repository<DossierAssignment>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(WorkTask)
    private readonly tasks: Repository<WorkTask>,
    @InjectRepository(TaskChecklistItem)
    private readonly checklistItems: Repository<TaskChecklistItem>,
  ) {}

  async getTemplates(organizationId: string) {
    const items = await this.templates
      .createQueryBuilder('template')
      .where(
        '(template.organization_id = :organizationId OR template.organization_id IS NULL)',
        { organizationId },
      )
      .andWhere('template.is_active = true')
      .orderBy('template.name', 'ASC')
      .addOrderBy('template.version', 'DESC')
      .getMany();
    return items.map((item) => this.toTemplate(item));
  }

  async createTemplate(
    organizationId: string,
    actorUserId: string,
    dto: CreateObligationTemplateDto,
  ) {
    if (dto.frequency === ObligationFrequency.Annual && !dto.annualDueMonth) {
      throw new BadRequestException(
        "Le mois d'échéance est obligatoire pour une obligation annuelle.",
      );
    }
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) {
      throw new BadRequestException(
        "La date de fin d'effet doit être postérieure à la date de début.",
      );
    }
    const latest = await this.templates.findOne({
      where: { organizationId, code: dto.code },
      order: { version: 'DESC' },
    });
    const template = await this.templates.save(
      this.templates.create({
        organizationId,
        code: dto.code,
        version: (latest?.version ?? 0) + 1,
        name: dto.name.trim(),
        description: this.clean(dto.description),
        frequency: dto.frequency,
        dueDay: dto.dueDay,
        dueMonthOffset: dto.dueMonthOffset,
        annualDueMonth: dto.annualDueMonth ?? null,
        physicalPersonDueDay: dto.physicalPersonDueDay ?? null,
        totallyExportingDueDay: dto.totallyExportingDueDay ?? null,
        applicability: {
          legalForms: dto.legalForms,
          taxRegimes: dto.taxRegimes,
          requiresVat: dto.requiresVat,
          requiresEmployees: dto.requiresEmployees,
        },
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
        sourceLabel: this.clean(dto.sourceLabel),
        sourceUrl: this.clean(dto.sourceUrl),
        isSystem: false,
        isActive: true,
        createdByUserId: actorUserId,
      }),
    );
    await this.addAudit(
      organizationId,
      actorUserId,
      'obligation_template.created',
      'ObligationTemplate',
      template.id,
      { code: template.code, version: template.version },
    );
    return this.toTemplate(template);
  }

  async generate(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    year: number,
  ) {
    const dossier = await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    if (dossier.status === DossierStatus.Archived) {
      throw new ConflictException(
        "Le calendrier d'un dossier archivé ne peut pas être régénéré.",
      );
    }
    const templates = await this.templates
      .createQueryBuilder('template')
      .where(
        '(template.organization_id = :organizationId OR template.organization_id IS NULL)',
        { organizationId },
      )
      .andWhere('template.is_active = true')
      .andWhere('template.effective_from <= :yearEnd', {
        yearEnd: `${year}-12-31`,
      })
      .andWhere(
        '(template.effective_to IS NULL OR template.effective_to >= :yearStart)',
        { yearStart: `${year}-01-01` },
      )
      .orderBy('template.version', 'DESC')
      .getMany();

    const latestByCode = new Map<string, ObligationTemplate>();
    for (const template of templates) {
      const current = latestByCode.get(template.code);
      const replacesSystem =
        current?.organizationId === null && template.organizationId !== null;
      const replacesOlderSameScope =
        current?.organizationId === template.organizationId &&
        template.version > current.version;
      if (!current || replacesSystem || replacesOlderSameScope) {
        latestByCode.set(template.code, template);
      }
    }
    const latestTemplates = [...latestByCode.values()];
    const responsible = await this.assignments.findOne({
      where: {
        organizationId,
        dossierId,
        assignmentRole: DossierAssignmentRole.Responsible,
        isActive: true,
      },
      order: { createdAtUtc: 'ASC' },
    });
    let created = 0;
    let existing = 0;
    let notApplicable = 0;
    for (const template of latestTemplates) {
      if (!this.appliesTo(template, dossier)) {
        notApplicable += this.periodCount(template.frequency);
        continue;
      }
      for (const period of buildObligationPeriods(template, dossier, year)) {
        const exists = await this.instances.existsBy({
          dossierId,
          templateId: template.id,
          periodStartsOn: period.periodStartsOn,
        });
        if (exists) {
          existing++;
          continue;
        }
        const instance = await this.instances.save(
          this.instances.create({
            organizationId,
            dossierId,
            templateId: template.id,
            ...period,
            status: ObligationStatus.NotStarted,
            assignedMembershipId: responsible?.membershipId ?? null,
            validatedAtUtc: null,
            validatedByUserId: null,
            filedAtUtc: null,
            filedByUserId: null,
            amountDue: null,
            amountPaid: null,
            paymentReference: null,
            notes: null,
            lastComment: null,
          }),
        );
        const task = await this.tasks.save(
          this.tasks.create({
            organizationId,
            dossierId,
            obligationId: instance.id,
            type: WorkTaskType.Obligation,
            title: `${template.name} — ${this.periodLabel(instance)}`,
            description:
              "Tâche créée automatiquement depuis l'obligation fiscale.",
            dueOn: instance.dueOn,
            priority: WorkTaskPriority.High,
            status: WorkTaskStatus.Todo,
            assigneeMembershipId: responsible?.membershipId ?? null,
            createdByUserId: actorUserId,
            completedAtUtc: null,
            completedByUserId: null,
            lastComment: null,
          }),
        );
        await this.checklistItems.save(
          [
            'Collecter les pièces nécessaires',
            'Préparer les données de la déclaration',
            'Contrôler les montants et justificatifs',
          ].map((label, position) =>
            this.checklistItems.create({
              organizationId,
              taskId: task.id,
              label,
              position,
              isCompleted: false,
              completedAtUtc: null,
              completedByUserId: null,
            }),
          ),
        );
        created++;
      }
    }
    await this.addAudit(
      organizationId,
      actorUserId,
      'obligations.generated',
      'ClientDossier',
      dossierId,
      { year, created, existing, notApplicable },
    );
    return { year, created, existing, notApplicable };
  }

  async getInstances(
    organizationId: string,
    dossierId: string,
    userId: string,
    query: ObligationQueryDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const builder = this.instances
      .createQueryBuilder('instance')
      .innerJoinAndSelect('instance.template', 'template')
      .where('instance.organization_id = :organizationId', { organizationId })
      .andWhere('instance.dossier_id = :dossierId', { dossierId });
    if (query.year) {
      builder.andWhere('instance.period_year = :year', { year: query.year });
    }
    if (query.month) {
      builder.andWhere('instance.period_month = :month', {
        month: query.month,
      });
    }
    if (query.status) {
      builder.andWhere('instance.status = :status', { status: query.status });
    }
    const items = await builder
      .orderBy('instance.dueOn', 'ASC')
      .addOrderBy('template.name', 'ASC')
      .getMany();
    return items.map((item) => this.toInstance(item));
  }

  async updateProgress(
    organizationId: string,
    dossierId: string,
    obligationId: string,
    actorUserId: string,
    dto: UpdateObligationProgressDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const instance = await this.getInstance(
      organizationId,
      dossierId,
      obligationId,
    );
    const allowed =
      (dto.status === ObligationStatus.InProgress &&
        [ObligationStatus.NotStarted, ObligationStatus.InProgress].includes(
          instance.status,
        )) ||
      (dto.status === ObligationStatus.ReadyForReview &&
        instance.status === ObligationStatus.InProgress);
    if (!allowed) {
      throw new ConflictException(
        `Transition interdite de ${instance.status} vers ${dto.status}.`,
      );
    }
    instance.status = dto.status;
    instance.lastComment = this.clean(dto.comment);
    await this.instances.save(instance);
    await this.tasks.update(
      { obligationId: instance.id },
      {
        status:
          dto.status === ObligationStatus.ReadyForReview
            ? WorkTaskStatus.ReadyForReview
            : WorkTaskStatus.InProgress,
        lastComment: this.clean(dto.comment),
      },
    );
    await this.auditStatus(instance, actorUserId, 'obligation.progressed');
    return this.toInstance(instance);
  }

  async validate(
    organizationId: string,
    dossierId: string,
    obligationId: string,
    actorUserId: string,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const instance = await this.getInstance(
      organizationId,
      dossierId,
      obligationId,
    );
    this.requireStatus(instance, ObligationStatus.ReadyForReview);
    instance.status = ObligationStatus.Validated;
    instance.validatedAtUtc = new Date();
    instance.validatedByUserId = actorUserId;
    await this.instances.save(instance);
    await this.tasks.update(
      { obligationId: instance.id },
      {
        status: WorkTaskStatus.Completed,
        completedAtUtc: new Date(),
        completedByUserId: actorUserId,
      },
    );
    await this.auditStatus(instance, actorUserId, 'obligation.validated');
    return this.toInstance(instance);
  }

  async reject(
    organizationId: string,
    dossierId: string,
    obligationId: string,
    actorUserId: string,
    comment: string,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const instance = await this.getInstance(
      organizationId,
      dossierId,
      obligationId,
    );
    this.requireStatus(instance, ObligationStatus.ReadyForReview);
    instance.status = ObligationStatus.InProgress;
    instance.lastComment = comment.trim();
    await this.instances.save(instance);
    await this.tasks.update(
      { obligationId: instance.id },
      {
        status: WorkTaskStatus.InProgress,
        lastComment: comment.trim(),
        completedAtUtc: null,
        completedByUserId: null,
      },
    );
    await this.auditStatus(instance, actorUserId, 'obligation.rejected');
    return this.toInstance(instance);
  }

  async file(
    organizationId: string,
    dossierId: string,
    obligationId: string,
    actorUserId: string,
    dto: FileObligationDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const instance = await this.getInstance(
      organizationId,
      dossierId,
      obligationId,
    );
    this.requireStatus(instance, ObligationStatus.Validated);
    instance.status = ObligationStatus.Filed;
    instance.filedAtUtc = dto.filedAtUtc
      ? new Date(dto.filedAtUtc)
      : new Date();
    instance.filedByUserId = actorUserId;
    instance.amountDue = dto.amountDue ?? instance.amountDue;
    instance.notes = this.clean(dto.notes) ?? instance.notes;
    await this.instances.save(instance);
    await this.auditStatus(instance, actorUserId, 'obligation.filed');
    return this.toInstance(instance);
  }

  async pay(
    organizationId: string,
    dossierId: string,
    obligationId: string,
    actorUserId: string,
    dto: PayObligationDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const instance = await this.getInstance(
      organizationId,
      dossierId,
      obligationId,
    );
    if (
      ![ObligationStatus.Filed, ObligationStatus.Paid].includes(instance.status)
    ) {
      throw new ConflictException(
        "L'obligation doit être déposée avant d'enregistrer son paiement.",
      );
    }
    instance.status = ObligationStatus.Paid;
    instance.amountPaid = dto.amountPaid;
    instance.paymentReference = this.clean(dto.paymentReference);
    await this.instances.save(instance);
    await this.auditStatus(instance, actorUserId, 'obligation.paid');
    return this.toInstance(instance);
  }

  private appliesTo(template: ObligationTemplate, dossier: ClientDossier) {
    const rule = template.applicability ?? {};
    if (rule.legalForms?.length && !rule.legalForms.includes(dossier.legalForm))
      return false;
    if (rule.taxRegimes?.length && !rule.taxRegimes.includes(dossier.taxRegime))
      return false;
    if (rule.requiresVat === true && !dossier.isVatSubject) return false;
    if (rule.requiresEmployees === true && dossier.employeeCount <= 0)
      return false;
    return true;
  }

  private async getInstance(
    organizationId: string,
    dossierId: string,
    obligationId: string,
  ) {
    const instance = await this.instances.findOne({
      where: { id: obligationId, organizationId, dossierId },
      relations: { template: true },
    });
    if (!instance) throw new NotFoundException("L'obligation est introuvable.");
    return instance;
  }

  private requireStatus(
    instance: ObligationInstance,
    expected: ObligationStatus,
  ) {
    if (instance.status !== expected) {
      throw new ConflictException(
        `L'obligation doit être au statut ${expected}.`,
      );
    }
  }

  private toTemplate(item: ObligationTemplate) {
    return {
      id: item.id,
      organizationId: item.organizationId,
      code: item.code,
      version: item.version,
      name: item.name,
      description: item.description,
      frequency: item.frequency,
      dueDay: item.dueDay,
      dueMonthOffset: item.dueMonthOffset,
      annualDueMonth: item.annualDueMonth,
      physicalPersonDueDay: item.physicalPersonDueDay,
      totallyExportingDueDay: item.totallyExportingDueDay,
      applicability: item.applicability,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      isSystem: item.isSystem,
    };
  }

  private toInstance(item: ObligationInstance) {
    const today = new Date().toISOString().slice(0, 10);
    const completed = [ObligationStatus.Filed, ObligationStatus.Paid].includes(
      item.status,
    );
    return {
      id: item.id,
      templateId: item.templateId,
      code: item.template.code,
      name: item.template.name,
      frequency: item.template.frequency,
      periodYear: item.periodYear,
      periodMonth: item.periodMonth,
      periodQuarter: item.periodQuarter,
      periodStartsOn: item.periodStartsOn,
      periodEndsOn: item.periodEndsOn,
      dueOn: item.dueOn,
      status: item.status,
      isLate: item.dueOn < today && !completed,
      assignedMembershipId: item.assignedMembershipId,
      validatedAtUtc: item.validatedAtUtc,
      filedAtUtc: item.filedAtUtc,
      amountDue: item.amountDue,
      amountPaid: item.amountPaid,
      paymentReference: item.paymentReference,
      notes: item.notes,
      lastComment: item.lastComment,
      sourceLabel: item.template.sourceLabel,
      sourceUrl: item.template.sourceUrl,
    };
  }

  private periodCount(frequency: ObligationFrequency) {
    if (frequency === ObligationFrequency.Monthly) return 12;
    if (frequency === ObligationFrequency.Quarterly) return 4;
    return 1;
  }

  private periodLabel(instance: ObligationInstance) {
    if (instance.periodMonth)
      return `${instance.periodMonth.toString().padStart(2, '0')}/${instance.periodYear}`;
    if (instance.periodQuarter)
      return `T${instance.periodQuarter}/${instance.periodYear}`;
    return `${instance.periodYear}`;
  }

  private clean(value?: string | null) {
    return value?.trim() || null;
  }

  private async auditStatus(
    instance: ObligationInstance,
    actorUserId: string,
    action: string,
  ) {
    await this.addAudit(
      instance.organizationId,
      actorUserId,
      action,
      'ObligationInstance',
      instance.id,
      { dossierId: instance.dossierId, status: instance.status },
    );
  }

  private async addAudit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    await this.auditLogs.save(
      this.auditLogs.create({
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
