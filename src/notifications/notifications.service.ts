import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  AccountingDocument,
  ClientPortalMessage,
  Notification,
  NotificationChannel,
  ObligationInstance,
  ObligationStatus,
  OrganizationMembership,
  WorkTask,
} from '../database/entities';
import { PermissionNames, SystemRoleNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import { canAccessAllTasks } from '../tasks/task-access';

const deadlineTypes = ['OBLIGATION_EN_RETARD', 'ECHEANCE_APPROCHE'];
const closedStatuses = [
  ObligationStatus.Filed,
  ObligationStatus.Paid,
  ObligationStatus.Validated,
];
const daysUntil = (dueOn: string, today: string) =>
  (Date.parse(dueOn) - Date.parse(today)) / 86_400_000;
const deadlineTitle = (days: number) =>
  days < 0
    ? 'Obligation en retard'
    : days === 0
      ? 'Échéance aujourd’hui'
      : `Échéance dans ${days} jour${days > 1 ? 's' : ''}`;

type NotificationTarget =
  | { kind: 'obligation'; dossierId: string; id: string; year: number }
  | { kind: 'conversation'; dossierId: string }
  | { kind: 'document'; dossierId: string; id: string }
  | { kind: 'task'; dossierId: string; id: string };

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(ObligationInstance)
    private readonly obligations: Repository<ObligationInstance>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dossiers: DossiersService,
  ) {}

  async list(organizationId: string, userId: string, unreadOnly: boolean) {
    const query = this.notifications
      .createQueryBuilder('notice')
      .where('notice.organization_id = :organizationId', { organizationId })
      .andWhere('notice.recipient_user_id = :userId', { userId });
    const newer = query
      .subQuery()
      .select('1')
      .from(Notification, 'newer')
      .where('newer.organization_id = notice.organization_id')
      .andWhere('newer.recipient_user_id = notice.recipient_user_id')
      .andWhere('newer.entity_type = notice.entity_type')
      .andWhere('newer.entity_id = notice.entity_id')
      .andWhere('newer.type IN (:...deadlineTypes)')
      .andWhere(
        '(newer.created_at_utc, newer.id) > (notice.created_at_utc, notice.id)',
      )
      .getQuery();
    const openObligation = query
      .subQuery()
      .select('1')
      .from(ObligationInstance, 'obligation')
      .where('obligation.id = notice.entity_id')
      .andWhere('obligation.organization_id = notice.organization_id')
      .andWhere('obligation.status NOT IN (:...closedStatuses)')
      .getQuery();
    query.andWhere(
      `(notice.type NOT IN (:...deadlineTypes) OR notice.entity_type IS DISTINCT FROM 'ObligationInstance' OR (EXISTS ${openObligation} AND NOT EXISTS ${newer}))`,
      { deadlineTypes, closedStatuses },
    );
    if (unreadOnly) query.andWhere('notice.read_at_utc IS NULL');
    const items = await query
      .orderBy('notice.created_at_utc', 'DESC')
      .addOrderBy('notice.id', 'DESC')
      .take(200)
      .getMany();
    if (!items.length) return [];

    const ids = (type: string) =>
      items.flatMap((item) =>
        item.entityType === type && item.entityId ? [item.entityId] : [],
      );
    const [obligations, documents, messages, tasks] = await Promise.all([
      this.obligations.find({
        select: {
          id: true,
          dossierId: true,
          periodYear: true,
          dueOn: true,
          template: { name: true },
        },
        where: { organizationId, id: In(ids('ObligationInstance')) },
        relations: { template: true },
      }),
      this.dataSource.getRepository(AccountingDocument).find({
        select: { id: true, dossierId: true },
        where: {
          organizationId,
          id: In(ids('AccountingDocument')),
          deletedAtUtc: IsNull(),
        },
      }),
      this.dataSource.getRepository(ClientPortalMessage).find({
        select: { id: true, dossierId: true },
        where: { organizationId, id: In(ids('ClientPortalMessage')) },
      }),
      this.dataSource.getRepository(WorkTask).find({
        select: { id: true, dossierId: true, assigneeMembershipId: true },
        where: { organizationId, id: In(ids('WorkTask')) },
      }),
    ]);
    const dossierIds = [
      ...new Set(
        [...obligations, ...documents, ...messages, ...tasks].map(
          (item) => item.dossierId,
        ),
      ),
    ];
    const access = dossierIds.length
      ? await this.dossiers.resolveAccessibleDossiers(
          organizationId,
          userId,
          dossierIds,
        )
      : null;
    const dossierNames = new Map(
      access?.dossiers.map((item) => [item.id, item.legalName]),
    );
    const permissions = new Set(
      access?.membership.role.rolePermissions.map(
        (item) => item.permissionName,
      ),
    );
    const byId = <T extends { id: string }>(rows: T[]) =>
      new Map(rows.map((row) => [row.id, row]));
    const obligationById = byId(obligations);
    const documentById = byId(documents);
    const messageById = byId(messages);
    const taskById = byId(tasks);
    const today = new Date().toISOString().slice(0, 10);
    return items.map((item) => {
      let target: NotificationTarget | null = null;
      let title = item.title;
      let body = item.body;
      const id = item.entityId ?? '';
      if (permissions.has(PermissionNames.DossiersView)) {
        if (
          item.entityType === 'ObligationInstance' &&
          permissions.has(PermissionNames.ObligationsView)
        ) {
          const row = obligationById.get(id);
          const name = row && dossierNames.get(row.dossierId);
          if (row && name) {
            target = {
              kind: 'obligation',
              dossierId: row.dossierId,
              id,
              year: row.periodYear,
            };
            body = `${name} · ${row.template.name} · Échéance : ${row.dueOn.split('-').reverse().join('/')}`;
            if (deadlineTypes.includes(item.type))
              title = deadlineTitle(daysUntil(row.dueOn, today));
          }
        } else if (
          item.entityType === 'AccountingDocument' &&
          permissions.has(PermissionNames.DocumentsView)
        ) {
          const row = documentById.get(id);
          if (row && dossierNames.has(row.dossierId))
            target = { kind: 'document', dossierId: row.dossierId, id };
        } else if (
          item.entityType === 'ClientPortalMessage' &&
          permissions.has(PermissionNames.ClientPortalView) &&
          access?.membership.role.normalizedName !==
            SystemRoleNames.ClientPortal.toUpperCase()
        ) {
          const row = messageById.get(id);
          if (row && dossierNames.has(row.dossierId))
            target = { kind: 'conversation', dossierId: row.dossierId };
        } else if (
          item.entityType === 'WorkTask' &&
          permissions.has(PermissionNames.TasksView)
        ) {
          const row = taskById.get(id);
          if (
            row &&
            dossierNames.has(row.dossierId) &&
            (canAccessAllTasks(permissions) ||
              row.assigneeMembershipId === access?.membership.id)
          ) {
            target = { kind: 'task', dossierId: row.dossierId, id };
          }
        }
      }
      return { ...item, title, body, target };
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
        closed: closedStatuses,
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
      const days = daysUntil(obligation.dueOn, todayText);
      if (![7, 3, 1, 0].includes(days) && days >= 0) continue;
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
            title: deadlineTitle(days),
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
