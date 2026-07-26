import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  Notification,
  NotificationChannel,
  ObligationInstance,
  ObligationStatus,
  OrganizationMembership,
} from '../database/entities';
import { SystemRoleNames } from '../database/permissions';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(ObligationInstance)
    private readonly obligations: Repository<ObligationInstance>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
  ) {}

  async list(organizationId: string, userId: string, unreadOnly: boolean) {
    return this.notifications.find({
      where: {
        organizationId,
        recipientUserId: userId,
        ...(unreadOnly ? { readAtUtc: IsNull() } : {}),
      },
      order: { createdAtUtc: 'DESC' },
      take: 200,
    });
  }

  async markRead(organizationId: string, userId: string, id: string) {
    const item = await this.notifications.findOneBy({
      id,
      organizationId,
      recipientUserId: userId,
    });
    if (!item) throw new NotFoundException('La notification est introuvable.');
    item.readAtUtc = new Date();
    return this.notifications.save(item);
  }

  async markAllRead(organizationId: string, userId: string) {
    await this.notifications.update(
      { organizationId, recipientUserId: userId, readAtUtc: IsNull() },
      { readAtUtc: new Date() },
    );
    return { updated: true };
  }

  @Cron('0 7 * * *', { timeZone: 'Africa/Tunis' })
  async scheduledScan() {
    await this.scan();
  }

  async scan(organizationId?: string) {
    const today = new Date();
    const todayText = today.toISOString().slice(0, 10);
    const until = new Date(today);
    until.setUTCDate(until.getUTCDate() + 7);
    const builder = this.obligations
      .createQueryBuilder('obligation')
      .where('obligation.status NOT IN (:...closed)', {
        closed: [
          ObligationStatus.Filed,
          ObligationStatus.Paid,
          ObligationStatus.Validated,
        ],
      })
      .andWhere('obligation.due_on <= :until', {
        until: until.toISOString().slice(0, 10),
      });
    if (organizationId)
      builder.andWhere('obligation.organization_id = :organizationId', {
        organizationId,
      });
    const obligations = await builder.getMany();
    let created = 0;
    for (const obligation of obligations) {
      const due = new Date(`${obligation.dueOn}T00:00:00Z`);
      const days = Math.ceil(
        (due.getTime() - new Date(`${todayText}T00:00:00Z`).getTime()) /
          86400000,
      );
      if (![7, 3, 1].includes(days) && days >= 0) continue;
      const recipients = await this.recipientUserIds(obligation);
      for (const recipientUserId of recipients) {
        const late = days < 0;
        const key = `obligation:${obligation.id}:${late ? 'late' : `j${days}`}:${recipientUserId}`;
        const exists = await this.notifications.existsBy({
          organizationId: obligation.organizationId,
          deduplicationKey: key,
        });
        if (exists) continue;
        await this.notifications.save(
          this.notifications.create({
            organizationId: obligation.organizationId,
            recipientUserId,
            type: late ? 'OBLIGATION_EN_RETARD' : 'ECHEANCE_APPROCHE',
            title: late
              ? 'Obligation en retard'
              : `Échéance dans ${days} jour${days > 1 ? 's' : ''}`,
            body: `Une obligation du dossier arrive à échéance le ${obligation.dueOn}.`,
            entityType: 'ObligationInstance',
            entityId: obligation.id,
            channel: NotificationChannel.InApp,
            deduplicationKey: key,
            readAtUtc: null,
          }),
        );
        created++;
      }
    }
    return { scanned: obligations.length, created };
  }

  async createForUser(input: {
    organizationId: string;
    recipientUserId: string;
    type: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    deduplicationKey: string;
  }) {
    if (
      await this.notifications.existsBy({
        organizationId: input.organizationId,
        deduplicationKey: input.deduplicationKey,
      })
    )
      return;
    await this.notifications.save(
      this.notifications.create({
        ...input,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        channel: NotificationChannel.InApp,
        readAtUtc: null,
      }),
    );
  }

  private async recipientUserIds(obligation: ObligationInstance) {
    if (obligation.assignedMembershipId) {
      const assigned = await this.memberships.findOneBy({
        id: obligation.assignedMembershipId,
        isActive: true,
      });
      if (assigned) return [assigned.userId];
    }
    const owners = await this.memberships.find({
      where: {
        organizationId: obligation.organizationId,
        isActive: true,
        role: { normalizedName: SystemRoleNames.Owner.toUpperCase() },
      },
      relations: { role: true },
    });
    return [...new Set(owners.map((item) => item.userId))];
  }
}
