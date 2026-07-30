import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { JwtUser } from '../common/auth.types';
import type { RevokePlatformSessionsDto, UpdatePlatformStatusDto } from './dto';

type CountRow = Record<string, string | Date | null>;

@Injectable()
export class PlatformAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async overview() {
    const databaseStartedAt = Date.now();
    await this.dataSource.query('SELECT 1');
    const databaseLatencyMs = Date.now() - databaseStartedAt;

    const [counts] = await this.dataSource.query<CountRow[]>(`
      SELECT
        (SELECT COUNT(*) FROM "accounting"."organizations") AS "organizationsTotal",
        (SELECT COUNT(*) FROM "accounting"."organizations" WHERE "is_active" = true) AS "organizationsActive",
        (SELECT COUNT(*) FROM "accounting"."users") AS "usersTotal",
        (SELECT COUNT(*) FROM "accounting"."users" WHERE "is_active" = true) AS "usersActive",
        (SELECT COUNT(*) FROM "accounting"."users"
          WHERE "is_active" = true AND "is_platform_admin" = true) AS "platformAdmins",
        (SELECT COUNT(*) FROM "accounting"."refresh_tokens"
          WHERE "revoked_at_utc" IS NULL AND "expires_at_utc" > now()) AS "activeSessions",
        (SELECT COUNT(*) FROM "accounting"."client_dossiers" WHERE "status" = 'ACTIF') AS "dossiersActive",
        (SELECT COUNT(*) FROM "accounting"."accounting_documents" WHERE "deleted_at_utc" IS NULL) AS "documentsTotal",
        (SELECT COALESCE(SUM("size_bytes"), 0) FROM "accounting"."accounting_documents"
          WHERE "deleted_at_utc" IS NULL) AS "storageBytes",
        (SELECT COUNT(*) FROM "accounting"."accounting_documents"
          WHERE "deleted_at_utc" IS NULL AND "extraction_status" = 'ECHEC') AS "extractionsFailed",
        (SELECT COUNT(*) FROM "accounting"."organization_invitations"
          WHERE "delivery_status" = 'ECHEC'
            AND "accepted_at_utc" IS NULL
            AND "revoked_at_utc" IS NULL) AS "invitationsFailed",
        (SELECT COUNT(*) FROM "accounting"."ttn_einvoice_submissions"
          WHERE "status" IN ('REJETEE', 'ECHEC')) AS "ttnFailed",
        (SELECT COUNT(*) FROM "accounting"."ttn_einvoice_configurations"
          WHERE "is_enabled" = true AND "environment" = 'PRODUCTION') AS "ttnProductionConnections",
        (SELECT COUNT(*) FROM "accounting"."organization_subscriptions"
          WHERE "status" = 'IMPAYE') AS "subscriptionsPastDue",
        (SELECT COUNT(*) FROM "accounting"."saas_subscription_invoices"
          WHERE "status" = 'A_PAYER' AND "due_at_utc" < now()) AS "subscriptionInvoicesOverdue"
    `);

    const totals = this.numericRow(counts);
    const backupConfigured =
      this.config.get('BACKUP_ENABLED', 'false') === 'true';
    const alerts = [
      this.alert(
        'EXTRACTIONS_ECHEC',
        'Extractions de documents en échec',
        totals.extractionsFailed,
        'error',
      ),
      this.alert(
        'INVITATIONS_ECHEC',
        'Invitations non distribuées',
        totals.invitationsFailed,
        'warning',
      ),
      this.alert(
        'TTN_ECHEC',
        'Transmissions TTN rejetées ou en échec',
        totals.ttnFailed,
        'error',
      ),
      this.alert(
        'ABONNEMENTS_IMPAYES',
        'Abonnements de cabinets en impayé',
        totals.subscriptionsPastDue,
        'warning',
      ),
      this.alert(
        'FACTURES_SAAS_ECHUES',
        'Factures Fiscora arrivées à échéance',
        totals.subscriptionInvoicesOverdue,
        'warning',
      ),
      totals.platformAdmins < 2
        ? this.alert(
            'ADMINISTRATEUR_UNIQUE',
            'Un seul administrateur actif : créez un accès de secours',
            totals.platformAdmins,
            'warning',
          )
        : null,
      !backupConfigured
        ? this.alert(
            'SAUVEGARDE_NON_CONFIGUREE',
            'Sauvegardes de production non configurées',
            1,
            'warning',
          )
        : null,
    ].filter(
      (
        item,
      ): item is {
        code: string;
        label: string;
        count: number;
        severity: 'info' | 'warning' | 'error';
      } => Boolean(item && item.count > 0),
    );

