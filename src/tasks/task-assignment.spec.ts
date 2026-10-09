import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DossierAssignmentRole, WorkTaskStatus } from '../database/entities';
import { SystemRoleNames } from '../database/permissions';
import { TasksService } from './tasks.service';

describe('Internal task assignees', () => {
  function setup(
    role = 'Collaborateur',
    assignmentRole = DossierAssignmentRole.Support,
  ) {
    const service = Object.create(TasksService.prototype) as TasksService;
    const task = {
      id: 'task',
      title: 'Preparation',
      status: WorkTaskStatus.Todo,
      assigneeMembershipId: null,
    };
    const memberships = {
      findOne: jest.fn().mockResolvedValue({
        id: 'member',
        userId: 'worker',
        role: { name: role },
      }),
    };
    const assignments = {
      findOneBy: jest.fn().mockResolvedValue({ assignmentRole }),
    };
    const tasks = { save: jest.fn().mockResolvedValue(task) };
    const notifications = { createForUser: jest.fn() };
    Object.assign(service, {
      memberships,
      assignments,
      tasks,
      notifications,
      getTaskEntity: jest.fn().mockResolvedValue(task),
      getTask: jest.fn().mockResolvedValue(task),
      addAudit: jest.fn(),
    });
    return { service, task, memberships, assignments, tasks, notifications };
  }
  it.each([
    [SystemRoleNames.ClientPortal, DossierAssignmentRole.Support],
    ['Collaborateur', DossierAssignmentRole.Client],
  ])(
    'blocks a portal client by cabinet or dossier role (%s / %s)',
    async (role, assignmentRole) => {
      const ctx = setup(role, assignmentRole);
      await expect(
        ctx.service.assign('org', 'dossier', 'task', 'member', 'owner'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ctx.tasks.save).not.toHaveBeenCalled();
      expect(ctx.notifications.createForUser).not.toHaveBeenCalled();
      expect(ctx.task.assigneeMembershipId).toBeNull();
    },
  );
  it('allows an active internal collaborator assigned to the dossier', async () => {
    const ctx = setup();
    await ctx.service.assign('org', 'dossier', 'task', 'member', 'owner');
    expect(ctx.task.assigneeMembershipId).toBe('member');
    expect(ctx.memberships.findOne).toHaveBeenCalledWith({
      where: { id: 'member', organizationId: 'org', isActive: true },
      relations: { role: true },
    });
    expect(ctx.notifications.createForUser).toHaveBeenCalledTimes(1);
  });
  it('requires an active cabinet membership', async () => {
    const ctx = setup();
    ctx.memberships.findOne.mockResolvedValue(null);
    await expect(
      ctx.service.assign('org', 'dossier', 'task', 'member', 'owner'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.tasks.save).not.toHaveBeenCalled();
  });
  it('requires dossier access', async () => {
    const ctx = setup();
    ctx.assignments.findOneBy.mockResolvedValue(null);
    await expect(
      ctx.service.assign('org', 'dossier', 'task', 'member', 'owner'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.tasks.save).not.toHaveBeenCalled();
  });
});
