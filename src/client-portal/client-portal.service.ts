import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ClientPortalMessage,
  ClientPortalApproval,
  ClientNotificationPreference,
  DossierAssignment,
  OrganizationMembership,
} from '../database/entities';
import { SystemRoleNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateClientPortalMessageDto,
  SaveClientApprovalDto,
  SaveClientNotificationPreferencesDto,
} from './dto';

@Injectable()
export class ClientPortalService {
  constructor(
    @InjectRepository(ClientPortalMessage)
    private readonly messages: Repository<ClientPortalMessage>,
    @InjectRepository(ClientPortalApproval)
    private readonly clientApprovals: Repository<ClientPortalApproval>,
    @InjectRepository(ClientNotificationPreference)
    private readonly clientPreferences: Repository<ClientNotificationPreference>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectRepository(DossierAssignment)
    private readonly assignments: Repository<DossierAssignment>,
    private readonly dossiers: DossiersService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const membership = await this.membership(organizationId, userId);
    const isClient = this.isClient(membership.role.normalizedName);
    const items = await this.messages.find({
      where: { organizationId, dossierId },
      relations: { sender: true },
      order: { createdAtUtc: 'ASC' },
      take: 500,
    });
    await this.messages
      .createQueryBuilder()
      .update(ClientPortalMessage)
      .set(
        isClient
          ? { clientReadAtUtc: new Date() }
          : { cabinetReadAtUtc: new Date() },
      )
      .where('organization_id = :organizationId AND dossier_id = :dossierId', {
        organizationId,
        dossierId,
      })
      .andWhere(
        isClient ? 'client_read_at_utc IS NULL' : 'cabinet_read_at_utc IS NULL',
      )
      .execute();
    return items.map((item) => this.toMessage(item));
  }

  async send(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateClientPortalMessageDto,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const membership = await this.membership(organizationId, userId);
    const isClient = this.isClient(membership.role.normalizedName);
    const message = await this.messages.save(
      this.messages.create({
        organizationId,
        dossierId,
        senderUserId: userId,
        senderRole: membership.role.name,
        body: dto.body.trim(),
        clientReadAtUtc: isClient ? new Date() : null,
        cabinetReadAtUtc: isClient ? null : new Date(),
      }),
    );
    message.sender = membership.user;

    const recipients = await this.recipients(
      organizationId,
      dossierId,
      userId,
      isClient,
    );
    for (const recipientUserId of recipients) {
      await this.notifications.createForUser({
        organizationId,
        recipientUserId,
        type: 'MESSAGE_PORTAIL_CLIENT',
        title: isClient
          ? `Nouveau message de ${dossier.legalName}`
          : 'Nouveau message de votre cabinet',
        body: dto.body.trim().slice(0, 220),
        entityType: 'ClientPortalMessage',
        entityId: message.id,
        deduplicationKey: `client-portal-message:${message.id}:${recipientUserId}`,
      });
    }
    return this.toMessage(message);
  }

  async contacts(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const assignments = await this.assignments.find({
      where: { organizationId, dossierId, isActive: true },
      relations: { membership: { role: true, user: true } },
      order: { createdAtUtc: 'ASC' },
    });
    return assignments
      .filter(
        (assignment) =>
          !this.isClient(assignment.membership.role.normalizedName),
      )
      .map((assignment) => ({
        userId: assignment.membership.userId,
        fullName: assignment.membership.user.fullName,
        email: assignment.membership.user.email,
        role: assignment.membership.role.name,
      }));
  }

  async approvals(organizationId: string, dossierId: string, userId: string) {
    await this.assertClient(organizationId, dossierId, userId);
    return this.clientApprovals.find({
      where: { organizationId, dossierId, userId },
      order: { createdAtUtc: 'DESC' },
      take: 200,
    });
  }

  async approve(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: SaveClientApprovalDto,
    ipAddress: string | undefined,
    userAgent: string | null,
  ) {
    await this.assertClient(organizationId, dossierId, userId);
    let approval = await this.clientApprovals.findOneBy({
      dossierId,
      userId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      version: dto.version,
    });
    if (!approval) {
      approval = this.clientApprovals.create({
        organizationId,
        dossierId,
        userId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        version: dto.version,
      });
    }
    Object.assign(approval, {
      label: dto.label.trim(),
      decision: dto.decision,
      comment: dto.comment?.trim() || null,
      ipAddress: ipAddress?.slice(0, 80) || null,
      userAgent: userAgent?.slice(0, 500) || null,
    });
    return this.clientApprovals.save(approval);
  }

  async preferences(userId: string) {
    const current = await this.clientPreferences.findOneBy({ userId });
    return (
      current ?? {
        emailMessages: true,
        emailDeadlines: true,
        emailDocuments: true,
        weeklySummary: true,
        preferredLanguage: 'fr',
      }
    );
  }

  async savePreferences(
    userId: string,
    dto: SaveClientNotificationPreferencesDto,
  ) {
    const current =
      (await this.clientPreferences.findOneBy({ userId })) ??
      this.clientPreferences.create({ userId });
    Object.assign(current, dto);
    return this.clientPreferences.save(current);
  }

  private async membership(organizationId: string, userId: string) {
    const membership = await this.memberships.findOne({
      where: { organizationId, userId, isActive: true },
      relations: { role: true, user: true },
    });
    if (!membership) throw new NotFoundException('Le membre est introuvable.');
    return membership;
  }

  private async assertClient(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const membership = await this.membership(organizationId, userId);
    if (!this.isClient(membership.role.normalizedName))
      throw new ForbiddenException(
        'Cette action est réservée au portail client.',
      );
  }

  private async recipients(
    organizationId: string,
    dossierId: string,
    senderUserId: string,
    senderIsClient: boolean,
  ) {
    const assignments = await this.assignments.find({
      where: { organizationId, dossierId, isActive: true },
      relations: { membership: { role: true } },
    });
    const owners = senderIsClient
      ? await this.memberships.find({
          where: { organizationId, isActive: true },
          relations: { role: true },
        })
      : [];
    const candidates = [
      ...assignments.map((item) => item.membership),
      ...owners.filter(
        (item) =>
          item.role.normalizedName === SystemRoleNames.Owner.toUpperCase(),
      ),
    ];
    return [
      ...new Set(
        candidates
          .filter((item) => item.userId !== senderUserId)
          .filter((item) =>
            senderIsClient
              ? !this.isClient(item.role.normalizedName)
              : this.isClient(item.role.normalizedName),
          )
          .map((item) => item.userId),
      ),
    ];
  }

  private isClient(normalizedRole: string) {
    return normalizedRole === SystemRoleNames.ClientPortal.toUpperCase();
  }

  private toMessage(item: ClientPortalMessage) {
    return {
      id: item.id,
      dossierId: item.dossierId,
      senderUserId: item.senderUserId,
      senderName: item.sender.fullName,
      senderRole: item.senderRole,
      body: item.body,
      clientReadAtUtc: item.clientReadAtUtc,
      cabinetReadAtUtc: item.cabinetReadAtUtc,
      createdAtUtc: item.createdAtUtc,
    };
  }
}
