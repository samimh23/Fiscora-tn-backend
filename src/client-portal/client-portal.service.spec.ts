import { ClientPortalMessage } from '../database/entities';
import { SystemRoleNames } from '../database/permissions';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortalService conversation', () => {
  function setup(stored: Partial<ClientPortalMessage>[]) {
    const execute = jest.fn().mockResolvedValue(undefined);
    const builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    const messages = {
      find: jest.fn().mockResolvedValue(stored),
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    };
    const memberships = {
      findOne: jest.fn().mockResolvedValue({
        role: { normalizedName: SystemRoleNames.ClientPortal.toUpperCase() },
        user: { fullName: 'Client' },
      }),
    };
    const dossiers = { getAccessibleEntity: jest.fn().mockResolvedValue({}) };
    const service = new ClientPortalService(
      messages as never,
      {} as never,
      {} as never,
      memberships as never,
      {} as never,
      dossiers as never,
      {} as never,
      {} as never,
    );
    return { service, messages, builder };
  }

  function message(id: string, minute: number) {
    return {
      id,
      dossierId: 'dossier',
      senderUserId: 'user',
      senderRole: 'Propriétaire',
      body: id,
      sender: { fullName: 'Owner' },
      clientReadAtUtc: null,
      cabinetReadAtUtc: null,
      createdAtUtc: new Date(Date.UTC(2026, 10, 25, 10, minute)),
    } as unknown as ClientPortalMessage;
  }

  it('loads the most recent messages and returns them oldest first', async () => {
    // The repository returns the newest first because of the DESC order.
    const { service, messages } = setup([
      message('third', 3),
      message('second', 2),
      message('first', 1),
    ]);

    const result = await service.list('org', 'dossier', 'user');

    expect(messages.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { createdAtUtc: 'DESC', id: 'DESC' },
        take: ClientPortalService.conversationLimit,
      }),
    );
    expect(result.map((item) => item.id)).toEqual(['first', 'second', 'third']);
  });

  it('marks the conversation as read for the client side', async () => {
    const { service, builder } = setup([message('first', 1)]);

    await service.list('org', 'dossier', 'user');

    const [values] = builder.set.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(values)).toEqual(['clientReadAtUtc']);
    expect(values.clientReadAtUtc).toBeInstanceOf(Date);
    expect(builder.andWhere).toHaveBeenCalledWith('client_read_at_utc IS NULL');
  });
});
