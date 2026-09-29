import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  MonthlyDeclarationStatus,
  MonthlyTaxDeclaration,
  ObligationInstance,
  ObligationStatus,
  TaskChecklistItem,
  WorkTask,
  WorkTaskStatus,
} from '../database/entities';

interface Scope {
  organizationId: string;
  dossierId: string;
  actorUserId: string;
}
type Action = 'progress' | 'validate' | 'reject' | 'file' | 'pay';
type ObligationChanges = Partial<
  Pick<
    ObligationInstance,
    | 'lastComment'
    | 'amountDue'
    | 'amountPaid'
    | 'paymentReference'
    | 'notes'
    | 'filedAtUtc'
  >
>;

/** Shared transition rules. Access/permission checks remain in the calling services. */
@Injectable()
export class FiscalWorkflowService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async editChecklist<T>(
    scope: Scope,
    taskId: string,
    edit: (manager: EntityManager) => Promise<T>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const { task } = await this.lockTask(manager, scope, taskId);
      if (
        [WorkTaskStatus.Completed, WorkTaskStatus.Cancelled].includes(
          task.status,
        )
      ) {
        throw new ConflictException(
          'Une tâche terminée ou annulée ne peut plus être modifiée.',
        );
      }
      return edit(manager);
    });
  }

  async transitionTask(
    scope: Scope,
    taskId: string,
    status: WorkTaskStatus,
    action: Action,
    comment?: string | null,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const { task, obligation } = await this.lockTask(manager, scope, taskId);
      this.requireTaskTransition(task.status, status, action);
      if (status === WorkTaskStatus.Completed)
        await this.requireChecklist(manager, task);
      if (obligation) {
        const target =
          status === WorkTaskStatus.Completed
            ? ObligationStatus.Validated
            : status === WorkTaskStatus.ReadyForReview
              ? ObligationStatus.ReadyForReview
              : ObligationStatus.InProgress;
        this.requireObligationTransition(obligation.status, target, action);
        await this.applyObligation(manager, scope, obligation, target, {
          lastComment: comment === undefined ? task.lastComment : comment,
        });
      } else {
        this.applyTask(
          task,
          status,
          scope.actorUserId,
          comment === undefined ? task.lastComment : comment,
        );
        await manager.save(WorkTask, task);
      }
      return task.id;
    });
  }

  async transitionObligation(
    scope: Scope,
    obligationId: string,
    status: ObligationStatus,
    action: Action,
    changes: ObligationChanges = {},
  ) {
    await this.dataSource.transaction(async (manager) => {
      const obligation = await this.lockObligation(
        manager,
        scope,
        obligationId,
      );
      this.requireObligationTransition(obligation.status, status, action);
      await this.applyObligation(manager, scope, obligation, status, changes);
    });
  }

  async saveDeclaration(
    item: MonthlyTaxDeclaration,
    expected: MonthlyDeclarationStatus,
    actorUserId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const scope = {
        organizationId: item.organizationId,
        dossierId: item.dossierId,
        actorUserId,
      };
      const obligation = item.obligationId
        ? await this.lockObligation(manager, scope, item.obligationId)
        : null;
      if (obligation) await this.lockLinkedTask(manager, scope, obligation.id);
      const current = await manager.findOne(MonthlyTaxDeclaration, {
        where: {
          id: item.id,
          organizationId: item.organizationId,
          dossierId: item.dossierId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current)
        throw new NotFoundException('La déclaration est introuvable.');
      if (
        current.status !== expected ||
        current.updatedAtUtc?.getTime() !== item.updatedAtUtc?.getTime()
      ) {
        throw new ConflictException(
          'La déclaration a changé. Rechargez-la avant de continuer.',
        );
      }
      const allowedDeclaration =
        item.status === MonthlyDeclarationStatus.ReadyForReview
          ? [
              MonthlyDeclarationStatus.Draft,
              MonthlyDeclarationStatus.Rejected,
            ].includes(expected)
          : [
                MonthlyDeclarationStatus.Rejected,
                MonthlyDeclarationStatus.Validated,
              ].includes(item.status)
            ? expected === MonthlyDeclarationStatus.ReadyForReview
            : item.status === MonthlyDeclarationStatus.Filed &&
              expected === MonthlyDeclarationStatus.Validated;
      if (!allowedDeclaration)
        throw new ConflictException(
          `Transition interdite de ${expected} vers ${item.status}.`,
        );
      if (obligation) {
        const target =
          item.status === MonthlyDeclarationStatus.ReadyForReview
            ? ObligationStatus.ReadyForReview
            : item.status === MonthlyDeclarationStatus.Rejected
              ? ObligationStatus.InProgress
              : item.status === MonthlyDeclarationStatus.Filed
                ? ObligationStatus.Filed
                : ObligationStatus.Validated;
        const allowed =
          item.status === MonthlyDeclarationStatus.ReadyForReview
            ? [
                ObligationStatus.NotStarted,
                ObligationStatus.InProgress,
                ObligationStatus.ReadyForReview,
              ].includes(obligation.status)
            : item.status === MonthlyDeclarationStatus.Rejected ||
                item.status === MonthlyDeclarationStatus.Validated
              ? obligation.status === ObligationStatus.ReadyForReview
              : obligation.status === ObligationStatus.Validated;
        if (!allowed)
          throw new ConflictException(
            "Le statut de l'obligation ne permet pas cette transition.",
          );
        await this.applyObligation(
          manager,
          scope,
          obligation,
          target,
          {
            lastComment: item.reviewComment,
            ...(item.status === MonthlyDeclarationStatus.Validated ||
            item.status === MonthlyDeclarationStatus.Filed
              ? { amountDue: item.totalDue }
              : {}),
            ...(item.status === MonthlyDeclarationStatus.Filed
              ? {
                  filedAtUtc: item.filedAtUtc ?? new Date(),
                  paymentReference: item.filingReference,
                }
              : {}),
          },
          true,
        );
      }
      return manager.save(MonthlyTaxDeclaration, item);
    });
  }

  private async lockObligation(
    manager: EntityManager,
    scope: Scope,
    id: string,
  ) {
    const item = await manager.findOne(ObligationInstance, {
      where: {
        id,
        organizationId: scope.organizationId,
        dossierId: scope.dossierId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!item) throw new NotFoundException("L'obligation est introuvable.");
    return item;
  }

  private async lockTask(manager: EntityManager, scope: Scope, taskId: string) {
    const where = {
      id: taskId,
      organizationId: scope.organizationId,
      dossierId: scope.dossierId,
    };
    const initial = await manager.findOneBy(WorkTask, where);
    if (!initial) throw new NotFoundException('La tâche est introuvable.');
    // All entry points acquire locks in obligation -> task -> declaration order.
    const obligation = initial.obligationId
      ? await this.lockObligation(manager, scope, initial.obligationId)
      : null;
    const task = await manager.findOne(WorkTask, {
      where,
      lock: { mode: 'pessimistic_write' },
    });
    if (!task) throw new NotFoundException('La tâche est introuvable.');
    return { task, obligation };
  }

  private lockLinkedTask(
    manager: EntityManager,
    scope: Scope,
    obligationId: string,
  ) {
    return manager.findOne(WorkTask, {
      where: {
        obligationId,
        organizationId: scope.organizationId,
        dossierId: scope.dossierId,
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private requireTaskTransition(
    from: WorkTaskStatus,
    to: WorkTaskStatus,
    action: Action,
  ) {
    const allowed =
      action === 'validate'
        ? from === WorkTaskStatus.ReadyForReview &&
          to === WorkTaskStatus.Completed
        : action === 'reject'
          ? from === WorkTaskStatus.ReadyForReview &&
            to === WorkTaskStatus.InProgress
          : action === 'progress' &&
            ((to === WorkTaskStatus.InProgress &&
              [WorkTaskStatus.Todo, WorkTaskStatus.InProgress].includes(
                from,
              )) ||
              (to === WorkTaskStatus.ReadyForReview &&
                from === WorkTaskStatus.InProgress));
    if (!allowed)
      throw new ConflictException(
        `Transition interdite de ${from} vers ${to}.`,
      );
  }

  private requireObligationTransition(
    from: ObligationStatus,
    to: ObligationStatus,
    action: Action,
  ) {
    const allowed =
      action === 'validate'
        ? from === ObligationStatus.ReadyForReview &&
          to === ObligationStatus.Validated
        : action === 'reject'
          ? from === ObligationStatus.ReadyForReview &&
            to === ObligationStatus.InProgress
          : action === 'file'
            ? from === ObligationStatus.Validated &&
              to === ObligationStatus.Filed
            : action === 'pay'
              ? [ObligationStatus.Filed, ObligationStatus.Paid].includes(
                  from,
                ) && to === ObligationStatus.Paid
              : action === 'progress' &&
                ((to === ObligationStatus.InProgress &&
                  [
                    ObligationStatus.NotStarted,
                    ObligationStatus.InProgress,
                  ].includes(from)) ||
                  (to === ObligationStatus.ReadyForReview &&
                    from === ObligationStatus.InProgress));
    if (!allowed)
      throw new ConflictException(
        `Transition interdite de ${from} vers ${to}.`,
      );
  }

  private async requireChecklist(manager: EntityManager, task: WorkTask) {
    const incomplete = await manager.count(TaskChecklistItem, {
      where: { taskId: task.id, isCompleted: false },
    });
    if (incomplete)
      throw new ConflictException(
        'Tous les éléments de la checklist doivent être terminés.',
      );
  }

  private applyTask(
    task: WorkTask,
    status: WorkTaskStatus,
    actorUserId: string,
    comment: string | null,
  ) {
    task.status = status;
    task.lastComment = comment;
    task.completedAtUtc =
      status === WorkTaskStatus.Completed ? new Date() : null;
    task.completedByUserId =
      status === WorkTaskStatus.Completed ? actorUserId : null;
  }

  private async applyObligation(
    manager: EntityManager,
    scope: Scope,
    item: ObligationInstance,
    status: ObligationStatus,
    changes: ObligationChanges,
    fromDeclaration = false,
  ) {
    const task = await this.lockLinkedTask(manager, scope, item.id);
    if (
      [
        ObligationStatus.Validated,
        ObligationStatus.Filed,
        ObligationStatus.Paid,
      ].includes(status) &&
      task
    ) {
      await this.requireChecklist(manager, task);
    }
    if (!fromDeclaration) {
      const declaration = await manager.findOne(MonthlyTaxDeclaration, {
        where: {
          obligationId: item.id,
          organizationId: scope.organizationId,
          dossierId: scope.dossierId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        declaration &&
        ([ObligationStatus.Filed, ObligationStatus.Paid].includes(status)
          ? declaration.status !== MonthlyDeclarationStatus.Filed
          : status === ObligationStatus.Validated
            ? ![
                MonthlyDeclarationStatus.Validated,
                MonthlyDeclarationStatus.Filed,
              ].includes(declaration.status)
            : [
                ObligationStatus.InProgress,
                ObligationStatus.ReadyForReview,
              ].includes(status) &&
              ![
                MonthlyDeclarationStatus.Draft,
                MonthlyDeclarationStatus.Rejected,
              ].includes(declaration.status))
      ) {
        throw new ConflictException(
          'Utilisez la page Déclarations pour modifier la déclaration liée.',
        );
      }
    }
    Object.assign(item, changes);
    item.status = status;
    if (status === ObligationStatus.Validated) {
      item.validatedAtUtc = new Date();
      item.validatedByUserId = scope.actorUserId;
    } else if (status === ObligationStatus.Filed) {
      item.filedAtUtc ??= new Date();
      item.filedByUserId = scope.actorUserId;
    } else if (
      [ObligationStatus.InProgress, ObligationStatus.ReadyForReview].includes(
        status,
      )
    ) {
      item.validatedAtUtc = null;
      item.validatedByUserId = null;
    }
    await manager.save(ObligationInstance, item);
    if (task) {
      const taskStatus = [
        ObligationStatus.Validated,
        ObligationStatus.Filed,
        ObligationStatus.Paid,
      ].includes(status)
        ? WorkTaskStatus.Completed
        : status === ObligationStatus.ReadyForReview
          ? WorkTaskStatus.ReadyForReview
          : WorkTaskStatus.InProgress;
      // Filing/payment does not change who completed the preparation work.
      if (
        taskStatus === WorkTaskStatus.Completed &&
        task.status === WorkTaskStatus.Completed
      ) {
        task.lastComment = changes.lastComment ?? task.lastComment;
      } else {
        this.applyTask(
          task,
          taskStatus,
          scope.actorUserId,
          changes.lastComment ?? task.lastComment,
        );
      }
      await manager.save(WorkTask, task);
    }
  }
}
