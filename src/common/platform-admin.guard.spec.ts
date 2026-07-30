import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';

function contextFor(isPlatformAdmin: boolean): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          userId: 'user-id',
          email: 'owner@fiscora.tn',
          fullName: 'Owner',
          isPlatformAdmin,
        },
      }),
    }),
  } as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('allows a platform administrator', () => {
    expect(guard.canActivate(contextFor(true))).toBe(true);
  });

  it('rejects a regular cabinet user', () => {
    expect(() => guard.canActivate(contextFor(false))).toThrow(
      ForbiddenException,
    );
  });
});
