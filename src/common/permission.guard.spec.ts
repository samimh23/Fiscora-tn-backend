import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Repository } from 'typeorm';
import type { OrganizationMembership } from '../database/entities';
import { PermissionGuard } from './permission.guard';

function context(): ExecutionContext {
  return {
    getHandler: () => context,
    getClass: () => PermissionGuard,
    switchToHttp: () => ({
      getRequest: () => ({
        params: { organizationId: 'organization-id' },
        user: { userId: 'user-id' },
      }),
    }),
  } as unknown as ExecutionContext;
}

function guardFor(required: string | string[], granted: string[]) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  const memberships = {
    findOne: jest.fn().mockResolvedValue({
      role: {
        rolePermissions: granted.map((permissionName) => ({ permissionName })),
      },
    }),
  } as unknown as Repository<OrganizationMembership>;
  return new PermissionGuard(reflector, memberships);
}

describe('PermissionGuard', () => {
  it('preserves single-permission checks', async () => {
    await expect(
      guardFor('accounting.view', ['accounting.view']).canActivate(context()),
    ).resolves.toBe(true);
  });

  it('requires every permission declared by RequireAllPermissions', async () => {
    await expect(
      guardFor(
        ['bank_reconciliation.manage', 'accounting.post'],
        ['bank_reconciliation.manage', 'accounting.post'],
      ).canActivate(context()),
    ).resolves.toBe(true);
  });

  it('rejects a user missing one required permission', async () => {
    await expect(
      guardFor(
        ['bank_reconciliation.manage', 'accounting.post'],
        ['bank_reconciliation.manage'],
      ).canActivate(context()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
