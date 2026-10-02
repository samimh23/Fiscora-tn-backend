import { ForbiddenException } from '@nestjs/common';
import { PermissionNames } from '../database/permissions';
import { WorkTaskStatus } from '../database/entities';
import { TaskQueryDto } from './dto';
import { TasksService } from './tasks.service';
import { canAccessAllTasks } from './task-access';

describe('Assigned task access', () => {
  const service = Object.create(TasksService.prototype) as TasksService;
  let task: { assigneeMembershipId: string | null; status: WorkTaskStatus };
  let permissions: string[];
  const builder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const workflow = { transitionTask: jest.fn(), editChecklist: jest.fn() };
  const comments = { find: jest.fn(), save: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    permissions = [PermissionNames.TasksView, PermissionNames.TasksManage];
    task = { assigneeMembershipId: 'other', status: WorkTaskStatus.Todo };
    Object.assign(service, {
      dossiersService: { getAccessibleEntity: jest.fn().mockResolvedValue({}) },
      tasks: {
        createQueryBuilder: jest.fn().mockReturnValue(builder),
        findOneBy: jest.fn().mockImplementation(() => Promise.resolve(task)),
      },
      memberships: {
        findOne: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'worker',
            role: {
              rolePermissions: permissions.map((permissionName) => ({
                permissionName,
              })),
            },
          }),
        ),
      },
      workflow,
      comments,
    });
  });

  it('restricts both list routes before pagination and cannot be overridden by an assignee filter', async () => {
    const query = Object.assign(new TaskQueryDto(), {
      assigneeMembershipId: 'other',
    });
    for (const list of [
      () => service.listCabinet('org', 'user', query),
      () => service.listDossier('org', 'dossier', 'user', query),
    ]) {
      builder.andWhere.mockClear();
      await list();
      expect(builder.andWhere).toHaveBeenCalledWith(
        'task.assignee_membership_id = :visibleMembershipId',
        { visibleMembershipId: 'worker' },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        'task.assignee_membership_id = :assigneeMembershipId',
        { assigneeMembershipId: 'other' },
      );
    }
  });

  it.each([PermissionNames.TasksAssign, PermissionNames.TasksValidate])(
    'keeps manager lists unrestricted with %s',
    async (permission) => {
      permissions.push(permission);
      await service.listDossier('org', 'dossier', 'user', new TaskQueryDto());
      expect(builder.andWhere).not.toHaveBeenCalledWith(
        'task.assignee_membership_id = :visibleMembershipId',
        expect.anything(),
      );
      expect(canAccessAllTasks(new Set(permissions))).toBe(true);
    },
  );

  it.each(['other', null])(
    'blocks direct access to another or unassigned task (%s)',
    async (assignee) => {
      task.assigneeMembershipId = assignee;
      await expect(
        service['ensureTaskAccess']('org', 'dossier', 'task', 'user'),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('allows the assigned worker and a manager', async () => {
    task.assigneeMembershipId = 'worker';
    await expect(
      service['ensureTaskAccess']('org', 'dossier', 'task', 'user'),
    ).resolves.toBe(task);
    task.assigneeMembershipId = 'other';
    permissions.push(PermissionNames.TasksAssign);
    await expect(
      service['ensureTaskAccess']('org', 'dossier', 'task', 'user'),
    ).resolves.toBe(task);
  });

  it('blocks progress, editing, checklists and comments before reading or changing them', async () => {
    const calls = [
      () =>
        service.update('org', 'dossier', 'task', 'user', { title: 'change' }),
      () =>
        service.progress('org', 'dossier', 'task', 'user', {
          status: WorkTaskStatus.InProgress,
        }),
      () => service.addChecklistItem('org', 'dossier', 'task', 'user', 'item'),
      () =>
        service.updateChecklistItem('org', 'dossier', 'task', 'item', 'user', {
          isCompleted: true,
        }),
      () => service.getComments('org', 'dossier', 'task', 'user'),
      () => service.addComment('org', 'dossier', 'task', 'user', 'comment'),
    ];
    for (const call of calls)
      await expect(call()).rejects.toThrow(ForbiddenException);
    expect(workflow.transitionTask).not.toHaveBeenCalled();
    expect(workflow.editChecklist).not.toHaveBeenCalled();
    expect(comments.find).not.toHaveBeenCalled();
    expect(comments.save).not.toHaveBeenCalled();
  });
});
