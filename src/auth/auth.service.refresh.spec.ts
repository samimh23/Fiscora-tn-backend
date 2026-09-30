import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EntityManager, FindOperator } from 'typeorm';
import { RefreshToken } from '../database/entities';
import { AuthService } from './auth.service';

describe('Auth refresh rotation', () => {
  function setup(overrides: Partial<RefreshToken> = {}, active = true) {
    const current = Object.assign(new RefreshToken(), {
      id: 'old-id',
      userId: 'user-id',
      revokedAtUtc: null,
      expiresAtUtc: new Date(Date.now() + 60_000),
      ...overrides,
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue(current),
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'user-id', isActive: active }),
      save: jest.fn((value: RefreshToken) =>
        Promise.resolve({ ...value, id: 'new-id' }),
      ),
      update: jest.fn(
        (_entity: unknown, _where: unknown, change: Partial<RefreshToken>) => {
          Object.assign(current, change);
          return Promise.resolve({ affected: 1 });
        },
      ),
      find: jest.fn().mockResolvedValue([]),
    };
    const config = {
      get: (_key: string, fallback: unknown) => fallback,
      getOrThrow: () => 'test-key',
    };
    const service = new AuthService(
      {
        transaction: (run: (m: EntityManager) => unknown) =>
          run(manager as unknown as EntityManager),
      } as never,
      {
        signAsync: jest.fn().mockResolvedValue('access'),
      } as unknown as JwtService,
      config as unknown as ConfigService,
      {} as never,
      {
        create: (value: Partial<RefreshToken>) =>
          Object.assign(new RefreshToken(), value),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, manager, current };
  }
  it('renews a fresh token and stores the generated replacement ID', async () => {
    const { service, manager, current } = setup();
    const result = await service.refresh({ refreshToken: 'test-token' });
    expect(result.accessToken).toBe('access');
    expect(result.refreshToken).not.toBe('test-token');
    expect(manager.findOne).toHaveBeenCalledWith(
      RefreshToken,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    const where = manager.update.mock.calls[0][1] as {
      revokedAtUtc: FindOperator<unknown>;
    };
    expect(where.revokedAtUtc.type).toBe('isNull');
    expect(current.replacedByTokenId).toBe('new-id');
    expect(manager.save.mock.invocationCallOrder[0]).toBeLessThan(
      manager.update.mock.invocationCallOrder[0],
    );
    await expect(
      service.refresh({ refreshToken: 'test-token' }),
    ).rejects.toThrow('invalide ou expiré');
    expect(manager.save).toHaveBeenCalledTimes(1);
  });
  it.each([{ revokedAtUtc: new Date() }, { expiresAtUtc: new Date(0) }])(
    'rejects invalid tokens without writing: %j',
    async (overrides) => {
      const { service, manager } = setup(overrides);
      await expect(
        service.refresh({ refreshToken: 'test-token' }),
      ).rejects.toThrow();
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it('rejects disabled users and unknown tokens', async () => {
    const { service, manager } = setup({}, false);
    await expect(
      service.refresh({ refreshToken: 'test-token' }),
    ).rejects.toThrow();
    manager.findOne.mockResolvedValue(null);
    await expect(
      service.refresh({ refreshToken: 'missing' }),
    ).rejects.toThrow();
    expect(manager.save).not.toHaveBeenCalled();
  });
});
