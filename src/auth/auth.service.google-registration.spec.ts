import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AuditLog,
  ExternalIdentityProvider,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  PasswordResetToken,
  RefreshToken,
  Role,
  RolePermission,
  User,
  UserExternalIdentity,
} from '../database/entities';
import type { InvitationMailerService } from '../email/invitation-mailer.service';
import { AuthService } from './auth.service';
import type { GoogleIdentityService } from './google-identity.service';

const googleProfile = {
  subject: 'google-subject-123',
  email: 'new.owner@gmail.com',
  normalizedEmail: 'NEW.OWNER@GMAIL.COM',
  fullName: 'New Owner',
  hostedDomain: null,
};

function makeService(manager: Record<string, jest.Mock>) {
  const dataSource = {
    transaction: jest.fn(
      (work: (entityManager: EntityManager) => Promise<unknown>) =>
        work(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('access-token'),
  } as unknown as JwtService;
  const config = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
    getOrThrow: jest.fn().mockReturnValue('test-signing-key'),
  } as unknown as ConfigService;
  const refreshTokens = {
    create: jest.fn((value: object) => ({ id: 'refresh-1', ...value })),
  } as unknown as Repository<RefreshToken>;
  const verifyGoogleIdentity = jest.fn().mockResolvedValue(googleProfile);
  const googleIdentity = {
    verify: verifyGoogleIdentity,
  } as unknown as GoogleIdentityService;

  const service = new AuthService(
    dataSource,
    jwtService,
    config,
    {} as Repository<User>,
    refreshTokens,
    {} as Repository<OrganizationInvitation>,
    {} as Repository<PasswordResetToken>,
    {} as InvitationMailerService,
    googleIdentity,
  );

  return { service, dataSource, verifyGoogleIdentity };
}

describe('AuthService Google registration', () => {
  it('returns a verified onboarding profile without creating data for an unknown user', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    const { service } = makeService(manager);

    await expect(
      service.googleLogin({ credential: 'verified-google-token' }),
    ).resolves.toEqual({
      registrationRequired: true,
      profile: {
        email: googleProfile.email,
        fullName: googleProfile.fullName,
      },
    });
    expect(manager.findOne).toHaveBeenCalledWith(UserExternalIdentity, {
      where: {
        provider: ExternalIdentityProvider.Google,
        providerSubject: googleProfile.subject,
      },
      relations: { user: true },
    });
  });

  it('creates an isolated cabinet and owner membership after Google re-verification', async () => {
    const created: Array<{ entity: unknown; value: Record<string, unknown> }> =
      [];
    let roleSequence = 0;
    let organization: Record<string, unknown> | null = null;
    let ownerRole: Record<string, unknown> | null = null;
    let membership: Record<string, unknown> | null = null;

    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      existsBy: jest.fn().mockResolvedValue(false),
      create: jest.fn((entity: unknown, value: Record<string, unknown>) => {
        let result: Record<string, unknown> = { ...value };
        if (entity === User) {
          result = {
            id: 'user-1',
            isActive: true,
            isPlatformAdmin: false,
            ...result,
          };
        } else if (entity === Organization) {
          result = {
            id: 'organization-1',
            isActive: true,
            emailIngestionKey: 'ingestion-key',
            ...result,
          };
          organization = result;
        } else if (entity === Role) {
          roleSequence += 1;
          result = { id: `role-${roleSequence}`, ...result };
          if (value.name === 'Propriétaire') ownerRole = result;
        } else if (entity === OrganizationMembership) {
          result = { id: 'membership-1', isActive: true, ...result };
          membership = result;
        }
        created.push({ entity, value: result });
        return result;
      }),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
      find: jest.fn(() =>
        Promise.resolve([
          {
            ...membership,
            organization,
            role: ownerRole,
          },
        ]),
      ),
    };
    const { service, verifyGoogleIdentity } = makeService(manager);

    const response = await service.googleRegister({
      credential: 'verified-google-token',
      fullName: ' New Owner ',
      organizationName: ' Cabinet Nouveau ',
      acceptedTerms: true,
    });

    expect(verifyGoogleIdentity).toHaveBeenCalledWith('verified-google-token');
    expect(response).toMatchObject({
      accessToken: 'access-token',
      user: {
        id: 'user-1',
        email: googleProfile.email,
        fullName: 'New Owner',
      },
      organizations: [
        {
          id: 'organization-1',
          name: 'Cabinet Nouveau',
          role: 'Propriétaire',
        },
      ],
    });
    expect(
      created.some(
        ({ entity, value }) =>
          entity === UserExternalIdentity &&
          value.providerSubject === googleProfile.subject,
      ),
    ).toBe(true);
    expect(
      created.some(
        ({ entity, value }) =>
          entity === OrganizationMembership && value.userId === 'user-1',
      ),
    ).toBe(true);
    expect(
      created
        .filter(({ entity }) => entity === AuditLog)
        .map(({ value }) => value.action),
    ).toEqual(
      expect.arrayContaining([
        'organization.created',
        'auth.google_registered',
      ]),
    );
    expect(
      created.filter(({ entity }) => entity === RolePermission).length,
    ).toBeGreaterThan(0);
  });
});
