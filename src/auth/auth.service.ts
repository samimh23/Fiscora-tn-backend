import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import {
  AuditLog,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  PasswordResetToken,
  RefreshToken,
  Role,
  RolePermission,
  User,
  ExternalIdentityProvider,
  UserExternalIdentity,
} from '../database/entities';
import { InvitationMailerService } from '../email/invitation-mailer.service';
import {
  collaboratorPermissions,
  clientPortalPermissions,
  ownerPermissions,
  SystemRoleNames,
} from '../database/permissions';
import {
  AcceptInvitationDto,
  ChangePasswordDto,
  CompleteMfaLoginDto,
  ConfirmMfaSetupDto,
  GoogleLoginDto,
  GoogleRegisterDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestPasswordResetDto,
  RevokeTokenDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyMfaActionDto,
} from './dto';
import { GoogleIdentityService } from './google-identity.service';
import { MfaService } from './mfa.service';

interface MfaChallengePayload {
  sub: string;
  purpose: 'mfa_challenge';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(OrganizationInvitation)
    private readonly invitations: Repository<OrganizationInvitation>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokens: Repository<PasswordResetToken>,
    private readonly mailer: InvitationMailerService,
    private readonly googleIdentity: GoogleIdentityService,
    private readonly mfa: MfaService,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    if (await this.users.existsBy({ normalizedEmail })) {
      throw new ConflictException(
        'Un compte existe déjà avec cette adresse e-mail.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        email: dto.email.trim(),
        normalizedEmail,
        fullName: dto.fullName.trim(),
        passwordHash: await hash(dto.password, 12),
      });
      await manager.save(user);

      const organization = manager.create(Organization, {
        name: dto.organizationName.trim(),
        slug: await this.createUniqueSlug(manager, dto.organizationName),
      });
      await manager.save(organization);

