import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  OrganizationInvitation,
  PasswordResetToken,
  RefreshToken,
  User,
} from '../database/entities';
import { InvitationMailerService } from '../email/invitation-mailer.service';
import { AuthService } from './auth.service';
import { GoogleIdentityService } from './google-identity.service';
import { MfaService } from './mfa.service';

describe('AuthService MFA replay protection', () => {
  it('accepts a TOTP time step once and rejects its reuse', async () => {
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'MFA_ENCRYPTION_KEY') {
          return 'test-only-mfa-encryption-key-with-more-than-32-characters';
        }
        return fallback;
      },
    } as ConfigService;
    const mfa = new MfaService(config);
    const service = new AuthService(
      {} as DataSource,
      {} as JwtService,
      config,
      {} as Repository<User>,
      {} as Repository<RefreshToken>,
      {} as Repository<OrganizationInvitation>,
      {} as Repository<PasswordResetToken>,
      {} as InvitationMailerService,
      {} as GoogleIdentityService,
      mfa,
    );
    const secret = mfa.generateSecret();
    const step = Math.floor(Date.now() / 1000 / 30);
    const code = (
      mfa as unknown as {
        totpForStep(value: string, currentStep: number): string;
      }
    ).totpForStep(secret, step);
    const user = Object.assign(new User(), {
      id: '28b5a541-f684-4cc8-9e6b-c466fdc46737',
      isActive: true,
      mfaEnabled: true,
      mfaSecretEncrypted: mfa.encryptSecret(secret),
      mfaRecoveryCodeHashes: [],
      mfaLastAcceptedStep: null,
      mfaFailedAttempts: 0,
      mfaLockedUntilUtc: null,
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn((value: User) => Promise.resolve(value)),
    } as unknown as EntityManager;
    const internal = service as unknown as {
      consumeMfaCredential(
        entityManager: EntityManager,
        userId: string,
        suppliedCode: string,
      ): Promise<{ ok: boolean; message?: string }>;
    };

    const first = await internal.consumeMfaCredential(manager, user.id, code);
    const replay = await internal.consumeMfaCredential(manager, user.id, code);

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(false);
    expect(replay.message).toContain('déjà utilisé');
    expect(user.mfaLastAcceptedStep).toBe(String(step));
  });
});
