import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  AuditLog,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  Permission,
  Role,
  RolePermission,
} from '../database/entities';
import { SystemRoleNames } from '../database/permissions';
import {
  CreateRoleDto,
  InvitationDto,
  UpdateMemberDto,
  UpdateRolePermissionsDto,
} from './dto';
import { InvitationMailerService } from '../email/invitation-mailer.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissions: Repository<Permission>,
    @InjectRepository(OrganizationInvitation)
    private readonly invitations: Repository<OrganizationInvitation>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    private readonly invitationMailer: InvitationMailerService,
  ) {}

  async getForUser(userId: string) {
    const memberships = await this.memberships.find({
      where: { userId, isActive: true, organization: { isActive: true } },
      relations: { organization: true, role: { rolePermissions: true } },
      order: { organization: { name: 'ASC' } },
    });
    return memberships.map((item) => this.toSummary(item));
  }

  async get(organizationId: string) {
    const organization = await this.organizations.findOneBy({
      id: organizationId,
    });
    if (!organization)
      throw new NotFoundException('L’organisation est introuvable.');
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isActive: organization.isActive,
    };
  }

  async getMembers(organizationId: string) {
    const memberships = await this.memberships.find({
      where: { organizationId },
      relations: { user: true, role: true },
      order: { user: { fullName: 'ASC' } },
    });
    return memberships.map((item) => this.toMember(item));
  }

  async getRoles(organizationId: string) {
    const roles = await this.roles.find({
      where: { organizationId },
      relations: { rolePermissions: true },
      order: { name: 'ASC' },
    });
    return roles.map((role) => this.toRole(role));
  }

  async getPermissions() {
    return this.permissions.find({ order: { name: 'ASC' } });
  }

  async getAuditLogs(organizationId: string, take: number) {
    const items = await this.auditLogs.find({
      where: { organizationId },
      order: { createdAtUtc: 'DESC' },
      take: Math.min(Math.max(take, 1), 200),
    });
    return items.map((item) => ({
      id: item.id,
      actorUserId: item.actorUserId,
      action: item.action,
      entityType: item.entityType,
      entityId: item.entityId,
      detailsJson: item.detailsJson ? JSON.stringify(item.detailsJson) : null,
      createdAtUtc: item.createdAtUtc,
    }));
  }

  async invite(
    organizationId: string,
    actorUserId: string,
    dto: InvitationDto,
  ) {
    const [role, organization] = await Promise.all([
      this.roles.findOneBy({ id: dto.roleId, organizationId }),
      this.organizations.findOneBy({ id: organizationId, isActive: true }),
    ]);
    if (!role)
      throw new NotFoundException(
        'Le rôle est introuvable dans cette organisation.',
      );
    if (!organization)
      throw new NotFoundException('L’organisation est introuvable.');

    const normalizedEmail = dto.email.trim().toUpperCase();
    const alreadyMember = await this.memberships
      .createQueryBuilder('membership')
      .innerJoin('membership.user', 'user')
      .where('membership.organization_id = :organizationId', { organizationId })
      .andWhere('user.normalized_email = :normalizedEmail', { normalizedEmail })
      .getExists();
    if (alreadyMember) {
      throw new ConflictException(
        'Cet utilisateur appartient déjà à l’organisation.',
      );
    }

    await this.invitations.update(
      {
        organizationId,
        normalizedEmail,
        acceptedAtUtc: IsNull(),
        revokedAtUtc: IsNull(),
      },
      { revokedAtUtc: new Date() },
    );
    const rawToken = randomBytes(48).toString('base64url');
    const invitation = this.invitations.create({
      organizationId,
      roleId: role.id,
      email: dto.email.trim(),
      normalizedEmail,
      tokenHash: this.hashToken(rawToken),
      invitedByUserId: actorUserId,
      expiresAtUtc: new Date(Date.now() + 7 * 86_400_000),
      acceptedAtUtc: null,
      revokedAtUtc: null,
      deliveryStatus: 'EN_ATTENTE',
      deliveryAttempts: 0,
      sentAtUtc: null,
      deliveryError: null,
    });
    await this.invitations.save(invitation);
    await this.addAudit(
      organizationId,
      actorUserId,
      'invitation.created',
      'OrganizationInvitation',
      invitation.id,
      { email: invitation.email, role: role.name },
    );
    await this.deliverInvitation(invitation, organization.name, role.name, rawToken);
    return this.toInvitation(invitation, role.name, rawToken);
  }

  async getInvitations(organizationId: string) {
    const items = await this.invitations.find({
      where: { organizationId },
      relations: { role: true },
      order: { createdAtUtc: 'DESC' },
      take: 200,
    });
    return items.map((item) => this.toInvitation(item, item.role.name));
  }

  async resendInvitation(
    organizationId: string,
    invitationId: string,
    actorUserId: string,
  ) {
    const invitation = await this.invitations.findOne({
      where: { id: invitationId, organizationId },
      relations: { role: true },
    });
    if (!invitation)
      throw new NotFoundException('L’invitation est introuvable.');
    if (invitation.acceptedAtUtc)
      throw new ConflictException('Cette invitation a dÃ©jÃ  Ã©tÃ© acceptÃ©e.');
    if (invitation.revokedAtUtc)
      throw new ConflictException('Cette invitation a Ã©tÃ© rÃ©voquÃ©e.');
    invitation.revokedAtUtc = new Date();
    await this.invitations.save(invitation);
    return this.invite(organizationId, actorUserId, {
      email: invitation.email,
      roleId: invitation.roleId,
    });
  }

  async revokeInvitation(
    organizationId: string,
    invitationId: string,
    actorUserId: string,
  ) {
    const invitation = await this.invitations.findOneBy({
      id: invitationId,
      organizationId,
    });
    if (!invitation)
      throw new NotFoundException('L’invitation est introuvable.');
    if (invitation.acceptedAtUtc)
      throw new ConflictException('Une invitation acceptÃ©e ne peut pas Ãªtre rÃ©voquÃ©e.');
    if (!invitation.revokedAtUtc) {
      invitation.revokedAtUtc = new Date();
      await this.invitations.save(invitation);
      await this.addAudit(
        organizationId,
        actorUserId,
        'invitation.revoked',
        'OrganizationInvitation',
        invitation.id,
        { email: invitation.email },
      );
    }
    return { id: invitation.id, revokedAtUtc: invitation.revokedAtUtc };
  }

  async updateMember(
    organizationId: string,
    membershipId: string,
    actorUserId: string,
    dto: UpdateMemberDto,
  ) {
    const membership = await this.memberships.findOne({
      where: { id: membershipId, organizationId },
      relations: { user: true, role: true },
    });
    if (!membership) throw new NotFoundException('Le membre est introuvable.');
    const newRole = await this.roles.findOneBy({
      id: dto.roleId,
      organizationId,
    });
    if (!newRole)
      throw new NotFoundException(
        'Le rôle est introuvable dans cette organisation.',
      );

    const removesOwner =
      membership.role.normalizedName === SystemRoleNames.Owner.toUpperCase() &&
      (!dto.isActive ||
        newRole.normalizedName !== SystemRoleNames.Owner.toUpperCase());
    if (removesOwner) {
      const otherOwners = await this.memberships
        .createQueryBuilder('membership')
        .innerJoin('membership.role', 'role')
        .where('membership.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('membership.id != :membershipId', { membershipId })
        .andWhere('membership.is_active = true')
        .andWhere('role.normalized_name = :roleName', {
          roleName: SystemRoleNames.Owner.toUpperCase(),
        })
        .getCount();
      if (otherOwners === 0) {
        throw new ConflictException(
          'Le dernier propriétaire actif ne peut pas être retiré ni désactivé.',
        );
      }
    }
    membership.roleId = newRole.id;
    membership.role = newRole;
    membership.isActive = dto.isActive;
    await this.memberships.save(membership);
    await this.addAudit(
      organizationId,
      actorUserId,
      'membership.updated',
      'OrganizationMembership',
      membership.id,
      { userId: membership.userId, role: newRole.name, isActive: dto.isActive },
    );
    return this.toMember(membership);
  }

  async createRole(
    organizationId: string,
    actorUserId: string,
    dto: CreateRoleDto,
  ) {
    const name = dto.name.trim();
    const normalizedName = name.toUpperCase();
    if (await this.roles.existsBy({ organizationId, normalizedName })) {
      throw new ConflictException('Un rôle portant ce nom existe déjà.');
    }
    const permissions = await this.validatePermissions(dto.permissions);
    return this.dataSource.transaction(async (manager) => {
      const role = await manager.save(
        manager.create(Role, {
          organizationId,
          name,
          normalizedName,
          isSystem: false,
        }),
      );
      role.rolePermissions = await manager.save(
        permissions.map((permissionName) =>
          manager.create(RolePermission, { roleId: role.id, permissionName }),
        ),
      );
      await manager.save(
        manager.create(AuditLog, {
          organizationId,
          actorUserId,
          action: 'role.created',
          entityType: 'Role',
          entityId: role.id,
          detailsJson: { name, permissions },
        }),
      );
      return this.toRole(role);
    });
  }

  async updateRolePermissions(
    organizationId: string,
    roleId: string,
    actorUserId: string,
    dto: UpdateRolePermissionsDto,
  ) {
    const role = await this.roles.findOne({
      where: { id: roleId, organizationId },
      relations: { rolePermissions: true },
    });
    if (!role) throw new NotFoundException('Le rôle est introuvable.');
    if (role.normalizedName === SystemRoleNames.Owner.toUpperCase()) {
      throw new ConflictException(
        'Les permissions du rôle Propriétaire sont protégées.',
      );
    }
    const permissions = await this.validatePermissions(dto.permissions);
    return this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId: role.id });
      role.rolePermissions = await manager.save(
        permissions.map((permissionName) =>
          manager.create(RolePermission, { roleId: role.id, permissionName }),
        ),
      );
      await manager.save(
        manager.create(AuditLog, {
          organizationId,
          actorUserId,
          action: 'role.permissions_updated',
          entityType: 'Role',
          entityId: role.id,
          detailsJson: { name: role.name, permissions },
        }),
      );
      return this.toRole(role);
    });
  }

  private async validatePermissions(values: string[]) {
    const distinct = [
      ...new Set(values.map((item) => item.trim()).filter(Boolean)),
    ].sort();
    const known = await this.permissions.findBy({ name: In(distinct) });
    const knownNames = new Set(known.map((item) => item.name));
    const unknown = distinct.filter((item) => !knownNames.has(item));
    if (unknown.length) {
      throw new BadRequestException(
        `Permissions inconnues : ${unknown.join(', ')}`,
      );
    }
    return distinct;
  }

  private async addAudit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    await this.auditLogs.save(
      this.auditLogs.create({
        organizationId,
        actorUserId,
        action,
        entityType,
        entityId,
        detailsJson,
      }),
    );
  }

  private async deliverInvitation(
    invitation: OrganizationInvitation,
    organizationName: string,
    roleName: string,
    token: string,
  ) {
    invitation.deliveryAttempts += 1;
    try {
      await this.invitationMailer.sendInvitation({
        recipient: invitation.email,
        organizationName,
        roleName,
        expiresAtUtc: invitation.expiresAtUtc,
        token,
      });
      invitation.deliveryStatus = 'ENVOYEE';
      invitation.sentAtUtc = new Date();
      invitation.deliveryError = null;
      await this.invitations.save(invitation);
      await this.addAudit(
        invitation.organizationId,
        invitation.invitedByUserId,
        'invitation.sent',
        'OrganizationInvitation',
        invitation.id,
        { email: invitation.email },
      );
    } catch (error) {
      invitation.deliveryStatus = 'ECHEC';
      invitation.deliveryError =
        error instanceof Error ? error.message.slice(0, 2000) : 'Erreur SMTP inconnue';
      await this.invitations.save(invitation);
      await this.addAudit(
        invitation.organizationId,
        invitation.invitedByUserId,
        'invitation.delivery_failed',
        'OrganizationInvitation',
        invitation.id,
        { email: invitation.email, error: invitation.deliveryError },
      );
    }
  }

  private toInvitation(
    invitation: OrganizationInvitation,
    roleName: string,
    token?: string,
  ) {
    const now = new Date();
    const status = invitation.acceptedAtUtc
      ? 'ACCEPTEE'
      : invitation.revokedAtUtc
        ? 'REVOQUEE'
        : invitation.expiresAtUtc <= now
          ? 'EXPIREE'
          : invitation.deliveryStatus;
    return {
      id: invitation.id,
      email: invitation.email,
      roleId: invitation.roleId,
      role: roleName,
      status,
      deliveryStatus: invitation.deliveryStatus,
      deliveryAttempts: invitation.deliveryAttempts,
      deliveryError: invitation.deliveryError,
      expiresAtUtc: invitation.expiresAtUtc,
      sentAtUtc: invitation.sentAtUtc,
      acceptedAtUtc: invitation.acceptedAtUtc,
      revokedAtUtc: invitation.revokedAtUtc,
      createdAtUtc: invitation.createdAtUtc,
      invitationUrl:
        token && this.invitationMailer.exposeInvitationLinks()
          ? this.invitationMailer.invitationUrl(token)
          : undefined,
    };
  }

  private toSummary(item: OrganizationMembership) {
    return {
      id: item.organizationId,
      name: item.organization.name,
      slug: item.organization.slug,
      role: item.role.name,
      permissions: item.role.rolePermissions
        .map((permission) => permission.permissionName)
        .sort(),
    };
  }

  private toMember(item: OrganizationMembership) {
    return {
      membershipId: item.id,
      userId: item.userId,
      email: item.user.email,
      fullName: item.user.fullName,
      roleId: item.roleId,
      role: item.role.name,
      isActive: item.isActive,
    };
  }

  private toRole(role: Role) {
    return {
      id: role.id,
      name: role.name,
      isSystem: role.isSystem,
      permissions: role.rolePermissions
        .map((permission) => permission.permissionName)
        .sort(),
    };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex').toUpperCase();
  }
}