      const owner = await this.createSystemRole(
        manager,
        organization.id,
        SystemRoleNames.Owner,
        ownerPermissions,
      );
      await this.createSystemRole(
        manager,
        organization.id,
        SystemRoleNames.Collaborator,
        collaboratorPermissions,
      );
      await this.createSystemRole(
        manager,
        organization.id,
        SystemRoleNames.ClientPortal,
        clientPortalPermissions,
      );
      await manager.save(
        manager.create(OrganizationMembership, {
          organizationId: organization.id,
          userId: user.id,
          roleId: owner.id,
        }),
      );
      await manager.save(
        manager.create(AuditLog, {
          organizationId: organization.id,
          actorUserId: user.id,
          action: 'organization.created',
          entityType: 'Organization',
          entityId: organization.id,
          detailsJson: null,
        }),
      );
      if (user.mfaEnabled) return this.createMfaChallenge(user);
      return this.completeLogin(manager, user);
    });
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOneBy({
      normalizedEmail: this.normalizeEmail(dto.email),
    });
    if (
      !user ||
      !user.isActive ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException(
        'Adresse e-mail ou mot de passe incorrect.',
      );
    }
    if (user.mfaEnabled) return this.createMfaChallenge(user);
    return this.completeLogin(this.dataSource.manager, user);
  }

  async googleLogin(dto: GoogleLoginDto) {
    const google = await this.googleIdentity.verify(dto.credential);

    return this.dataSource.transaction(async (manager) => {
      const linkedIdentity = await manager.findOne(UserExternalIdentity, {
        where: {
          provider: ExternalIdentityProvider.Google,
          providerSubject: google.subject,
        },
        relations: { user: true },
      });

      let user = linkedIdentity?.user ?? null;
      if (!user) {
        user = await manager.findOneBy(User, {
          normalizedEmail: google.normalizedEmail,
        });
        if (!user) {
          return {
            registrationRequired: true as const,
            profile: {
              email: google.email,
              fullName: google.fullName,
            },
          };
        }

        const otherGoogleIdentity = await manager.findOneBy(
          UserExternalIdentity,
          {
            provider: ExternalIdentityProvider.Google,
            userId: user.id,
          },
        );
        if (otherGoogleIdentity) {
          throw new ConflictException(
            'Ce compte Fiscora est déjà associé à un autre compte Google.',
          );
        }

        await manager.save(
          manager.create(UserExternalIdentity, {
            userId: user.id,
            provider: ExternalIdentityProvider.Google,
            providerSubject: google.subject,
            providerEmail: google.email,
            hostedDomain: google.hostedDomain,
            lastAuthenticatedAtUtc: new Date(),
          }),
        );
        await manager.save(
          manager.create(AuditLog, {
            organizationId: null,
            actorUserId: user.id,
            action: 'auth.google_linked',
            entityType: 'User',
            entityId: user.id,
            detailsJson: {
              provider: ExternalIdentityProvider.Google,
              providerEmail: google.email,
            },
          }),
        );
      } else if (linkedIdentity) {
        linkedIdentity.providerEmail = google.email;
        linkedIdentity.hostedDomain = google.hostedDomain;
        linkedIdentity.lastAuthenticatedAtUtc = new Date();
        await manager.save(linkedIdentity);
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Ce compte Fiscora est désactivé.');
      }
      user.emailVerified = true;
      await manager.save(user);
      if (user.mfaEnabled) return this.createMfaChallenge(user);
      return this.completeLogin(manager, user);
    });
  }

  async googleRegister(dto: GoogleRegisterDto) {
    const google = await this.googleIdentity.verify(dto.credential);

    return this.dataSource.transaction(async (manager) => {
      const linkedIdentity = await manager.findOne(UserExternalIdentity, {
        where: {
          provider: ExternalIdentityProvider.Google,
          providerSubject: google.subject,
        },
        relations: { user: true },
      });
      if (linkedIdentity?.user) {
        if (!linkedIdentity.user.isActive) {
          throw new UnauthorizedException('Ce compte Fiscora est désactivé.');
        }
        linkedIdentity.lastAuthenticatedAtUtc = new Date();
        await manager.save(linkedIdentity);
        await manager.save(linkedIdentity.user);
        if (linkedIdentity.user.mfaEnabled) {
          return this.createMfaChallenge(linkedIdentity.user);
        }
        return this.completeLogin(manager, linkedIdentity.user);
      }

      if (
        await manager.existsBy(User, {
          normalizedEmail: google.normalizedEmail,
        })
      ) {
        throw new ConflictException(
          'Un compte Fiscora existe déjà avec cette adresse. Recommencez la connexion Google pour l’associer.',
        );
      }

      const user = manager.create(User, {
        email: google.email,
        normalizedEmail: google.normalizedEmail,
        fullName: dto.fullName.trim(),
        // A Google-only account has no usable local password. The random hash
        // keeps the existing non-null schema and password-reset flow intact.
        passwordHash: await hash(randomBytes(64).toString('base64url'), 12),
        emailVerified: true,
        lastLoginAtUtc: new Date(),
      });
      await manager.save(user);

      await manager.save(
        manager.create(UserExternalIdentity, {
          userId: user.id,
          provider: ExternalIdentityProvider.Google,
          providerSubject: google.subject,
          providerEmail: google.email,
          hostedDomain: google.hostedDomain,
          lastAuthenticatedAtUtc: new Date(),
        }),
      );

      const organization = manager.create(Organization, {
        name: dto.organizationName.trim(),
        slug: await this.createUniqueSlug(manager, dto.organizationName),
      });
      await manager.save(organization);

      const owner = await this.createSystemRole(
        manager,
        organization.id,
        SystemRoleNames.Owner,
        ownerPermissions,
      );
      await this.createSystemRole(
        manager,
        organization.id,
        SystemRoleNames.Collaborator,
        collaboratorPermissions,
      );
      await this.createSystemRole(
        manager,
        organization.id,
        SystemRoleNames.ClientPortal,
        clientPortalPermissions,
      );
      await manager.save(
        manager.create(OrganizationMembership, {
          organizationId: organization.id,
          userId: user.id,
          roleId: owner.id,
        }),
      );
      await manager.save(
        manager.create(AuditLog, {
          organizationId: organization.id,
          actorUserId: user.id,
          action: 'organization.created',
          entityType: 'Organization',
          entityId: organization.id,
          detailsJson: {
            creationMethod: 'GOOGLE',
            termsVersion: '2026-09-16',
          },
        }),
      );
      await manager.save(
        manager.create(AuditLog, {
          organizationId: organization.id,
          actorUserId: user.id,
          action: 'auth.google_registered',
          entityType: 'User',
          entityId: user.id,
          detailsJson: { providerEmail: google.email },
        }),
      );

      return this.issueTokens(manager, user);
    });
  }

  async completeMfaLogin(dto: CompleteMfaLoginDto) {
    const payload = await this.verifyMfaChallenge(dto.challengeToken);
    const outcome = await this.dataSource.transaction(async (manager) => {
      const verified = await this.consumeMfaCredential(
        manager,
        payload.sub,
        dto.code,
      );
      if (!verified.ok) return verified;
      const response = await this.completeLogin(manager, verified.user);
      await this.writeMfaAudit(
        manager,
        verified.user.id,
        verified.method === 'recovery'
          ? 'auth.mfa_recovery_login'
          : 'auth.mfa_login',
      );
      return { ok: true as const, response };
    });
    if (!outcome.ok) throw new UnauthorizedException(outcome.message);
    return outcome.response;
  }

  async mfaStatus(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    return {
      enabled: user.mfaEnabled,
      enabledAtUtc: user.mfaEnabledAtUtc,
      recoveryCodesRemaining: user.mfaRecoveryCodeHashes?.length ?? 0,
    };
  }

  async beginMfaSetup(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (user.mfaEnabled) {
      throw new ConflictException(
        'La double authentification est déjà activée.',
      );
    }
    const secret = this.mfa.generateSecret();
    const otpAuthUri = this.mfa.buildOtpAuthUri(user.email, secret);
    user.mfaPendingSecretEncrypted = this.mfa.encryptSecret(secret);
    await this.users.save(user);
    return {
      secret,
      otpAuthUri,
      qrCodeDataUrl: await this.mfa.toQrCodeDataUrl(otpAuthUri),
    };
  }

  async confirmMfaSetup(userId: string, dto: ConfirmMfaSetupDto) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user?.mfaPendingSecretEncrypted) {
        throw new BadRequestException(
          'Commencez d’abord la configuration de la double authentification.',
        );
      }
      if (user.mfaEnabled) {
        throw new ConflictException(
          'La double authentification est déjà activée.',
        );
      }

      const secret = this.mfa.decryptSecret(user.mfaPendingSecretEncrypted);
      const step = this.mfa.findMatchingTotpStep(secret, dto.code);
      if (step === null) {
        throw new BadRequestException(
          'Le code de vérification est incorrect ou expiré.',
        );
      }

      const recoveryCodes = this.mfa.generateRecoveryCodes();
      user.mfaEnabled = true;
      user.mfaSecretEncrypted = user.mfaPendingSecretEncrypted;
      user.mfaPendingSecretEncrypted = null;
      user.mfaRecoveryCodeHashes = recoveryCodes.map((code) =>
        this.mfa.hashRecoveryCode(code),
      );
      user.mfaLastAcceptedStep = String(step);
      user.mfaFailedAttempts = 0;
      user.mfaLockedUntilUtc = null;
      user.mfaEnabledAtUtc = new Date();
      await manager.save(user);
      await this.writeMfaAudit(manager, user.id, 'auth.mfa_enabled');
      return {
        message: 'La double authentification est activée.',
        recoveryCodes,
      };
    });
  }

  async regenerateMfaRecoveryCodes(userId: string, dto: VerifyMfaActionDto) {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const verified = await this.consumeMfaCredential(
        manager,
        userId,
        dto.code,
      );
      if (!verified.ok) return verified;
      const recoveryCodes = this.mfa.generateRecoveryCodes();
      verified.user.mfaRecoveryCodeHashes = recoveryCodes.map((code) =>
        this.mfa.hashRecoveryCode(code),
      );
      await manager.save(verified.user);
      await this.writeMfaAudit(
        manager,
        userId,
        'auth.mfa_recovery_codes_regenerated',
      );
      return { ok: true as const, recoveryCodes };
    });
    if (!outcome.ok) throw new UnauthorizedException(outcome.message);
    return { recoveryCodes: outcome.recoveryCodes };
  }

  async disableMfa(userId: string, dto: VerifyMfaActionDto) {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const verified = await this.consumeMfaCredential(
        manager,
        userId,
        dto.code,
      );
      if (!verified.ok) return verified;

      verified.user.mfaEnabled = false;
      verified.user.mfaSecretEncrypted = null;
      verified.user.mfaPendingSecretEncrypted = null;
      verified.user.mfaRecoveryCodeHashes = null;
      verified.user.mfaLastAcceptedStep = null;
      verified.user.mfaFailedAttempts = 0;
      verified.user.mfaLockedUntilUtc = null;
      verified.user.mfaEnabledAtUtc = null;
      await manager.save(verified.user);
      await manager.update(
        RefreshToken,
        { userId, revokedAtUtc: IsNull() },
        { revokedAtUtc: new Date() },
      );
      await this.writeMfaAudit(manager, userId, 'auth.mfa_disabled');
      return { ok: true as const };
    });
    if (!outcome.ok) throw new UnauthorizedException(outcome.message);
    return {
      message:
        'La double authentification est désactivée. Toutes les sessions ont été révoquées.',
    };
  }

  async refresh(dto: RefreshDto) {
    const tokenHash = this.hashToken(dto.refreshToken);
    const current = await this.refreshTokens.findOne({
      where: { tokenHash },
      relations: { user: true },
    });
    if (
      !current ||
      current.revokedAtUtc ||
      current.expiresAtUtc <= new Date() ||
      !current.user.isActive
    ) {
      throw new UnauthorizedException(
        'Le jeton de renouvellement est invalide ou expiré.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const { rawToken, entity } = this.createRefreshToken(current.userId);
      const updated = await manager.update(
        RefreshToken,
        { id: current.id, revokedAtUtc: null },
        { revokedAtUtc: new Date(), replacedByTokenId: entity.id },
      );
      if (!updated.affected) {
        throw new UnauthorizedException(
          'Le jeton de renouvellement est invalide ou expiré.',
        );
      }
      await manager.save(entity);
      return this.buildResponse(manager, current.user, rawToken);
    });
  }

  async requestPasswordReset(
    dto: RequestPasswordResetDto,
    requestedIp?: string,
  ) {
    const user = await this.users.findOneBy({
      normalizedEmail: this.normalizeEmail(dto.email),
    });
    const message =
      'Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d’être envoyé.';

    if (!user?.isActive) return { message };

    const rawToken = randomBytes(48).toString('base64url');
    const expiresAtUtc = new Date(
      Date.now() +
        Number(this.config.get('PASSWORD_RESET_MINUTES', 30)) * 60_000,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        PasswordResetToken,
        { userId: user.id, usedAtUtc: IsNull() },
        { usedAtUtc: new Date() },
      );
      await manager.save(
        manager.create(PasswordResetToken, {
          userId: user.id,
          tokenHash: this.hashToken(rawToken),
          expiresAtUtc,
          usedAtUtc: null,
          requestedIp: requestedIp?.slice(0, 80) ?? null,
        }),
      );
      await manager.save(
        manager.create(AuditLog, {
          organizationId: null,
          actorUserId: user.id,
          action: 'auth.password_reset_requested',
          entityType: 'User',
          entityId: user.id,
          detailsJson: { requestedIp: requestedIp ?? null },
        }),
      );
    });

    try {
      await this.mailer.sendPasswordReset({
        recipient: user.email,
        fullName: user.fullName,
        token: rawToken,
        expiresAtUtc,
      });
    } catch {
      // Keep the public response generic; delivery failures are visible in email logs.
    }

    return { message };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetToken = await this.passwordResetTokens.findOne({
      where: { tokenHash: this.hashToken(dto.token) },
      relations: { user: true },
    });
    if (
      !resetToken ||
      resetToken.usedAtUtc ||
      resetToken.expiresAtUtc <= new Date() ||
      !resetToken.user.isActive
    ) {
      throw new BadRequestException(
        'Le lien de réinitialisation est invalide ou expiré.',
      );
    }
    if (await compare(dto.newPassword, resetToken.user.passwordHash)) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit être différent du mot de passe actuel.',
      );
    }

    resetToken.user.passwordHash = await hash(dto.newPassword, 12);
    resetToken.user.emailVerified = true;
    resetToken.usedAtUtc = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(resetToken.user);
      await manager.save(resetToken);
      await manager.update(
        RefreshToken,
        { userId: resetToken.userId, revokedAtUtc: IsNull() },
        { revokedAtUtc: new Date() },
      );
      await manager.save(
        manager.create(AuditLog, {
          organizationId: null,
          actorUserId: resetToken.userId,
          action: 'auth.password_reset_completed',
          entityType: 'User',
          entityId: resetToken.userId,
          detailsJson: null,
        }),
      );
    });

    return {
      message:
        'Mot de passe réinitialisé. Vous pouvez maintenant vous connecter.',
    };
  }

  async revoke(dto: RevokeTokenDto): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: this.hashToken(dto.refreshToken), revokedAtUtc: IsNull() },
      { revokedAtUtc: new Date() },
    );
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const invitation = await this.invitations.findOne({
      where: { tokenHash: this.hashToken(dto.token) },
      relations: { role: true, organization: true },
    });
    if (
      !invitation ||
      invitation.acceptedAtUtc ||
      invitation.revokedAtUtc ||
      invitation.expiresAtUtc <= new Date()
    ) {
      throw new BadRequestException('L’invitation est invalide ou expirée.');
    }

    return this.dataSource.transaction(async (manager) => {
      let user = await manager.findOneBy(User, {
        normalizedEmail: invitation.normalizedEmail,
      });
      if (!user) {
        user = manager.create(User, {
          email: invitation.email,
          normalizedEmail: invitation.normalizedEmail,
          fullName: dto.fullName.trim(),
          passwordHash: await hash(dto.password, 12),
        });
        await manager.save(user);
      } else if (
        !user.isActive ||
        !(await compare(dto.password, user.passwordHash))
      ) {
        throw new UnauthorizedException(
          'Le mot de passe du compte existant est incorrect.',
        );
      }

      const membership = await manager.findOneBy(OrganizationMembership, {
        organizationId: invitation.organizationId,
        userId: user.id,
      });
      if (!membership) {
        await manager.save(
          manager.create(OrganizationMembership, {
            organizationId: invitation.organizationId,
            userId: user.id,
            roleId: invitation.roleId,
          }),
        );
      }
      invitation.acceptedAtUtc = new Date();
      await manager.save(invitation);
      await manager.save(
        manager.create(AuditLog, {
          organizationId: invitation.organizationId,
          actorUserId: user.id,
          action: 'invitation.accepted',
          entityType: 'OrganizationInvitation',
          entityId: invitation.id,
          detailsJson: null,
        }),
      );
      if (user.mfaEnabled) return this.createMfaChallenge(user);
      return this.completeLogin(manager, user);
    });
  }

  async previewInvitation(token: string) {
    const invitation = await this.invitations.findOne({
      where: { tokenHash: this.hashToken(token) },
      relations: { role: true, organization: true },
    });
    const now = new Date();
    const isInvalid =
      !invitation ||
      Boolean(invitation.revokedAtUtc) ||
      Boolean(invitation.acceptedAtUtc) ||
      invitation.expiresAtUtc <= now;
    if (isInvalid) {
      throw new BadRequestException('L’invitation est invalide ou expirée.');
    }

    const existingUser = await this.users.findOne({
      where: { normalizedEmail: invitation.normalizedEmail },
      select: {
        id: true,
        fullName: true,
        normalizedEmail: true,
      },
    });

    return {
      email: invitation.email,
      organizationName: invitation.organization.name,
      roleName: invitation.role.name,
      expiresAtUtc: invitation.expiresAtUtc,
      accountExists: Boolean(existingUser),
      existingFullName: existingUser?.fullName ?? null,
    };
  }

  async me(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isPlatformAdmin: user.isPlatformAdmin,
      mfaEnabled: user.mfaEnabled,
      organizations: await this.organizationSummaries(
        this.dataSource.manager,
        user.id,
      ),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.users.findOneByOrFail({ id: userId });
    user.fullName = dto.fullName.trim();
    await this.users.save(user);
    return this.me(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (!(await compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect.');
    }
    if (await compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit être différent du mot de passe actuel.',
      );
    }
    user.passwordHash = await hash(dto.newPassword, 12);
    await this.dataSource.transaction(async (manager) => {
      await manager.save(user);
      await manager.update(
        RefreshToken,
        { userId, revokedAtUtc: IsNull() },
        { revokedAtUtc: new Date() },
      );
    });
    return {
      message:
        'Mot de passe modifié. Toutes les sessions devront se reconnecter à l’expiration de leur jeton d’accès.',
    };
  }

  private async createMfaChallenge(user: User) {
    const minutes = Number(this.config.get('MFA_CHALLENGE_MINUTES', 5));
    const expiresAtUtc = new Date(Date.now() + minutes * 60_000);
    const challengeToken = await this.jwtService.signAsync(
      { sub: user.id, purpose: 'mfa_challenge' },
      {
        secret: this.config.getOrThrow<string>('JWT_SIGNING_KEY'),
        issuer: this.config.get('JWT_ISSUER', 'accounting-platform'),
        audience: this.config.get('JWT_AUDIENCE', 'accounting-platform-api'),
        expiresIn: `${minutes}m`,
      },
    );
    return {
      mfaRequired: true as const,
      challengeToken,
      expiresAtUtc,
    };
  }

  private async verifyMfaChallenge(
    challengeToken: string,
  ): Promise<MfaChallengePayload> {
    try {
      const payload = await this.jwtService.verifyAsync<MfaChallengePayload>(
        challengeToken,
        {
          secret: this.config.getOrThrow<string>('JWT_SIGNING_KEY'),
          issuer: this.config.get('JWT_ISSUER', 'accounting-platform'),
          audience: this.config.get('JWT_AUDIENCE', 'accounting-platform-api'),
        },
      );
      if (payload.purpose !== 'mfa_challenge' || !payload.sub) {
        throw new Error('Invalid MFA challenge');
      }
      return payload;
    } catch {
      throw new UnauthorizedException(
        'La demande MFA est invalide ou expirée. Reconnectez-vous.',
      );
    }
  }

  private async consumeMfaCredential(
    manager: EntityManager,
    userId: string,
    code: string,
  ): Promise<
    | { ok: true; user: User; method: 'totp' | 'recovery' }
    | { ok: false; message: string }
  > {
    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user?.isActive || !user.mfaEnabled || !user.mfaSecretEncrypted) {
      return {
        ok: false,
        message: 'La double authentification n’est pas disponible.',
      };
    }

    const now = new Date();
    if (user.mfaLockedUntilUtc && user.mfaLockedUntilUtc > now) {
      return {
        ok: false,
        message:
          'Trop de tentatives. Attendez quelques minutes avant de réessayer.',
      };
    }

    if (this.mfa.isRecoveryCode(code)) {
      const recoveryHash = this.mfa.hashRecoveryCode(code);
      const hashes = user.mfaRecoveryCodeHashes ?? [];
      const index = hashes.indexOf(recoveryHash);
      if (index >= 0) {
        user.mfaRecoveryCodeHashes = hashes.filter(
          (_, currentIndex) => currentIndex !== index,
        );
        user.mfaFailedAttempts = 0;
        user.mfaLockedUntilUtc = null;
        await manager.save(user);
        return { ok: true, user, method: 'recovery' };
      }
      return this.recordFailedMfaAttempt(manager, user);
    }

    const secret = this.mfa.decryptSecret(user.mfaSecretEncrypted);
    const step = this.mfa.findMatchingTotpStep(secret, code);
    const lastStep = user.mfaLastAcceptedStep
      ? Number(user.mfaLastAcceptedStep)
      : null;
    if (step === null || (lastStep !== null && step <= lastStep)) {
      return this.recordFailedMfaAttempt(manager, user);
    }

    user.mfaLastAcceptedStep = String(step);
    user.mfaFailedAttempts = 0;
    user.mfaLockedUntilUtc = null;
    await manager.save(user);
    return { ok: true, user, method: 'totp' };
  }

  private async recordFailedMfaAttempt(
    manager: EntityManager,
    user: User,
  ): Promise<{ ok: false; message: string }> {
    const maximumAttempts = Number(this.config.get('MFA_MAX_ATTEMPTS', 5));
    const lockMinutes = Number(this.config.get('MFA_LOCK_MINUTES', 10));
    user.mfaFailedAttempts = (user.mfaFailedAttempts ?? 0) + 1;
    if (user.mfaFailedAttempts >= maximumAttempts) {
      user.mfaLockedUntilUtc = new Date(Date.now() + lockMinutes * 60_000);
      user.mfaFailedAttempts = 0;
    }
    await manager.save(user);
    return {
      ok: false,
      message:
        user.mfaLockedUntilUtc && user.mfaLockedUntilUtc > new Date()
          ? 'Trop de tentatives. Le contrôle MFA est temporairement verrouillé.'
          : 'Le code d’authentification est incorrect, expiré ou déjà utilisé.',
    };
  }

  private async completeLogin(manager: EntityManager, user: User) {
    user.lastLoginAtUtc = new Date();
    await manager.save(user);
    return this.issueTokens(manager, user);
  }

  private async writeMfaAudit(
    manager: EntityManager,
    userId: string,
    action: string,
  ) {
    await manager.save(
      manager.create(AuditLog, {
        organizationId: null,
        actorUserId: userId,
        action,
        entityType: 'User',
        entityId: userId,
        detailsJson: null,
      }),
    );
  }

  private async createSystemRole(
    manager: EntityManager,
    organizationId: string,
    name: string,
    permissions: readonly string[],
  ) {
    const role = manager.create(Role, {
      organizationId,
      name,
      normalizedName: name.toUpperCase(),
      isSystem: true,
    });
    await manager.save(role);
    await manager.save(
      permissions.map((permissionName) =>
        manager.create(RolePermission, { roleId: role.id, permissionName }),
      ),
    );
    role.rolePermissions = permissions.map((permissionName) =>
      manager.create(RolePermission, { roleId: role.id, permissionName }),
    );
    return role;
  }

  private async issueTokens(manager: EntityManager, user: User) {
    const { rawToken, entity } = this.createRefreshToken(user.id);
    await manager.save(entity);
    return this.buildResponse(manager, user, rawToken);
  }

  private async buildResponse(
    manager: EntityManager,
    user: User,
    refreshToken: string,
  ) {
    const accessMinutes = Number(this.config.get('JWT_ACCESS_MINUTES', 30));
    const accessTokenExpiresAtUtc = new Date(
      Date.now() + accessMinutes * 60_000,
    );
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, name: user.fullName },
      {
        secret: this.config.getOrThrow<string>('JWT_SIGNING_KEY'),
        issuer: this.config.get('JWT_ISSUER', 'accounting-platform'),
        audience: this.config.get('JWT_AUDIENCE', 'accounting-platform-api'),
        expiresIn: `${accessMinutes}m`,
      },
    );
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAtUtc,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        isPlatformAdmin: user.isPlatformAdmin,
        mfaEnabled: user.mfaEnabled,
      },
      organizations: await this.organizationSummaries(manager, user.id),
    };
  }

  private async organizationSummaries(manager: EntityManager, userId: string) {
    const memberships = await manager.find(OrganizationMembership, {
      where: { userId, isActive: true, organization: { isActive: true } },
      relations: { organization: true, role: { rolePermissions: true } },
      order: { organization: { name: 'ASC' } },
    });
    return memberships.map((item) => ({
      id: item.organizationId,
      name: item.organization.name,
      slug: item.organization.slug,
      emailIngestionAddress: this.ingestionAddress(
        'o',
        item.organization.emailIngestionKey,
      ),
      role: item.role.name,
      permissions: item.role.rolePermissions
        .map((permission) => permission.permissionName)
        .sort(),
    }));
  }

  private createRefreshToken(userId: string) {
    const rawToken = randomBytes(64).toString('base64');
    const entity = this.refreshTokens.create({
      userId,
      tokenHash: this.hashToken(rawToken),
      expiresAtUtc: new Date(
        Date.now() +
          Number(this.config.get('JWT_REFRESH_DAYS', 14)) * 86_400_000,
      ),
      revokedAtUtc: null,
      replacedByTokenId: null,
    });
    return { rawToken, entity };
  }

  private ingestionAddress(prefix: 'o' | 'd', key: string) {
    const domain = this.config
      .get<string>('EMAIL_INGESTION_DOMAIN', 'inbox.fiscora.me')
      .trim()
      .toLowerCase();
    return `${prefix}-${key}@${domain}`;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex').toUpperCase();
  }

  private normalizeEmail(email: string) {
    return email.trim().toUpperCase();
  }

  private async createUniqueSlug(manager: EntityManager, name: string) {
    const base =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100) || 'organisation';
    let candidate = base;
    let suffix = 2;
    while (await manager.existsBy(Organization, { slug: candidate })) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }
}