    return {
      generatedAtUtc: new Date().toISOString(),
      totals,
      alerts,
      services: [
        {
          code: 'API',
          label: 'API Fiscora',
          status: 'OPERATIONNEL',
          detail: 'Le service répond aux requêtes authentifiées.',
        },
        {
          code: 'DATABASE',
          label: 'PostgreSQL',
          status: 'OPERATIONNEL',
          detail: `Réponse en ${databaseLatencyMs} ms.`,
        },
        {
          code: 'OBJECT_STORAGE',
          label: 'Stockage documentaire',
          status: this.config.get('MINIO_ENDPOINT')
            ? 'CONFIGURE'
            : 'NON_CONFIGURE',
          detail: this.config.get('MINIO_ENDPOINT')
            ? 'Un endpoint de stockage est configuré.'
            : 'Aucun endpoint de stockage configuré.',
        },
        {
          code: 'EMAIL',
          label: 'Envoi des e-mails',
          status: this.config.get('SMTP_HOST') ? 'CONFIGURE' : 'NON_CONFIGURE',
          detail: this.config.get('SMTP_HOST')
            ? 'Un serveur SMTP est configuré.'
            : 'Aucun serveur SMTP configuré.',
        },
        {
          code: 'BACKUPS',
          label: 'Sauvegardes',
          status: backupConfigured ? 'CONFIGURE' : 'NON_CONFIGURE',
          detail: backupConfigured
            ? 'La stratégie de sauvegarde est déclarée active.'
            : 'Aucune stratégie de sauvegarde de production n’est déclarée.',
        },
        {
          code: 'TTN',
          label: 'Facturation électronique TTN',
          status:
            totals.ttnProductionConnections > 0 ? 'PRODUCTION' : 'SIMULATION',
          detail:
            totals.ttnProductionConnections > 0
              ? `${totals.ttnProductionConnections} connexion(s) de production active(s).`
              : 'Aucune connexion de production active.',
        },
      ],
    };
  }

  async jobs() {
    const [row] = await this.dataSource.query<CountRow[]>(`
      SELECT
        (SELECT COUNT(*) FROM "accounting"."accounting_documents"
          WHERE "deleted_at_utc" IS NULL
            AND "extraction_status" = 'EN_ATTENTE') AS "extractionPending",
        (SELECT COUNT(*) FROM "accounting"."accounting_documents"
          WHERE "deleted_at_utc" IS NULL
            AND "extraction_status" = 'EN_COURS') AS "extractionProcessing",
        (SELECT COUNT(*) FROM "accounting"."accounting_documents"
          WHERE "deleted_at_utc" IS NULL
            AND "extraction_status" = 'ECHEC') AS "extractionFailed",
        (SELECT MAX(COALESCE("updated_at_utc", "created_at_utc"))
          FROM "accounting"."accounting_documents"
          WHERE "deleted_at_utc" IS NULL
            AND "extraction_status" = 'ECHEC') AS "extractionLastFailureAtUtc",
        (SELECT COUNT(*) FROM "accounting"."organization_invitations"
          WHERE "delivery_status" = 'EN_ATTENTE'
            AND "accepted_at_utc" IS NULL
            AND "revoked_at_utc" IS NULL) AS "invitationPending",
        (SELECT 0) AS "invitationProcessing",
        (SELECT COUNT(*) FROM "accounting"."organization_invitations"
          WHERE "delivery_status" = 'ECHEC'
            AND "accepted_at_utc" IS NULL
            AND "revoked_at_utc" IS NULL) AS "invitationFailed",
        (SELECT MAX(COALESCE("updated_at_utc", "created_at_utc"))
          FROM "accounting"."organization_invitations"
          WHERE "delivery_status" = 'ECHEC'
            AND "accepted_at_utc" IS NULL
            AND "revoked_at_utc" IS NULL) AS "invitationLastFailureAtUtc",
        (SELECT COUNT(*) FROM "accounting"."ttn_einvoice_submissions"
          WHERE "status" = 'PRETE') AS "ttnPending",
        (SELECT COUNT(*) FROM "accounting"."ttn_einvoice_submissions"
          WHERE "status" = 'SOUMISE') AS "ttnProcessing",
        (SELECT COUNT(*) FROM "accounting"."ttn_einvoice_submissions"
          WHERE "status" IN ('REJETEE', 'ECHEC')) AS "ttnFailed",
        (SELECT MAX(COALESCE("last_attempt_at_utc", "updated_at_utc", "created_at_utc"))
          FROM "accounting"."ttn_einvoice_submissions"
          WHERE "status" IN ('REJETEE', 'ECHEC')) AS "ttnLastFailureAtUtc"
    `);

    return {
      generatedAtUtc: new Date().toISOString(),
      pipelines: [
        this.pipeline(
          'DOCUMENT_EXTRACTION',
          'Extraction OCR et IA',
          row,
          'extraction',
        ),
        this.pipeline(
          'INVITATION_EMAIL',
          'Invitations par e-mail',
          row,
          'invitation',
        ),
        this.pipeline('TTN_TRANSMISSION', 'Transmission TTN', row, 'ttn'),
      ],
    };
  }

  async organizations() {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(`
      SELECT
        o."id",
        o."name",
        o."slug",
        o."is_active" AS "isActive",
        o."suspended_at_utc" AS "suspendedAtUtc",
        o."suspension_reason" AS "suspensionReason",
        o."created_at_utc" AS "createdAtUtc",
        (SELECT COUNT(*) FROM "accounting"."organization_memberships" m
          WHERE m."organization_id" = o."id" AND m."is_active" = true) AS "membersCount",
        (SELECT COUNT(*) FROM "accounting"."client_dossiers" d
          WHERE d."organization_id" = o."id" AND d."status" = 'ACTIF') AS "dossiersCount",
        (SELECT COUNT(*) FROM "accounting"."accounting_documents" doc
          WHERE doc."organization_id" = o."id" AND doc."deleted_at_utc" IS NULL) AS "documentsCount",
        (SELECT COALESCE(SUM(doc."size_bytes"), 0) FROM "accounting"."accounting_documents" doc
          WHERE doc."organization_id" = o."id" AND doc."deleted_at_utc" IS NULL) AS "storageBytes",
        (SELECT MAX(a."created_at_utc") FROM "accounting"."audit_logs" a
          WHERE a."organization_id" = o."id") AS "lastActivityAtUtc"
      FROM "accounting"."organizations" o
      ORDER BY o."created_at_utc" DESC
      LIMIT 200
    `);
    return rows.map((row) => ({
      ...row,
      membersCount: Number(row.membersCount),
      dossiersCount: Number(row.dossiersCount),
      documentsCount: Number(row.documentsCount),
      storageBytes: Number(row.storageBytes),
    }));
  }

  async users() {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(`
      SELECT
        u."id",
        u."full_name" AS "fullName",
        u."email",
        u."is_active" AS "isActive",
        u."email_verified" AS "emailVerified",
        u."is_platform_admin" AS "isPlatformAdmin",
        u."disabled_at_utc" AS "disabledAtUtc",
        u."disabled_reason" AS "disabledReason",
        u."last_login_at_utc" AS "lastLoginAtUtc",
        u."created_at_utc" AS "createdAtUtc",
        (SELECT COUNT(*) FROM "accounting"."organization_memberships" m
          WHERE m."user_id" = u."id" AND m."is_active" = true) AS "membershipsCount",
        (SELECT COUNT(*) FROM "accounting"."refresh_tokens" rt
          WHERE rt."user_id" = u."id"
            AND rt."revoked_at_utc" IS NULL
            AND rt."expires_at_utc" > now()) AS "activeSessionsCount"
      FROM "accounting"."users" u
      ORDER BY u."created_at_utc" DESC
      LIMIT 300
    `);
    return rows.map((row) => ({
      ...row,
      membershipsCount: Number(row.membershipsCount),
      activeSessionsCount: Number(row.activeSessionsCount),
    }));
  }

  async auditLogs() {
    return this.dataSource.query<Record<string, unknown>[]>(`
      SELECT
        a."id",
        a."action",
        a."entity_type" AS "entityType",
        a."entity_id" AS "entityId",
        a."created_at_utc" AS "createdAtUtc",
        a."actor_user_id" AS "actorUserId",
        u."full_name" AS "actorName",
        a."organization_id" AS "organizationId",
        o."name" AS "organizationName",
        CASE
          WHEN a."action" LIKE 'platform_admin.%'
            THEN a."details_json" ->> 'reason'
          ELSE NULL
        END AS "reason"
      FROM "accounting"."audit_logs" a
      LEFT JOIN "accounting"."users" u ON u."id" = a."actor_user_id"
      LEFT JOIN "accounting"."organizations" o ON o."id" = a."organization_id"
      ORDER BY a."created_at_utc" DESC
      LIMIT 200
    `);
  }

  async updateOrganizationStatus(
    actor: JwtUser,
    organizationId: string,
    dto: UpdatePlatformStatusDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const [organization] = await manager.query<
        Array<{ id: string; name: string; isActive: boolean }>
      >(
        `
          SELECT "id", "name", "is_active" AS "isActive"
          FROM "accounting"."organizations"
          WHERE "id" = $1::uuid
          FOR UPDATE
        `,
        [organizationId],
      );
      if (!organization) throw new NotFoundException('Cabinet introuvable.');
      if (organization.isActive === dto.isActive) {
        throw new BadRequestException(
          dto.isActive
            ? 'Ce cabinet est déjà actif.'
            : 'Ce cabinet est déjà suspendu.',
        );
      }

      const [updated] = await manager.query<
        Array<{
          id: string;
          name: string;
          isActive: boolean;
          suspendedAtUtc: Date | null;
          suspensionReason: string | null;
        }>
      >(
        `
          UPDATE "accounting"."organizations"
          SET
            "is_active" = $2,
            "suspended_at_utc" = CASE WHEN $2 THEN NULL ELSE now() END,
            "suspension_reason" = CASE WHEN $2 THEN NULL ELSE $3 END,
            "suspended_by_user_id" = CASE WHEN $2 THEN NULL ELSE $4::uuid END,
            "updated_at_utc" = now()
          WHERE "id" = $1::uuid
          RETURNING
            "id",
            "name",
            "is_active" AS "isActive",
            "suspended_at_utc" AS "suspendedAtUtc",
            "suspension_reason" AS "suspensionReason"
        `,
        [organizationId, dto.isActive, dto.reason.trim(), actor.userId],
      );
      await this.writeAudit(
        manager,
        organizationId,
        actor.userId,
        dto.isActive
          ? 'platform_admin.organization.reactivated'
          : 'platform_admin.organization.suspended',
        'Organization',
        organizationId,
        { reason: dto.reason.trim(), previousIsActive: organization.isActive },
      );
      return updated;
    });
  }

  async updateUserStatus(
    actor: JwtUser,
    userId: string,
    dto: UpdatePlatformStatusDto,
  ) {
    if (!dto.isActive && userId === actor.userId) {
      throw new BadRequestException(
        'Vous ne pouvez pas désactiver votre propre compte administrateur.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const [user] = await manager.query<
        Array<{
          id: string;
          email: string;
          fullName: string;
          isActive: boolean;
          isPlatformAdmin: boolean;
        }>
      >(
        `
          SELECT
            "id",
            "email",
            "full_name" AS "fullName",
            "is_active" AS "isActive",
            "is_platform_admin" AS "isPlatformAdmin"
          FROM "accounting"."users"
          WHERE "id" = $1::uuid
          FOR UPDATE
        `,
        [userId],
      );
      if (!user) throw new NotFoundException('Utilisateur introuvable.');
      if (user.isActive === dto.isActive) {
        throw new BadRequestException(
          dto.isActive
            ? 'Ce compte est déjà actif.'
            : 'Ce compte est déjà désactivé.',
        );
      }
      if (!dto.isActive && user.isPlatformAdmin) {
        const [{ count }] = await manager.query<Array<{ count: string }>>(`
          SELECT COUNT(*) AS "count"
          FROM "accounting"."users"
          WHERE "is_active" = true AND "is_platform_admin" = true
        `);
        if (Number(count) <= 1) {
          throw new ConflictException(
            'Le dernier administrateur actif de Fiscora ne peut pas être désactivé.',
          );
        }
      }

      const [updated] = await manager.query<
        Array<{
          id: string;
          fullName: string;
          email: string;
          isActive: boolean;
          disabledAtUtc: Date | null;
          disabledReason: string | null;
        }>
      >(
        `
          UPDATE "accounting"."users"
          SET
            "is_active" = $2,
            "disabled_at_utc" = CASE WHEN $2 THEN NULL ELSE now() END,
            "disabled_reason" = CASE WHEN $2 THEN NULL ELSE $3 END,
            "disabled_by_user_id" = CASE WHEN $2 THEN NULL ELSE $4::uuid END,
            "updated_at_utc" = now()
          WHERE "id" = $1::uuid
          RETURNING
            "id",
            "full_name" AS "fullName",
            "email",
            "is_active" AS "isActive",
            "disabled_at_utc" AS "disabledAtUtc",
            "disabled_reason" AS "disabledReason"
        `,
        [userId, dto.isActive, dto.reason.trim(), actor.userId],
      );
      if (!dto.isActive) {
        await manager.query(
          `
            UPDATE "accounting"."refresh_tokens"
            SET "revoked_at_utc" = now(), "updated_at_utc" = now()
            WHERE "user_id" = $1::uuid AND "revoked_at_utc" IS NULL
          `,
          [userId],
        );
      }
      await this.writeAudit(
        manager,
        null,
        actor.userId,
        dto.isActive
          ? 'platform_admin.user.reactivated'
          : 'platform_admin.user.disabled',
        'User',
        userId,
        { reason: dto.reason.trim(), targetEmail: user.email },
      );
      return updated;
    });
  }

  async revokeUserSessions(
    actor: JwtUser,
    userId: string,
    dto: RevokePlatformSessionsDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const [user] = await manager.query<
        Array<{ id: string; email: string; fullName: string }>
      >(
        `
          SELECT "id", "email", "full_name" AS "fullName"
          FROM "accounting"."users"
          WHERE "id" = $1::uuid
        `,
        [userId],
      );
      if (!user) throw new NotFoundException('Utilisateur introuvable.');

      const revoked = await manager.query<Array<{ id: string }>>(
        `
          UPDATE "accounting"."refresh_tokens"
          SET "revoked_at_utc" = now(), "updated_at_utc" = now()
          WHERE "user_id" = $1::uuid
            AND "revoked_at_utc" IS NULL
            AND "expires_at_utc" > now()
          RETURNING "id"
        `,
        [userId],
      );
      await this.writeAudit(
        manager,
        null,
        actor.userId,
        'platform_admin.user.sessions_revoked',
        'User',
        userId,
        {
          reason: dto.reason.trim(),
          targetEmail: user.email,
          revokedSessions: revoked.length,
        },
      );
      return { userId, revokedSessions: revoked.length };
    });
  }

  private numericRow(row: CountRow) {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]),
    ) as Record<string, number>;
  }

  private pipeline(
    code: string,
    label: string,
    row: CountRow,
    prefix: 'extraction' | 'invitation' | 'ttn',
  ) {
    const pending = Number(row[`${prefix}Pending`] ?? 0);
    const processing = Number(row[`${prefix}Processing`] ?? 0);
    const failed = Number(row[`${prefix}Failed`] ?? 0);
    const lastFailure = row[`${prefix}LastFailureAtUtc`];
    return {
      code,
      label,
      pending,
      processing,
      failed,
      status: failed > 0 ? 'ERREUR' : processing > 0 ? 'EN_COURS' : 'OK',
      lastFailureAtUtc:
        lastFailure instanceof Date
          ? lastFailure.toISOString()
          : typeof lastFailure === 'string'
            ? lastFailure
            : null,
    };
  }

  private alert(
    code: string,
    label: string,
    count: number,
    severity: 'info' | 'warning' | 'error',
  ) {
    return { code, label, count, severity };
  }

  private async writeAudit(
    manager: EntityManager,
    organizationId: string | null,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    await manager.query(
      `
        INSERT INTO "accounting"."audit_logs"
          ("organization_id", "actor_user_id", "action", "entity_type", "entity_id", "details_json")
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)
      `,
      [
        organizationId,
        actorUserId,
        action,
        entityType,
        entityId,
        JSON.stringify(detailsJson),
      ],
    );
  }
}
