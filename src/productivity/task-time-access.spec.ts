import { ForbiddenException } from '@nestjs/common';
import { OrganizationMembership } from '../database/entities';
import { PermissionNames } from '../database/permissions';
import { ProductivityService } from './productivity.service';

describe('Time tracking task assignment', () => {
  const service = Object.create(
    ProductivityService.prototype,
  ) as ProductivityService;
  const actor = {
    membership: Object.assign(new OrganizationMembership(), { id: 'worker' }),
    permissions: new Set<string>(),
  };
  let assignee: string | null;
  const taskRepository = { findOneBy: jest.fn() };

  beforeEach(() => {
    actor.permissions.clear();
    assignee = 'worker';
    taskRepository.findOneBy.mockImplementation(() =>
      Promise.resolve({ assigneeMembershipId: assignee }),
    );
    Object.assign(service, { tasks: taskRepository });
  });

  it('allows assigned work and existing work outside a task', async () => {
    await expect(
      service['ensureTask']('org', 'dossier', 'task', actor),
    ).resolves.toBeUndefined();
    await expect(
      service['ensureTask']('org', 'dossier', null, actor),
    ).resolves.toBeUndefined();
  });

  it.each(['other', null])(
    'blocks time on a task not assigned to the worker (%s)',
    async (value) => {
      assignee = value;
      await expect(
        service['ensureTask']('org', 'dossier', 'task', actor),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it.each([PermissionNames.TasksAssign, PermissionNames.TasksValidate])(
    'allows managers with %s',
    async (permission) => {
      assignee = 'other';
      actor.permissions.add(permission);
      await expect(
        service['ensureTask']('org', 'dossier', 'task', actor),
      ).resolves.toBeUndefined();
    },
  );

  it('checks assignment in manual creation, correction, and automatic start', async () => {
    assignee = 'other';
    Object.assign(service, {
      dossiers: { getAccessibleEntity: jest.fn().mockResolvedValue({}) },
    });
    const actorSpy = jest
      .spyOn(service, 'getActor' as never)
      .mockResolvedValue(actor as never);
    const entrySpy = jest
      .spyOn(service, 'getOwnedEntry' as never)
      .mockResolvedValue({
        taskId: 'task',
        status: 'BROUILLON',
        workDate: '2026-01-01',
        durationMinutes: 60,
      } as never);
    await expect(
      service.createTimeEntry('org', 'dossier', 'user', {
        taskId: 'task',
        workDate: '2026-01-01',
        durationMinutes: 60,
        billable: true,
        description: 'Work',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.updateTimeEntry('org', 'dossier', 'entry', 'user', {
        taskId: 'task',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.startWorkSession('org', 'dossier', 'user', {
        taskId: 'task',
        description: 'Work',
        billable: true,
      }),
    ).rejects.toThrow(ForbiddenException);
    actorSpy.mockRestore();
    entrySpy.mockRestore();
  });

  it('filters both task lanes of the daily cockpit without changing other lanes', async () => {
    const query = jest.fn().mockResolvedValue([]);
    Object.assign(service, { dataSource: { query } });
    const spy = jest
      .spyOn(service, 'getActor' as never)
      .mockResolvedValue(actor as never);
    await service.cockpit('org', 'user');
    const taskCalls = query.mock.calls.filter(([sql]: [string]) =>
      sql.includes('accounting.work_tasks'),
    );
    expect(taskCalls).toHaveLength(2);
    for (const [sql, params] of taskCalls) {
      expect(sql).toContain(
        'AND ($4::boolean OR t.assignee_membership_id = $2)',
      );
      expect(params).toEqual(['org', 'worker', false, false]);
    }
    spy.mockRestore();
  });
});
