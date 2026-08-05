import 'dotenv/config';
import { hash } from 'bcryptjs';
import dataSource from '../database/data-source';
import {
  AuditLog,
  Organization,
  OrganizationMembership,
  Role,
  RolePermission,
  User,
} from '../database/entities';
import {
  clientPortalPermissions,
  collaboratorPermissions,
  ownerPermissions,
  SystemRoleNames,
} from '../database/permissions';

const DEFAULT_PASSWORD = process.env.TEST_ACCOUNT_PASSWORD;

const demoAccounts = [
  {
    email: 'admin@fiscora.me',
    fullName: 'Sami Admin Fiscora',
    organizationName: 'Fiscora Administration',
    slug: 'fiscora-administration',
    isPlatformAdmin: true,
  },
  {
    email: 'cabinet@fiscora.me',
    fullName: 'Sami Cabinet Demo',
    organizationName: 'Cabinet Démo Fiscora',
    slug: 'cabinet-demo-fiscora',
    isPlatformAdmin: false,
  },
] as const;

async function main() {
  await dataSource.initialize();
  try {
    await dataSource.runMigrations({ transaction: 'all' });
    if (!DEFAULT_PASSWORD || DEFAULT_PASSWORD.length < 10) {
      throw new Error(
        'Set TEST_ACCOUNT_PASSWORD to a local-only password of at least 10 characters before creating demo accounts.',
      );
    }
    const passwordHash = await hash(DEFAULT_PASSWORD, 12);

    const results = await dataSource.transaction(async (manager) => {
      const createdOrUpdated = [];
      for (const account of demoAccounts) {
        const user = await upsertUser(manager, account, passwordHash);
        const organization = await upsertOrganization(manager, account);
        const ownerRole = await upsertSystemRoles(manager, organization.id);
        await upsertMembership(manager, organization.id, user.id, ownerRole.id);
        await manager.save(
          manager.create(AuditLog, {
            organizationId: organization.id,
            actorUserId: user.id,
            action: 'dev.test_account.upserted',
            entityType: 'User',
            entityId: user.id,
            detailsJson: {
              email: user.email,
              isPlatformAdmin: account.isPlatformAdmin,
              source: 'create-test-accounts',
            },
          }),
        );
        createdOrUpdated.push({
          email: user.email,
          fullName: user.fullName,
          organization: organization.name,
          isPlatformAdmin: user.isPlatformAdmin,
        });
      }
      return createdOrUpdated;
    });

    console.log('Comptes de test prêts :');
    for (const result of results) {
      console.log(
        `- ${result.email} | ${result.fullName} | ${result.organization} | ${
          result.isPlatformAdmin ? 'admin plateforme' : 'cabinet'
        }`,
      );
    }
    console.log(`Mot de passe local : ${DEFAULT_PASSWORD}`);
  } finally {
    await dataSource.destroy();
  }
}

async function upsertUser(
  manager: typeof dataSource.manager,
  account: (typeof demoAccounts)[number],
  passwordHash: string,
) {
  const normalizedEmail = normalizeEmail(account.email);
  let user = await manager.findOneBy(User, { normalizedEmail });
  if (!user) {
    user = manager.create(User, {
      email: account.email,
      normalizedEmail,
      fullName: account.fullName,
      passwordHash,
      emailVerified: true,
      isActive: true,
      isPlatformAdmin: account.isPlatformAdmin,
    });
  } else {
    user.fullName = account.fullName;
    user.passwordHash = passwordHash;
    user.emailVerified = true;
    user.isActive = true;
    user.disabledAtUtc = null;
    user.disabledReason = null;
    user.disabledByUserId = null;
    if (account.isPlatformAdmin) user.isPlatformAdmin = true;
  }
  return manager.save(user);
}

async function upsertOrganization(
  manager: typeof dataSource.manager,
  account: (typeof demoAccounts)[number],
) {
  let organization = await manager.findOneBy(Organization, {
    slug: account.slug,
  });
  if (!organization) {
    organization = manager.create(Organization, {
      name: account.organizationName,
      slug: account.slug,
      isActive: true,
    });
  } else {
    organization.name = account.organizationName;
    organization.isActive = true;
    organization.suspendedAtUtc = null;
    organization.suspensionReason = null;
    organization.suspendedByUserId = null;
  }
  return manager.save(organization);
}

async function upsertSystemRoles(
  manager: typeof dataSource.manager,
  organizationId: string,
) {
  const owner = await upsertRole(
    manager,
    organizationId,
    SystemRoleNames.Owner,
    ownerPermissions,
  );
  await upsertRole(
    manager,
    organizationId,
    SystemRoleNames.Collaborator,
    collaboratorPermissions,
  );
  await upsertRole(
    manager,
    organizationId,
    SystemRoleNames.ClientPortal,
    clientPortalPermissions,
  );
  return owner;
}

async function upsertRole(
  manager: typeof dataSource.manager,
  organizationId: string,
  name: string,
  permissions: readonly string[],
) {
  let role = await manager.findOneBy(Role, {
    organizationId,
    normalizedName: name.toUpperCase(),
  });
  if (!role) {
    role = await manager.save(
      manager.create(Role, {
        organizationId,
        name,
        normalizedName: name.toUpperCase(),
        isSystem: true,
      }),
    );
  } else {
    role.name = name;
    role.isSystem = true;
    await manager.save(role);
  }

  for (const permissionName of permissions) {
    await manager.query(
      `
        INSERT INTO "accounting"."role_permissions"
          ("role_id", "permission_name")
        VALUES ($1::uuid, $2)
        ON CONFLICT ("role_id", "permission_name") DO NOTHING
      `,
      [role.id, permissionName],
    );
  }
  return role;
}

async function upsertMembership(
  manager: typeof dataSource.manager,
  organizationId: string,
  userId: string,
  roleId: string,
) {
  let membership = await manager.findOneBy(OrganizationMembership, {
    organizationId,
    userId,
  });
  if (!membership) {
    membership = manager.create(OrganizationMembership, {
      organizationId,
      userId,
      roleId,
      isActive: true,
    });
  } else {
    membership.roleId = roleId;
    membership.isActive = true;
  }
  return manager.save(membership);
}

function normalizeEmail(email: string) {
  return email.trim().toUpperCase();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
