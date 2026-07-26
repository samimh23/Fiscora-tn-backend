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
  RefreshToken,
  Role,
  RolePermission,
  User,
} from '../database/entities';
import {
  collaboratorPermissions,
  clientPortalPermissions,
  ownerPermissions,
  SystemRoleNames,
} from '../database/permissions';
import {
  AcceptInvitationDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RevokeTokenDto,
} from './dto';

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
      return this.issueTokens(manager, user);
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
    user.lastLoginAtUtc = new Date();
    await this.users.save(user);
    return this.issueTokens(this.dataSource.manager, user);
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
      return this.issueTokens(manager, user);
    });
  }

  async me(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      organizations: await this.organizationSummaries(
        this.dataSource.manager,
        user.id,
      ),
    };
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
