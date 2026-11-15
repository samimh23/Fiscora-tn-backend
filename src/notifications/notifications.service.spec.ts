import {
  AccountingDocument,
  ClientPortalMessage,
  WorkTask,
} from '../database/entities';
import { PermissionNames } from '../database/permissions';
import { NotificationsService } from './notifications.service';

const org = 'org';
const user = 'recipient';
const dossierId = 'allowed';
const item = (
  entityType: string,
  entityId: string,
  body = 'Détail enregistré',
) => ({
  id: `notification-${entityId}`,
  entityType,
  entityId,
  title: 'Ancien titre',
  body,
  type: entityType === 'ObligationInstance' ? 'ECHEANCE_APPROCHE' : 'OTHER',
});

function setup() {
  const notices = [
    item('ObligationInstance', 'tax'),
    item('ClientPortalMessage', 'message'),
    item('AccountingDocument', 'document'),
    item('AccountingDocument', 'blocked-document'),
    item('WorkTask', 'mine'),
    item('WorkTask', 'someone-else'),
  ];
  const sub = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getQuery: jest.fn().mockReturnValue('(SELECT 1)'),
  };
  const query = {
    subQuery: jest.fn().mockReturnValue(sub),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(notices),
  };
  const collections = new Map<unknown, unknown>([
    [
      AccountingDocument,
      [
        { id: 'document', dossierId },
        { id: 'blocked-document', dossierId: 'blocked' },
      ],
    ],
    [ClientPortalMessage, [{ id: 'message', dossierId }]],
    [
      WorkTask,
      [
        { id: 'mine', dossierId, assigneeMembershipId: 'membership' },
        { id: 'someone-else', dossierId, assigneeMembershipId: 'other' },
      ],
    ],
  ]);
  const permissions = [
    PermissionNames.DossiersView,
    PermissionNames.ObligationsView,
    PermissionNames.DocumentsView,
    PermissionNames.ClientPortalView,
    PermissionNames.TasksView,
  ];
  const resolveAccessibleDossiers = jest.fn().mockImplementation(() => ({
    membership: {
      id: 'membership',
      role: {
        normalizedName: 'WORKER',
        rolePermissions: permissions.map((permissionName) => ({
          permissionName,
        })),
      },
    },
    dossiers: [{ id: dossierId, legalName: 'Dossier Alpha' }],
  }));
  const service = new NotificationsService(
    { createQueryBuilder: jest.fn().mockReturnValue(query) } as never,
    {
      find: jest.fn().mockResolvedValue([
        {
          id: 'tax',
          dossierId,
          periodYear: 2025,
          dueOn: '2025-12-31',
          template: { name: 'Déclaration mensuelle' },
        },
      ]),
    } as never,
    {} as never,
    {
      getRepository: jest.fn((entity: unknown) => ({
        find: jest.fn().mockResolvedValue(collections.get(entity)),
      })),
    } as never,
    { resolveAccessibleDossiers } as never,
  );
  return { service, permissions, query, sub, resolveAccessibleDossiers };
}

describe('actionable notifications', () => {
  it('resolves only authorized targets and shows the current tax deadline', async () => {
    const { service, resolveAccessibleDossiers } = setup();
    const result = await service.list(org, user, false);
    expect(resolveAccessibleDossiers).toHaveBeenCalledWith(org, user, [
      dossierId,
      'blocked',
    ]);
    expect(result[0]).toMatchObject({
      title: 'Obligation en retard',
      body: 'Dossier Alpha · Déclaration mensuelle · Échéance : 31/12/2025',
      target: { kind: 'obligation', dossierId, id: 'tax', year: 2025 },
    });
    expect(result.map((row) => row.target?.kind ?? null)).toEqual([
      'obligation',
      'conversation',
      'document',
      null,
      'task',
      null,
    ]);
  });

  it('removes actions when the recipient loses module permissions', async () => {
    const { service, permissions } = setup();
    permissions.length = 0;
    const result = await service.list(org, user, false);
    expect(result.every((row) => row.target === null)).toBe(true);
    expect(result[0].body).toBe('Détail enregistré');
  });

  it('filters older reminders even when the latest reminder is already read', async () => {
    const { service, query, sub } = setup();
    await service.list(org, user, true);
    expect(sub.andWhere).toHaveBeenCalledWith(
      'newer.entity_id = notice.entity_id',
    );
    expect(sub.andWhere).toHaveBeenCalledWith(
      'newer.recipient_user_id = notice.recipient_user_id',
    );
    expect(sub.andWhere.mock.calls.flat()).not.toContain(
      'notice.read_at_utc IS NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('EXISTS (SELECT 1) AND NOT EXISTS (SELECT 1)'),
      expect.objectContaining({
        deadlineTypes: ['OBLIGATION_EN_RETARD', 'ECHEANCE_APPROCHE'],
      }),
    );
    expect(query.andWhere).toHaveBeenCalledWith('notice.read_at_utc IS NULL');
  });
});
