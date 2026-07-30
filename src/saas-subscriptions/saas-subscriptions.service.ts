import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { JwtUser } from '../common/auth.types';
import { SaasBillingCycle, SaasInvoiceStatus } from '../database/entities';
import type {
  CreateSaasInvoiceDto,
  CreateSaasPlanDto,
  RecordSaasPaymentDto,
  UpdateOrganizationSubscriptionDto,
  UpdateSaasPlanDto,
} from './dto';

type Row = Record<string, unknown>;

@Injectable()
export class SaasSubscriptionsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async plans(publicOnly = false) {
    const rows = await this.dataSource.query<Row[]>(
      `
        SELECT
          "id", "code", "name", "description",
          "monthly_price_tnd" AS "monthlyPriceTnd",
          "annual_price_tnd" AS "annualPriceTnd",
          "max_collaborators" AS "maxCollaborators",
          "max_active_dossiers" AS "maxActiveDossiers",
          "max_storage_bytes" AS "maxStorageBytes",
          "monthly_ocr_documents" AS "monthlyOcrDocuments",
          "monthly_ttn_submissions" AS "monthlyTtnSubmissions",
          "features_json" AS "features",
          "is_active" AS "isActive",
          "is_public" AS "isPublic"
        FROM "accounting"."saas_plans"
        ${publicOnly ? 'WHERE "is_active" = true AND "is_public" = true' : ''}
        ORDER BY "display_order", "monthly_price_tnd"
      `,
    );
    return rows.map((row) => this.planRow(row));
  }

  async createPlan(actor: JwtUser, dto: CreateSaasPlanDto) {
    const code = dto.code.trim().toUpperCase().replace(/\s+/g, '_');
    const [existing] = await this.dataSource.query<Row[]>(
      `SELECT "id" FROM "accounting"."saas_plans" WHERE "code" = $1`,
      [code],
    );
    if (existing) throw new ConflictException('Ce code d’offre existe déjà.');
    const [created] = await this.dataSource.query<Row[]>(
      `
        INSERT INTO "accounting"."saas_plans"
          ("code", "name", "description", "monthly_price_tnd", "annual_price_tnd",
           "max_collaborators", "max_active_dossiers", "max_storage_bytes",
           "monthly_ocr_documents", "monthly_ttn_submissions", "features_json")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::bigint, $9, $10, $11::jsonb)
        RETURNING "id"
      `,
      [
        code,
        dto.name.trim(),
        dto.description?.trim() || null,
        dto.monthlyPriceTnd,
        dto.annualPriceTnd,
        dto.maxCollaborators,
        dto.maxActiveDossiers,
        dto.maxStorageGb * 1024 * 1024 * 1024,
        dto.monthlyOcrDocuments,
        dto.monthlyTtnSubmissions,
        JSON.stringify(dto.features ?? {}),
      ],
    );
    await this.audit(
      this.dataSource.manager,
      actor.userId,
      'platform_admin.saas_plan.created',
      'SaasPlan',
      String(created.id),
      { code },
    );
    return (await this.plans()).find((plan) => plan.id === created.id);
  }

  async updatePlan(actor: JwtUser, planId: string, dto: UpdateSaasPlanDto) {
    const [plan] = await this.dataSource.query<Row[]>(
      `SELECT * FROM "accounting"."saas_plans" WHERE "id" = $1::uuid`,
      [planId],
    );
    if (!plan) throw new NotFoundException('Offre introuvable.');
    const values = {
      name: dto.name ?? plan.name,
      description:
        dto.description === undefined ? plan.description : dto.description,
      monthlyPriceTnd: dto.monthlyPriceTnd ?? plan.monthly_price_tnd,
      annualPriceTnd: dto.annualPriceTnd ?? plan.annual_price_tnd,
      maxCollaborators: dto.maxCollaborators ?? plan.max_collaborators,
      maxActiveDossiers: dto.maxActiveDossiers ?? plan.max_active_dossiers,
      maxStorageBytes:
        dto.maxStorageGb === undefined
          ? plan.max_storage_bytes
          : dto.maxStorageGb * 1024 * 1024 * 1024,
      monthlyOcrDocuments:
        dto.monthlyOcrDocuments ?? plan.monthly_ocr_documents,
      monthlyTtnSubmissions:
        dto.monthlyTtnSubmissions ?? plan.monthly_ttn_submissions,
      features: dto.features ?? plan.features_json,
      isActive: dto.isActive ?? plan.is_active,
      isPublic: dto.isPublic ?? plan.is_public,
    };
    await this.dataSource.query(
      `
        UPDATE "accounting"."saas_plans"
        SET "name" = $2, "description" = $3, "monthly_price_tnd" = $4,
            "annual_price_tnd" = $5, "max_collaborators" = $6,
            "max_active_dossiers" = $7, "max_storage_bytes" = $8::bigint,
            "monthly_ocr_documents" = $9, "monthly_ttn_submissions" = $10,
            "features_json" = $11::jsonb, "is_active" = $12,
            "is_public" = $13, "updated_at_utc" = now()
        WHERE "id" = $1::uuid
      `,
      [
        planId,
        values.name,
        values.description,
        values.monthlyPriceTnd,
        values.annualPriceTnd,
        values.maxCollaborators,
        values.maxActiveDossiers,
        values.maxStorageBytes,
        values.monthlyOcrDocuments,
        values.monthlyTtnSubmissions,
        JSON.stringify(values.features),
        values.isActive,
        values.isPublic,
      ],
    );
    await this.audit(
      this.dataSource.manager,
      actor.userId,
      'platform_admin.saas_plan.updated',
      'SaasPlan',
      planId,
      {},
    );
    return (await this.plans()).find((item) => item.id === planId);
  }

  async subscriptions() {
    const rows = await this.subscriptionRows();
    return rows.map((row) => this.subscriptionRow(row));
  }

  async organizationSubscription(organizationId: string) {
    const rows = await this.subscriptionRows(organizationId);
    if (!rows[0]) throw new NotFoundException('Abonnement introuvable.');
    const invoices = await this.invoices(organizationId);
    return { ...this.subscriptionRow(rows[0]), invoices };
  }

  async organizationUsage(organizationId: string) {
    const rows = await this.subscriptionRows(organizationId);
    if (!rows[0]) throw new NotFoundException('Abonnement introuvable.');
    const item = this.subscriptionRow(rows[0]);
    return {
      generatedAtUtc: new Date().toISOString(),
      periodStartUtc: item.currentPeriodStartUtc,
      periodEndUtc: item.currentPeriodEndUtc,
      metrics: item.usage,
    };
  }

  async updateSubscription(
    actor: JwtUser,
    organizationId: string,
    dto: UpdateOrganizationSubscriptionDto,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const [plan] = await manager.query<Row[]>(
        `SELECT "id" FROM "accounting"."saas_plans" WHERE "code" = $1 AND "is_active" = true`,
        [dto.planCode.trim().toUpperCase()],
      );
      if (!plan) throw new NotFoundException('Offre active introuvable.');
      const [subscription] = await manager.query<Row[]>(
        `
          SELECT "id" FROM "accounting"."organization_subscriptions"
          WHERE "organization_id" = $1::uuid FOR UPDATE
        `,
        [organizationId],
      );
      if (!subscription) throw new NotFoundException('Abonnement introuvable.');
      const periodInterval =
        dto.billingCycle === SaasBillingCycle.Annual ? '1 year' : '1 month';
      await manager.query(
        `
          UPDATE "accounting"."organization_subscriptions"
          SET "plan_id" = $2::uuid, "status" = $3, "billing_cycle" = $4,
              "trial_ends_at_utc" = CASE WHEN $3 = 'ESSAI'
                THEN now() + ($5::text || ' days')::interval ELSE NULL END,
              "current_period_start_utc" = now(),
              "current_period_end_utc" = now() + $6::interval,
              "grace_ends_at_utc" = CASE WHEN $3 = 'IMPAYE'
                THEN now() + interval '7 days' ELSE NULL END,
              "cancel_at_period_end" = false,
              "updated_at_utc" = now()
          WHERE "id" = $1::uuid
        `,
        [
          subscription.id,
          plan.id,
          dto.status,
          dto.billingCycle,
          dto.trialDays ?? 30,
          periodInterval,
        ],
      );
      await this.audit(
        manager,
        actor.userId,
        'platform_admin.subscription.updated',
        'OrganizationSubscription',
        String(subscription.id),
        {
          organizationId,
          planCode: dto.planCode,
          status: dto.status,
          billingCycle: dto.billingCycle,
          reason: dto.reason,
        },
        organizationId,
      );
    });
    return this.organizationSubscription(organizationId);
  }

  async invoices(organizationId?: string) {
    const rows = await this.dataSource.query<Row[]>(
      `
        SELECT
          invoice."id", invoice."number",
          invoice."organization_id" AS "organizationId",
          organization."name" AS "organizationName",
          invoice."period_start_utc" AS "periodStartUtc",
          invoice."period_end_utc" AS "periodEndUtc",
          invoice."amount_tnd" AS "amountTnd",
          invoice."due_at_utc" AS "dueAtUtc",
          invoice."status", invoice."paid_at_utc" AS "paidAtUtc",
          invoice."payment_reference" AS "paymentReference",
          invoice."created_at_utc" AS "createdAtUtc"
        FROM "accounting"."saas_subscription_invoices" invoice
        JOIN "accounting"."organizations" organization
          ON organization."id" = invoice."organization_id"
        ${organizationId ? 'WHERE invoice."organization_id" = $1::uuid' : ''}
        ORDER BY invoice."created_at_utc" DESC
        LIMIT 300
      `,
      organizationId ? [organizationId] : [],
    );
    return rows.map((row) => ({
      id: String(row.id),
      number: String(row.number),
      organizationId: String(row.organizationId),
      organizationName: String(row.organizationName),
      periodStartUtc: row.periodStartUtc,
      periodEndUtc: row.periodEndUtc,
      amountTnd: Number(row.amountTnd),
      dueAtUtc: row.dueAtUtc,
      status: row.status,
      paidAtUtc: row.paidAtUtc,
      paymentReference: row.paymentReference,
      createdAtUtc: row.createdAtUtc,
    }));
  }

  async createInvoice(
    actor: JwtUser,
    organizationId: string,
    dto: CreateSaasInvoiceDto,
  ) {
    const invoiceId = await this.dataSource.transaction(async (manager) => {
      const [subscription] = await manager.query<Row[]>(
        `
          SELECT subscription.*, plan."monthly_price_tnd", plan."annual_price_tnd"
          FROM "accounting"."organization_subscriptions" subscription
          JOIN "accounting"."saas_plans" plan ON plan."id" = subscription."plan_id"
          WHERE subscription."organization_id" = $1::uuid
          FOR UPDATE
        `,
        [organizationId],
      );
      if (!subscription) throw new NotFoundException('Abonnement introuvable.');
      const amount =
        subscription.billing_cycle === 'ANNUEL'
          ? subscription.annual_price_tnd
          : subscription.monthly_price_tnd;
      const number = `FSC-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-9)}`;
      const [invoice] = await manager.query<Row[]>(
        `
          INSERT INTO "accounting"."saas_subscription_invoices"
            ("number", "organization_id", "subscription_id", "period_start_utc",
             "period_end_utc", "amount_tnd", "due_at_utc", "status")
          VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6,
                  now() + ($7::text || ' days')::interval, $8)
          RETURNING "id"
        `,
        [
          number,
          organizationId,
          subscription.id,
          subscription.current_period_start_utc,
          subscription.current_period_end_utc,
          amount,
          dto.dueInDays ?? 15,
          dto.status ?? SaasInvoiceStatus.Open,
        ],
      );
      await this.audit(
        manager,
        actor.userId,
        'platform_admin.subscription_invoice.created',
        'SaasSubscriptionInvoice',
        String(invoice.id),
        { organizationId, number, reason: dto.reason },
        organizationId,
      );
      return String(invoice.id);
    });
    return (await this.invoices(organizationId)).find(
      (item) => item.id === invoiceId,
    );
  }

  async recordPayment(
    actor: JwtUser,
    invoiceId: string,
    dto: RecordSaasPaymentDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const [invoice] = await manager.query<Row[]>(
        `
          SELECT "id", "organization_id", "subscription_id", "status"
          FROM "accounting"."saas_subscription_invoices"
          WHERE "id" = $1::uuid FOR UPDATE
        `,
        [invoiceId],
      );
      if (!invoice) throw new NotFoundException('Facture SaaS introuvable.');
      if (invoice.status === SaasInvoiceStatus.Paid) {
        throw new ConflictException('Cette facture est déjà payée.');
      }
      await manager.query(
        `
          UPDATE "accounting"."saas_subscription_invoices"
          SET "status" = 'PAYEE', "paid_at_utc" = now(),
              "payment_reference" = $2, "updated_at_utc" = now()
          WHERE "id" = $1::uuid
        `,
        [invoiceId, dto.paymentReference.trim()],
      );
      await manager.query(
        `
          UPDATE "accounting"."organization_subscriptions"
          SET "status" = 'ACTIF', "grace_ends_at_utc" = NULL,
              "updated_at_utc" = now()
          WHERE "id" = $1::uuid
        `,
        [invoice.subscription_id],
      );
      await this.audit(
        manager,
        actor.userId,
        'platform_admin.subscription_invoice.paid',
        'SaasSubscriptionInvoice',
        invoiceId,
        {
          paymentReference: dto.paymentReference,
          reason: dto.reason,
        },
        String(invoice.organization_id),
      );
      return { id: invoiceId, status: SaasInvoiceStatus.Paid };
    });
  }

  async analytics() {
    const [row] = await this.dataSource.query<Row[]>(`
      SELECT
        COUNT(*) FILTER (WHERE subscription."status" = 'ESSAI') AS "trialing",
        COUNT(*) FILTER (WHERE subscription."status" = 'ACTIF') AS "active",
        COUNT(*) FILTER (WHERE subscription."status" = 'IMPAYE') AS "pastDue",
        COUNT(*) FILTER (WHERE subscription."status" = 'SUSPENDU') AS "suspended",
        COUNT(*) FILTER (WHERE subscription."status" = 'ANNULE') AS "cancelled",
        COALESCE(SUM(
          CASE WHEN subscription."status" IN ('ACTIF', 'IMPAYE')
            THEN CASE WHEN subscription."billing_cycle" = 'ANNUEL'
              THEN plan."annual_price_tnd" / 12
              ELSE plan."monthly_price_tnd"
            END ELSE 0 END
        ), 0) AS "mrrTnd",
        COALESCE((
          SELECT SUM(invoice."amount_tnd")
          FROM "accounting"."saas_subscription_invoices" invoice
          WHERE invoice."status" = 'PAYEE'
            AND invoice."paid_at_utc" >= date_trunc('month', now())
        ), 0) AS "collectedThisMonthTnd",
        (SELECT COUNT(*) FROM "accounting"."saas_subscription_invoices"
          WHERE "status" = 'A_PAYER' AND "due_at_utc" < now()) AS "overdueInvoices",
        (SELECT COALESCE(SUM("amount_tnd"), 0)
          FROM "accounting"."saas_subscription_invoices"
          WHERE "status" = 'A_PAYER' AND "due_at_utc" < now()) AS "overdueAmountTnd"
      FROM "accounting"."organization_subscriptions" subscription
      JOIN "accounting"."saas_plans" plan ON plan."id" = subscription."plan_id"
    `);
    const trialing = Number(row.trialing);
    const active = Number(row.active);
    const pastDue = Number(row.pastDue);
    const suspended = Number(row.suspended);
    const cancelled = Number(row.cancelled);
    const mrrTnd = Number(row.mrrTnd);
    const decided = active + pastDue + suspended + cancelled;
    return {
      generatedAtUtc: new Date().toISOString(),
      subscriptions: { trialing, active, pastDue, suspended, cancelled },
      mrrTnd,
      arrTnd: mrrTnd * 12,
      averageRevenuePerActiveCabinetTnd: active ? mrrTnd / active : 0,
      trialConversionRate: decided ? (active / decided) * 100 : 0,
      churnRate: decided ? (cancelled / decided) * 100 : 0,
      collectedThisMonthTnd: Number(row.collectedThisMonthTnd),
      overdueInvoices: Number(row.overdueInvoices),
      overdueAmountTnd: Number(row.overdueAmountTnd),
    };
  }

  private async subscriptionRows(organizationId?: string) {
    return this.dataSource.query<Row[]>(
      `
        SELECT
          subscription."id",
          subscription."organization_id" AS "organizationId",
          organization."name" AS "organizationName",
          subscription."status",
          subscription."billing_cycle" AS "billingCycle",
          subscription."trial_ends_at_utc" AS "trialEndsAtUtc",
          subscription."current_period_start_utc" AS "currentPeriodStartUtc",
          subscription."current_period_end_utc" AS "currentPeriodEndUtc",
          subscription."grace_ends_at_utc" AS "graceEndsAtUtc",
          subscription."cancel_at_period_end" AS "cancelAtPeriodEnd",
          plan."id" AS "planId", plan."code" AS "planCode",
          plan."name" AS "planName",
          plan."monthly_price_tnd" AS "monthlyPriceTnd",
          plan."annual_price_tnd" AS "annualPriceTnd",
          plan."max_collaborators" AS "maxCollaborators",
          plan."max_active_dossiers" AS "maxActiveDossiers",
          plan."max_storage_bytes" AS "maxStorageBytes",
          plan."monthly_ocr_documents" AS "monthlyOcrDocuments",
          plan."monthly_ttn_submissions" AS "monthlyTtnSubmissions",
          (SELECT COUNT(*) FROM "accounting"."organization_memberships" member
            WHERE member."organization_id" = organization."id"
              AND member."is_active" = true) AS "collaboratorsUsed",
          (SELECT COUNT(*) FROM "accounting"."client_dossiers" dossier
            WHERE dossier."organization_id" = organization."id"
              AND dossier."status" = 'ACTIF') AS "dossiersUsed",
          (SELECT COALESCE(SUM(document."size_bytes"), 0)
            FROM "accounting"."accounting_documents" document
            WHERE document."organization_id" = organization."id"
              AND document."deleted_at_utc" IS NULL) AS "storageUsedBytes",
          (SELECT COUNT(*) FROM "accounting"."accounting_documents" document
            WHERE document."organization_id" = organization."id"
              AND document."created_at_utc" >= subscription."current_period_start_utc"
              AND document."created_at_utc" < subscription."current_period_end_utc"
              AND document."deleted_at_utc" IS NULL) AS "ocrUsed",
          (SELECT COUNT(*) FROM "accounting"."ttn_einvoice_submissions" submission
            WHERE submission."organization_id" = organization."id"
              AND submission."created_at_utc" >= subscription."current_period_start_utc"
              AND submission."created_at_utc" < subscription."current_period_end_utc") AS "ttnUsed"
        FROM "accounting"."organization_subscriptions" subscription
        JOIN "accounting"."organizations" organization
          ON organization."id" = subscription."organization_id"
        JOIN "accounting"."saas_plans" plan ON plan."id" = subscription."plan_id"
        ${organizationId ? 'WHERE organization."id" = $1::uuid' : ''}
        ORDER BY organization."name"
      `,
      organizationId ? [organizationId] : [],
    );
  }

  private subscriptionRow(row: Row) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      status: row.status,
      billingCycle: row.billingCycle,
      trialEndsAtUtc: row.trialEndsAtUtc,
      currentPeriodStartUtc: row.currentPeriodStartUtc,
      currentPeriodEndUtc: row.currentPeriodEndUtc,
      graceEndsAtUtc: row.graceEndsAtUtc,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      plan: {
        id: row.planId,
        code: row.planCode,
        name: row.planName,
        monthlyPriceTnd: Number(row.monthlyPriceTnd),
        annualPriceTnd: Number(row.annualPriceTnd),
      },
      usage: {
        collaborators: this.usage(row.collaboratorsUsed, row.maxCollaborators),
        activeDossiers: this.usage(row.dossiersUsed, row.maxActiveDossiers),
        storageBytes: this.usage(row.storageUsedBytes, row.maxStorageBytes),
        ocrDocuments: this.usage(row.ocrUsed, row.monthlyOcrDocuments),
        ttnSubmissions: this.usage(row.ttnUsed, row.monthlyTtnSubmissions),
      },
    };
  }

  private planRow(row: Row) {
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description,
      monthlyPriceTnd: Number(row.monthlyPriceTnd),
      annualPriceTnd: Number(row.annualPriceTnd),
      maxCollaborators: Number(row.maxCollaborators),
      maxActiveDossiers: Number(row.maxActiveDossiers),
      maxStorageBytes: Number(row.maxStorageBytes),
      maxStorageGb: Number(row.maxStorageBytes) / 1024 / 1024 / 1024,
      monthlyOcrDocuments: Number(row.monthlyOcrDocuments),
      monthlyTtnSubmissions: Number(row.monthlyTtnSubmissions),
      features: row.features,
      isActive: Boolean(row.isActive),
      isPublic: Boolean(row.isPublic),
    };
  }

  private usage(used: unknown, limit: unknown) {
    const usedNumber = Number(used);
    const limitNumber = Number(limit);
    return {
      used: usedNumber,
      limit: limitNumber,
      percentage: limitNumber
        ? Math.min(100, (usedNumber / limitNumber) * 100)
        : 0,
      exceeded: usedNumber > limitNumber,
    };
  }

  private async audit(
    manager: EntityManager,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown>,
    organizationId: string | null = null,
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
        JSON.stringify(details),
      ],
    );
  }
}
