import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLog,
  DossierAssignment,
  DossierAssignmentRole,
  OrganizationMembership,
  TaskChecklistItem,
  TaskComment,
  WorkTask,
  WorkTaskStatus,
  WorkTaskType,
} from '../database/entities';
import { SystemRoleNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FiscalWorkflowService } from '../workflow/fiscal-workflow.service';
import { canAccessAllTasks } from './task-access';
import {
  CreateTaskDto,
  TaskQueryDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
  UpdateTaskProgressDto,
} from './dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly dossiersService: DossiersService,
    @InjectRepository(WorkTask)
    private readonly tasks: Repository<WorkTask>,
    @InjectRepository(TaskChecklistItem)
    private readonly checklistItems: Repository<TaskChecklistItem>,
    @InjectRepository(TaskComment)
    private readonly comments: Repository<TaskComment>,
    @InjectRepository(DossierAssignment)
    private readonly assignments: Repository<DossierAssignment>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    private readonly notifications: NotificationsService,
    private readonly workflow: FiscalWorkflowService,
  ) {}

  async listCabinet(
    organizationId: string,
    userId: string,
    query: TaskQueryDto,
  ) {
    const access = await this.getAccess(organizationId, userId);
    const builder = this.baseQuery(organizationId);
    if (!access.canSeeAll) {
      builder
        .innerJoin(
          DossierAssignment,
          'access_assignment',
          'access_assignment.dossier_id = task.dossier_id AND access_assignment.membership_id = :membershipId AND access_assignment.is_active = true',
          { membershipId: access.membership.id },
        )
        .distinct(true)
        .andWhere('task.assignee_membership_id = :visibleMembershipId', {
          visibleMembershipId: access.membership.id,
        });
    }
    return this.executeList(builder, query);
  }

  async listDossier(
    organizationId: string,
    dossierId: string,
    userId: string,
    query: TaskQueryDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const access = await this.getAccess(organizationId, userId);
    const builder = this.baseQuery(organizationId).andWhere(
      'task.dossier_id = :dossierId',
      { dossierId },
    );
    if (!access.canSeeAll) {
      builder.andWhere('task.assignee_membership_id = :visibleMembershipId', {
        visibleMembershipId: access.membership.id,
      });
    }
    return this.executeList(builder, query);
  }

  async create(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    dto: CreateTaskDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const access = await this.getAccess(organizationId, actorUserId);
    const responsible = await this.assignments.findOne({
      where: {
        organizationId,
        dossierId,
        assignmentRole: DossierAssignmentRole.Responsible,
        isActive: true,
      },
      order: { createdAtUtc: 'ASC' },
    });
    const task = await this.tasks.save(
      this.tasks.create({
        organizationId,
        dossierId,
        obligationId: null,
        type: WorkTaskType.Manual,
        title: dto.title.trim(),
        description: this.clean(dto.description),
        dueOn: dto.dueOn,
        priority: dto.priority,
        status: WorkTaskStatus.Todo,
        assigneeMembershipId: access.canSeeAll
          ? (responsible?.membershipId ?? null)
          : access.membership.id,
        createdByUserId: actorUserId,
        completedAtUtc: null,
        completedByUserId: null,
        lastComment: null,
      }),
    );
    if (dto.checklist?.length) {
      await this.checklistItems.save(
        dto.checklist
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label, position) =>
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
    }
    await this.addAudit(organizationId, actorUserId, 'task.created', task.id, {
      dossierId,
      title: task.title,
      type: task.type,
    });
    return this.getTask(organizationId, dossierId, task.id);
  }

  async update(
    organizationId: string,
    dossierId: string,
    taskId: string,
    actorUserId: string,
    dto: UpdateTaskDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    const task = await this.ensureTaskAccess(
      organizationId,
      dossierId,
      taskId,
      actorUserId,
    );
    this.ensureEditable(task);
    if (dto.title !== undefined) task.title = dto.title.trim();
    if (dto.description !== undefined) {
      task.description = this.clean(dto.description);
    }
    if (dto.dueOn !== undefined) task.dueOn = dto.dueOn;
    if (dto.priority !== undefined) task.priority = dto.priority;
    await this.tasks.save(task);
    await this.addAudit(organizationId, actorUserId, 'task.updated', task.id, {
      dossierId,
      title: task.title,
    });
    return this.getTask(organizationId, dossierId, task.id);
  }

  async progress(
    organizationId: string,
    dossierId: string,
    taskId: string,
    actorUserId: string,
    dto: UpdateTaskProgressDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    await this.ensureTaskAccess(organizationId, dossierId, taskId, actorUserId);
    await this.workflow.transitionTask(
      { organizationId, dossierId, actorUserId },
      taskId,
      dto.status,
      'progress',
      this.clean(dto.comment),
    );
    const task = await this.getTaskEntity(organizationId, dossierId, taskId);
    if (dto.status === WorkTaskStatus.ReadyForReview) {
      await this.notifyOwners(
        organizationId,
        task,
        'Tâche prête pour révision',
        `La tâche « ${task.title} » attend votre validation.`,
        'TASK_READY_FOR_REVIEW',
      );
    }
    await this.addAudit(
      organizationId,
      actorUserId,
      'task.progressed',
      task.id,
      { dossierId, status: task.status },
    );
    return this.getTask(organizationId, dossierId, task.id);
  }

  async complete(
    organizationId: string,
    dossierId: string,
    taskId: string,
    actorUserId: string,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    await this.ensureTaskAccess(organizationId, dossierId, taskId, actorUserId);
    await this.workflow.transitionTask(
      { organizationId, dossierId, actorUserId },
      taskId,
      WorkTaskStatus.Completed,
      'validate',
    );
    await this.addAudit(organizationId, actorUserId, 'task.completed', taskId, {
      dossierId,
    });
    return this.getTask(organizationId, dossierId, taskId);
  }

  async reject(
    organizationId: string,
    dossierId: string,
    taskId: string,
    actorUserId: string,
    comment: string,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    await this.ensureTaskAccess(organizationId, dossierId, taskId, actorUserId);
    await this.workflow.transitionTask(
      { organizationId, dossierId, actorUserId },
      taskId,
      WorkTaskStatus.InProgress,
      'reject',
      comment.trim(),
    );
    const task = await this.getTaskEntity(organizationId, dossierId, taskId);
    if (task.assigneeMembershipId) {
      const assignee = await this.memberships.findOneBy({
        id: task.assigneeMembershipId,
        organizationId,
      });
      if (assignee) {
        await this.notifications.createForUser({
          organizationId,
          recipientUserId: assignee.userId,
          type: 'TASK_REJECTED',
          title: 'Révision refusée',
          body: `La tâche « ${task.title} » a été renvoyée : ${comment.trim()}`,
          entityType: 'WorkTask',
          entityId: task.id,
          deduplicationKey: `task:${task.id}:rejected:${Date.now()}`,
        });
      }
    }
    await this.addComment(
      organizationId,
      dossierId,
      taskId,
      actorUserId,
      `Révision refusée : ${comment.trim()}`,
    );
    await this.addAudit(organizationId, actorUserId, 'task.rejected', task.id, {
      dossierId,
      comment: comment.trim(),
    });
    return this.getTask(organizationId, dossierId, task.id);
  }

  async assign(
    organizationId: string,
    dossierId: string,
    taskId: string,
    membershipId: string,
    actorUserId: string,
  ) {
    const task = await this.getTaskEntity(organizationId, dossierId, taskId);
    this.ensureEditable(task);
    const membership = await this.memberships.findOne({
      where: { id: membershipId, organizationId, isActive: true },
      relations: { role: true },
    });
    if (!membership) {
      throw new NotFoundException(
        'Le collaborateur actif est introuvable dans ce cabinet.',
      );
    }
    const assignment = await this.assignments.findOneBy({
      organizationId,
      dossierId,
      membershipId,
      isActive: true,
    });
    if (!assignment) {
      throw new ConflictException(
        "Le collaborateur doit d'abord être affecté au dossier.",
      );
    }
    if (
      membership.role?.name.trim().toLowerCase() ===
        SystemRoleNames.ClientPortal.toLowerCase() ||
      assignment.assignmentRole === DossierAssignmentRole.Client
    ) {
      throw new ForbiddenException(
        'Les comptes portail client ne peuvent pas recevoir de tâches internes.',
      );
    }
    task.assigneeMembershipId = membershipId;
    await this.tasks.save(task);
    await this.notifications.createForUser({
      organizationId,
      recipientUserId: membership.userId,
      type: 'TASK_ASSIGNED',
      title: 'Nouvelle tâche affectée',
      body: `La tâche « ${task.title} » vous a été affectée.`,
      entityType: 'WorkTask',
      entityId: task.id,
      deduplicationKey: `task:${task.id}:assigned:${membershipId}:${Date.now()}`,
    });
    await this.addAudit(organizationId, actorUserId, 'task.assigned', task.id, {
      dossierId,
      membershipId,
    });
    return this.getTask(organizationId, dossierId, task.id);
  }

  async addChecklistItem(
    organizationId: string,
    dossierId: string,
    taskId: string,
    actorUserId: string,
    label: string,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    await this.ensureTaskAccess(organizationId, dossierId, taskId, actorUserId);
    const item = await this.workflow.editChecklist(
      { organizationId, dossierId, actorUserId },
      taskId,
      async (manager) => {
        const checklist = manager.getRepository(TaskChecklistItem);
        const position = await checklist.count({ where: { taskId } });
        return checklist.save(
          checklist.create({
            organizationId,
            taskId,
            label: label.trim(),
            position,
            isCompleted: false,
            completedAtUtc: null,
            completedByUserId: null,
          }),
        );
      },
    );
    return this.toChecklistItem(item);
  }

  async updateChecklistItem(
    organizationId: string,
    dossierId: string,
    taskId: string,
    itemId: string,
    actorUserId: string,
    dto: UpdateChecklistItemDto,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    await this.ensureTaskAccess(organizationId, dossierId, taskId, actorUserId);
    const item = await this.workflow.editChecklist(
      { organizationId, dossierId, actorUserId },
      taskId,
      async (manager) => {
        const checklist = manager.getRepository(TaskChecklistItem);
        const item = await checklist.findOneBy({
          id: itemId,
          organizationId,
          taskId,
        });
        if (!item)
          throw new NotFoundException(
            "L'élément de checklist est introuvable.",
          );
        if (dto.label !== undefined) item.label = dto.label.trim();
        if (dto.isCompleted !== undefined) {
          item.isCompleted = dto.isCompleted;
          item.completedAtUtc = dto.isCompleted ? new Date() : null;
          item.completedByUserId = dto.isCompleted ? actorUserId : null;
        }
        return checklist.save(item);
      },
    );
    return this.toChecklistItem(item);
  }

  async getComments(
    organizationId: string,
    dossierId: string,
    taskId: string,
    userId: string,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    await this.ensureTaskAccess(organizationId, dossierId, taskId, userId);
    const comments = await this.comments.find({
      where: { organizationId, taskId },
      relations: { author: true },
      order: { createdAtUtc: 'ASC' },
    });
    return comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorUserId: comment.authorUserId,
      authorName: comment.author.fullName,
      createdAtUtc: comment.createdAtUtc,
    }));
  }

  async addComment(
    organizationId: string,
    dossierId: string,
    taskId: string,
    actorUserId: string,
    body: string,
  ) {
    await this.dossiersService.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    await this.ensureTaskAccess(organizationId, dossierId, taskId, actorUserId);
    const comment = await this.comments.save(
      this.comments.create({
        organizationId,
        taskId,
        authorUserId: actorUserId,
        body: body.trim(),
      }),
    );
    return {
      id: comment.id,
      body: comment.body,
      authorUserId: comment.authorUserId,
      createdAtUtc: comment.createdAtUtc,
    };
  }

  private baseQuery(organizationId: string) {
    return this.tasks
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.dossier', 'dossier')
      .leftJoinAndSelect('task.assigneeMembership', 'assignee')
      .leftJoinAndSelect('assignee.user', 'assigneeUser')
      .leftJoinAndSelect('task.checklistItems', 'checklist')
      .where('task.organization_id = :organizationId', { organizationId });
  }

  private async executeList(
    builder: ReturnType<TasksService['baseQuery']>,
    query: TaskQueryDto,
  ) {
    if (query.status)
      builder.andWhere('task.status = :status', { status: query.status });
    if (query.priority) {
      builder.andWhere('task.priority = :priority', {
        priority: query.priority,
      });
    }
    if (query.assigneeMembershipId) {
      builder.andWhere('task.assignee_membership_id = :assigneeMembershipId', {
        assigneeMembershipId: query.assigneeMembershipId,
      });
    }
    if (query.dueFrom)
      builder.andWhere('task.due_on >= :dueFrom', { dueFrom: query.dueFrom });
    if (query.dueTo)
      builder.andWhere('task.due_on <= :dueTo', { dueTo: query.dueTo });
    if (query.overdue) {
      builder
        .andWhere('task.due_on < :today', {
          today: new Date().toISOString().slice(0, 10),
        })
        .andWhere('task.status NOT IN (:...finished)', {
          finished: [WorkTaskStatus.Completed, WorkTaskStatus.Cancelled],
        });
    }
    const [items, total] = await builder
      .orderBy('task.dueOn', 'ASC')
      .addOrderBy('task.priority', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return {
      items: items.map((task) => this.toTask(task)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async getAccess(organizationId: string, userId: string) {
    const membership = await this.memberships.findOne({
      where: { organizationId, userId, isActive: true },
      relations: { role: { rolePermissions: true } },
    });
    if (!membership)
      throw new ForbiddenException("Vous n'appartenez pas à ce cabinet.");
    return {
      membership,
      canSeeAll: canAccessAllTasks(
        new Set(
          membership.role.rolePermissions.map((item) => item.permissionName),
        ),
      ),
    };
  }

  private async getTask(
    organizationId: string,
    dossierId: string,
    taskId: string,
  ) {
    const task = await this.tasks.findOne({
      where: { id: taskId, organizationId, dossierId },
      relations: {
        dossier: true,
        assigneeMembership: { user: true },
        checklistItems: true,
      },
      order: { checklistItems: { position: 'ASC' } },
    });
    if (!task) throw new NotFoundException('La tâche est introuvable.');
    return this.toTask(task);
  }

  private async getTaskEntity(
    organizationId: string,
    dossierId: string,
    taskId: string,
  ) {
    const task = await this.tasks.findOneBy({
      id: taskId,
      organizationId,
      dossierId,
    });
    if (!task) throw new NotFoundException('La tâche est introuvable.');
    return task;
  }

  private async ensureTaskAccess(
    organizationId: string,
    dossierId: string,
    taskId: string,
    userId: string,
  ) {
    const access = await this.getAccess(organizationId, userId);
    const task = await this.getTaskEntity(organizationId, dossierId, taskId);
    if (
      !access.canSeeAll &&
      task.assigneeMembershipId !== access.membership.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez accéder qu’aux tâches qui vous sont affectées.',
      );
    }
    return task;
  }

  private ensureEditable(task: WorkTask) {
    if (
      [WorkTaskStatus.Completed, WorkTaskStatus.Cancelled].includes(task.status)
    ) {
      throw new ConflictException(
        'Une tâche terminée ou annulée ne peut plus être modifiée.',
      );
    }
  }

  private toTask(task: WorkTask) {
    const checklist = [...(task.checklistItems ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    const today = new Date().toISOString().slice(0, 10);
    return {
      id: task.id,
      dossierId: task.dossierId,
      dossierName: task.dossier?.legalName ?? null,
      obligationId: task.obligationId,
      type: task.type,
      title: task.title,
      description: task.description,
      dueOn: task.dueOn,
      priority: task.priority,
      status: task.status,
      isOverdue:
        task.dueOn < today &&
        ![WorkTaskStatus.Completed, WorkTaskStatus.Cancelled].includes(
          task.status,
        ),
      assigneeMembershipId: task.assigneeMembershipId,
      assigneeName: task.assigneeMembership?.user?.fullName ?? null,
      checklist: checklist.map((item) => this.toChecklistItem(item)),
      checklistCompleted: checklist.filter((item) => item.isCompleted).length,
      checklistTotal: checklist.length,
      lastComment: task.lastComment,
      completedAtUtc: task.completedAtUtc,
    };
  }

  private toChecklistItem(item: TaskChecklistItem) {
    return {
      id: item.id,
      label: item.label,
      position: item.position,
      isCompleted: item.isCompleted,
      completedAtUtc: item.completedAtUtc,
    };
  }

  private clean(value?: string | null) {
    return value?.trim() || null;
  }

  private async addAudit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    await this.auditLogs.save(
      this.auditLogs.create({
        organizationId,
        actorUserId,
        action,
        entityType: 'WorkTask',
        entityId,
        detailsJson,
      }),
    );
  }

  private async notifyOwners(
    organizationId: string,
    task: WorkTask,
    title: string,
    body: string,
    type: string,
  ) {
    const owners = await this.memberships.find({
      where: {
        organizationId,
        isActive: true,
        role: { normalizedName: SystemRoleNames.Owner.toUpperCase() },
      },
      relations: { role: true },
    });
    for (const owner of owners) {
      await this.notifications.createForUser({
        organizationId,
        recipientUserId: owner.userId,
        type,
        title,
        body,
        entityType: 'WorkTask',
        entityId: task.id,
        deduplicationKey: `task:${task.id}:${type}:${Date.now()}:${owner.userId}`,
      });
    }
  }
}
