import { PATH_METADATA } from '@nestjs/common/constants';
import {
  collaboratorPermissions,
  isAvailablePermission,
  ownerPermissions,
  permissionSeed,
} from '../database/permissions';
import { PlatformSaasSubscriptionsController } from '../saas-subscriptions/saas-subscriptions.controller';
import { PlatformAdminController } from './platform-admin.controller';

function routes(controller: { prototype: object }): unknown[] {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map(
      (name) =>
        Reflect.getMetadata(
          PATH_METADATA,
          Object.getOwnPropertyDescriptor(controller.prototype, name)
            ?.value as object,
        ) as unknown,
    );
}

describe('retired platform features', () => {
  it('does not expose platform audit or SaaS analytics routes', () => {
    expect(routes(PlatformAdminController)).not.toContain('audit-logs');
    expect(routes(PlatformSaasSubscriptionsController)).not.toContain(
      'saas-analytics',
    );
  });

  it('does not advertise or accept legacy electronic invoicing grants', () => {
    expect(isAvailablePermission('electronic_invoices.view')).toBe(false);
    expect(isAvailablePermission('invoices.view')).toBe(true);
    expect(ownerPermissions.every(isAvailablePermission)).toBe(true);
    expect(collaboratorPermissions.every(isAvailablePermission)).toBe(true);
    expect(permissionSeed.every(([name]) => isAvailablePermission(name))).toBe(
      true,
    );
  });
});
