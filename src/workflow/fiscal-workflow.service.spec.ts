import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  MonthlyDeclarationStatus,
  MonthlyTaxDeclaration,
  ObligationInstance,
  ObligationStatus,
  WorkTask,
  WorkTaskStatus,
  WorkTaskType,
  AuditLog,
  TaskChecklistItem,
} from '../database/entities';
import { FiscalWorkflowService } from './fiscal-workflow.service';

describe('FiscalWorkflowService', () => {
  const scope = {
    organizationId: 'org',
    dossierId: 'dossier',
    actorUserId: 'reviewer',
  };
  let task: WorkTask;
  let obligation: ObligationInstance;
  let declaration: MonthlyTaxDeclaration | null;
  let manager: {
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    count: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let transaction: jest.Mock;
  let service: FiscalWorkflowService;

  beforeEach(() => {
    task = Object.assign(new WorkTask(), {
      id: 'task',
      ...scope,
      obligationId: 'obligation',
      status: WorkTaskStatus.ReadyForReview,
    });
    obligation = Object.assign(new ObligationInstance(), {
      id: 'obligation',
      ...scope,
      status: ObligationStatus.ReadyForReview,
    });
    declaration = null;
    manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === WorkTask
            ? task
            : entity === ObligationInstance
              ? obligation
              : declaration,
        ),
      ),
      findOneBy: jest.fn(() => Promise.resolve(task)),
      count: jest.fn(() => Promise.resolve(0)),
      save: jest.fn((_entity: unknown, item: unknown) => Promise.resolve(item)),
      create: jest.fn((_entity: unknown, item: unknown) => item),
    };
    transaction = jest.fn((work: (em: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    );
    service = new FiscalWorkflowService({
      transaction,
    } as unknown as DataSource);
  });

  function monthly(status: MonthlyDeclarationStatus) {
    return Object.assign(new MonthlyTaxDeclaration(), {
      id: 'declaration',
      ...scope,
      obligationId: obligation.id,
      status,
      updatedAtUtc: new Date('2026-01-01T00:00:00Z'),
      totalDue: '100.000',
    });
  }

  it.each(['task', 'calendar'])(
    'blocks incomplete checklists through the %s entry point',
    async (entry) => {
      manager.count.mockResolvedValue(1);
      const result =
        entry === 'task'
          ? service.transitionTask(
              scope,
              task.id,
              WorkTaskStatus.Completed,
              'validate',
            )
          : service.transitionObligation(
              scope,
              obligation.id,
              ObligationStatus.Validated,
              'validate',
            );
      await expect(result).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('approves the task and obligation within one transaction', async () => {
    await service.transitionTask(
      scope,
      task.id,
      WorkTaskStatus.Completed,
      'validate',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(task.status).toBe(WorkTaskStatus.Completed);
    expect(obligation.status).toBe(ObligationStatus.Validated);
    expect(task.completedByUserId).toBe(scope.actorUserId);
    expect(obligation.validatedByUserId).toBe(scope.actorUserId);
  });

  it('blocks task approval when the linked declaration is not validated', async () => {
    declaration = monthly(MonthlyDeclarationStatus.ReadyForReview);
    await expect(
      service.transitionTask(
        scope,
        task.id,
        WorkTaskStatus.Completed,
        'validate',
      ),
    ).rejects.toThrow(/Déclarations/);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('blocks calendar rejection from leaving a declaration in review', async () => {
    declaration = monthly(MonthlyDeclarationStatus.ReadyForReview);
    await expect(
      service.transitionObligation(
        scope,
        obligation.id,
        ObligationStatus.InProgress,
        'reject',
      ),
    ).rejects.toThrow(/Déclarations/);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('synchronizes declaration submission with the calendar and task', async () => {
    declaration = monthly(MonthlyDeclarationStatus.Draft);
    obligation.status = ObligationStatus.NotStarted;
    task.status = WorkTaskStatus.Todo;
    const next = Object.assign(new MonthlyTaxDeclaration(), declaration, {
      status: MonthlyDeclarationStatus.ReadyForReview,
    });
    await service.saveDeclaration(
      next,
      MonthlyDeclarationStatus.Draft,
      scope.actorUserId,
    );
    expect(task.status).toBe(WorkTaskStatus.ReadyForReview);
    expect(obligation.status).toBe(ObligationStatus.ReadyForReview);
    expect(manager.save).toHaveBeenCalledWith(MonthlyTaxDeclaration, next);
  });

  it('also enforces the checklist on declaration validation', async () => {
    declaration = monthly(MonthlyDeclarationStatus.ReadyForReview);
    manager.count.mockResolvedValue(2);
    const next = Object.assign(new MonthlyTaxDeclaration(), declaration, {
      status: MonthlyDeclarationStatus.Validated,
    });
    await expect(
      service.saveDeclaration(
        next,
        MonthlyDeclarationStatus.ReadyForReview,
        scope.actorUserId,
      ),
    ).rejects.toThrow(/checklist/);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('synchronizes declaration validation without a separate calendar approval', async () => {
    declaration = monthly(MonthlyDeclarationStatus.ReadyForReview);
    const next = Object.assign(new MonthlyTaxDeclaration(), declaration, {
      status: MonthlyDeclarationStatus.Validated,
    });
    await service.saveDeclaration(
      next,
      MonthlyDeclarationStatus.ReadyForReview,
      scope.actorUserId,
    );
    expect(task.status).toBe(WorkTaskStatus.Completed);
    expect(obligation.status).toBe(ObligationStatus.Validated);
    expect(obligation.amountDue).toBe('100.000');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('returns the linked preparation task to work when the declaration is rejected', async () => {
    declaration = monthly(MonthlyDeclarationStatus.ReadyForReview);
    const next = Object.assign(new MonthlyTaxDeclaration(), declaration, {
      status: MonthlyDeclarationStatus.Rejected,
      reviewComment: 'Corriger les pièces',
    });
    await service.saveDeclaration(
      next,
      MonthlyDeclarationStatus.ReadyForReview,
      scope.actorUserId,
    );
    expect(task.status).toBe(WorkTaskStatus.InProgress);
    expect(task.completedAtUtc).toBeNull();
    expect(obligation.lastComment).toBe('Corriger les pièces');
  });

  it('does not overwrite the preparation reviewer on filing', async () => {
    declaration = monthly(MonthlyDeclarationStatus.Validated);
    obligation.status = ObligationStatus.Validated;
    task.status = WorkTaskStatus.Completed;
    task.completedByUserId = 'original-reviewer';
    const next = Object.assign(new MonthlyTaxDeclaration(), declaration, {
      status: MonthlyDeclarationStatus.Filed,
      filingReference: 'receipt',
    });
    await service.saveDeclaration(
      next,
      MonthlyDeclarationStatus.Validated,
      scope.actorUserId,
    );
    expect(obligation.status).toBe(ObligationStatus.Filed);
    expect(task.completedByUserId).toBe('original-reviewer');
  });

  it('rejects a stale declaration instead of overwriting concurrent changes', async () => {
    declaration = monthly(MonthlyDeclarationStatus.ReadyForReview);
    const next = Object.assign(new MonthlyTaxDeclaration(), declaration, {
      status: MonthlyDeclarationStatus.Validated,
      updatedAtUtc: new Date('2025-01-01'),
    });
    await expect(
      service.saveDeclaration(
        next,
        MonthlyDeclarationStatus.ReadyForReview,
        scope.actorUserId,
      ),
    ).rejects.toThrow(/changé/);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not permit direct declaration validation from a draft', async () => {
    declaration = monthly(MonthlyDeclarationStatus.Draft);
    const next = Object.assign(new MonthlyTaxDeclaration(), declaration, {
      status: MonthlyDeclarationStatus.Validated,
    });
    await expect(
      service.saveDeclaration(
        next,
        MonthlyDeclarationStatus.Draft,
        scope.actorUserId,
      ),
    ).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not regress a filed obligation through a stale task action', async () => {
    obligation.status = ObligationStatus.Filed;
    await expect(
      service.transitionTask(
        scope,
        task.id,
        WorkTaskStatus.Completed,
        'validate',
      ),
    ).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('keeps task and obligation lookups scoped to organization and dossier', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(
      service.transitionObligation(
        scope,
        obligation.id,
        ObligationStatus.Validated,
        'validate',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(manager.findOne).toHaveBeenCalledWith(ObligationInstance, {
      where: {
        id: obligation.id,
        organizationId: scope.organizationId,
        dossierId: scope.dossierId,
      },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('supports manual tasks without an obligation', async () => {
    task.obligationId = null;
    await service.transitionTask(
      scope,
      task.id,
      WorkTaskStatus.Completed,
      'validate',
    );
    expect(task.status).toBe(WorkTaskStatus.Completed);
    expect(manager.save).not.toHaveBeenCalledWith(
      ObligationInstance,
      expect.anything(),
    );
  });

  it('locks checklist edits using the same task lock as approval', async () => {
    const edit = jest.fn(() => Promise.resolve('updated'));
    await expect(service.editChecklist(scope, task.id, edit)).resolves.toBe(
      'updated',
    );
    expect(manager.findOne).toHaveBeenCalledWith(WorkTask, {
      where: {
        id: task.id,
        organizationId: scope.organizationId,
        dossierId: scope.dossierId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it.each([WorkTaskStatus.Completed, WorkTaskStatus.Cancelled])(
    'does not edit a %s checklist',
    async (status) => {
      task.status = status;
      const edit = jest.fn();
      await expect(service.editChecklist(scope, task.id, edit)).rejects.toThrow(
        ConflictException,
      );
      expect(edit).not.toHaveBeenCalled();
    },
  );
  it('links a previously filed declaration without inventing checklist completion', async () => {
    obligation.status = ObligationStatus.NotStarted;
    obligation.periodYear = 2026;
    obligation.periodMonth = 9;
    task.type = WorkTaskType.Obligation;
    task.status = WorkTaskStatus.Todo;
    declaration = monthly(MonthlyDeclarationStatus.Filed);
    declaration.obligationId = null;
    declaration.filingReference = 'TEST-FILED-001';
    await service.reconcileGeneratedDeclaration(scope, obligation.id);
    expect(obligation.status).toBe(ObligationStatus.Filed);
    expect(obligation.paymentReference).toBe('TEST-FILED-001');
    expect(declaration.obligationId).toBe(obligation.id);
    expect(task.status).toBe(WorkTaskStatus.Cancelled);
    expect(manager.save).not.toHaveBeenCalledWith(
      TaskChecklistItem,
      expect.anything(),
    );
    expect(manager.save).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({ action: 'obligation.declaration_reconciled' }),
    );
  });
  it('does not regress a paid obligation or retire started preparation work', async () => {
    obligation.status = ObligationStatus.Paid;
    task.type = WorkTaskType.Obligation;
    task.status = WorkTaskStatus.InProgress;
    declaration = monthly(MonthlyDeclarationStatus.Validated);
    await service.reconcileGeneratedDeclaration(scope, obligation.id);
    expect(obligation.status).toBe(ObligationStatus.Paid);
    expect(task.status).toBe(WorkTaskStatus.InProgress);
  });
  it('refuses to relink another obligation’s declaration', async () => {
    declaration = monthly(MonthlyDeclarationStatus.Filed);
    declaration.obligationId = 'other';
    await expect(
      service.reconcileGeneratedDeclaration(scope, obligation.id),
    ).rejects.toThrow('autre obligation');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('does not bypass initial approval by cancelling an incomplete task', async () => {
    task.status = WorkTaskStatus.Cancelled;
    obligation.status = ObligationStatus.ReadyForReview;
    manager.count.mockResolvedValue(1);
    await expect(
      service.transitionObligation(
        scope,
        obligation.id,
        ObligationStatus.Validated,
        'validate',
      ),
    ).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('can record payment for a filed declaration after retiring redundant preparation', async () => {
    task.status = WorkTaskStatus.Cancelled;
    obligation.status = ObligationStatus.Filed;
    declaration = monthly(MonthlyDeclarationStatus.Filed);
    manager.count.mockResolvedValue(3);
    await service.transitionObligation(
      scope,
      obligation.id,
      ObligationStatus.Paid,
      'pay',
      { amountPaid: '100.000' },
    );
    expect(obligation.status).toBe(ObligationStatus.Paid);
    expect(task.status).toBe(WorkTaskStatus.Cancelled);
  });
});
