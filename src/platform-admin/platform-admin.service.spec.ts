import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import type { JwtUser } from '../common/auth.types';
import { PlatformAdminService } from './platform-admin.service';

const actor: JwtUser = {
  userId: 'cb49f651-b597-4c62-a0df-e0ddae60fc04',
  email: 'owner@fiscora.tn',
  fullName: 'Owner',
  isPlatformAdmin: true,
};

describe('PlatformAdminService', () => {
  it('returns cabinet-specific roles and security flags without exposing authentication secrets', async () => {
    const memberships = [
      {
        organizationId: 'cabinet-1',
        organizationName: 'Cabinet Pro',
        role: 'Collaborateur',
      },
      {
        organizationId: 'cabinet-2',
        organizationName: 'Cabinet Demo',
        role: 'Portail client',
      },
    ];
    const query = jest.fn().mockResolvedValue([
      {
        id: 'user-1',
        membershipsCount: '2',
        activeSessionsCount: '62',
        memberships,
        emailVerified: true,
        mfaEnabled: true,
      },
      {
        id: 'user-2',
        membershipsCount: '0',
        activeSessionsCount: '0',
        memberships: [],
      },
    ]);
    const service = new PlatformAdminService(
      { query } as unknown as DataSource,
      { get: jest.fn() } as unknown as ConfigService,
      { sendTestEmail: jest.fn() } as never,
      { operationalSnapshot: jest.fn() } as never,
    );
    const users = await service.users();
    expect(users[0]).toMatchObject({
      membershipsCount: 2,
      activeSessionsCount: 62,
      memberships,
      emailVerified: true,
      mfaEnabled: true,
    });
    expect(users[1]).toMatchObject({ membershipsCount: 0, memberships: [] });
    const sqlCalls = query.mock.calls as Array<[string]>;
    const sql = sqlCalls[0][0];
    expect(sql).toContain('m."is_active" = true');
    expect(sql).toContain('r."organization_id" = m."organization_id"');
    expect(sql).toContain('u."mfa_enabled" AS "mfaEnabled"');
    expect(sql).not.toMatch(/password_hash|mfa_secret|token_hash/);
  });

  it('combines runtime metrics, pipeline health, and integration status', async () => {
    const operationalSnapshot = jest.fn().mockResolvedValue({
      generatedAtUtc: '2026-09-16T10:00:00.000Z',
      scope: 'CURRENT_API_REPLICA',
      windowMinutes: 60,
      runtime: { status: 'OPERATIONNEL' },
      http: { requestsTotal: 12, errors5xx: 1 },
      database: { status: 'OPERATIONNEL', latencyMs: 4 },
      history: [],
    });
    const query = jest.fn().mockResolvedValue([
      {
        extractionPending: '2',
        extractionProcessing: '1',
        extractionFailed: '0',
        invitationPending: '0',
        invitationProcessing: '0',
        invitationFailed: '1',
        ttnPending: '0',
        ttnProcessing: '0',
        ttnFailed: '0',
      },
    ]);
    const configured = new Set([
      'APPLICATIONINSIGHTS_CONNECTION_STRING',
      'DOCUMENT_EXTRACTION_ENABLED',
      'SMTP_HOST',
    ]);
    const service = new PlatformAdminService(
      { query } as unknown as DataSource,
      {
        get: jest.fn((key: string, fallback?: string) =>
          configured.has(key)
            ? key.endsWith('_ENABLED')
              ? 'true'
              : 'set'
            : fallback,
        ),
      } as unknown as ConfigService,
      { sendTestEmail: jest.fn() } as never,
      { operationalSnapshot } as never,
    );

    const monitoring = await service.monitoring();

    expect(monitoring.http.requestsTotal).toBe(12);
    expect(monitoring.pipelines).toHaveLength(3);
    expect(monitoring.pipelines[0]).toMatchObject({
      code: 'DOCUMENT_EXTRACTION',
      pending: 2,
      processing: 1,
    });
    expect(monitoring.integrations).toEqual({
      applicationInsightsConfigured: true,
      documentExtractionEnabled: true,
      assistantEnabled: false,
      emailConfigured: true,
    });
  });

  it('reports operational failures without customer overdue tasks', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          organizationsTotal: '2',
          organizationsActive: '2',
          usersTotal: '3',
          usersActive: '3',
          platformAdmins: '1',
          activeSessions: '2',
          dossiersActive: '4',
          documentsTotal: '8',
          storageBytes: '1024',
          extractionsFailed: '2',
          invitationsFailed: '0',
          ttnFailed: '0',
          ttnProductionConnections: '0',
        },
      ]);
    const service = new PlatformAdminService(
      { query } as unknown as DataSource,
      {
        get: jest.fn((_key: string, fallback?: string) => fallback),
      } as unknown as ConfigService,
      { sendTestEmail: jest.fn() } as never,
      { operationalSnapshot: jest.fn() } as never,
    );

    const overview = await service.overview();

    expect(overview.alerts.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'EXTRACTIONS_ECHEC',
        'ADMINISTRATEUR_UNIQUE',
        'SAUVEGARDE_NON_CONFIGUREE',
      ]),
    );
    expect(overview.alerts.map((item) => item.code)).not.toContain(
      'TACHES_EN_RETARD',
    );
    expect(overview.totals).not.toHaveProperty('tasksOverdue');
  });

  it.each([
    {
      provider: 'azure',
      values: {
        OBJECT_STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT_URL: 'https://fiscora.blob.core.windows.net/',
        AZURE_STORAGE_CONTAINER: 'accounting-documents',
      },
      detail: 'Stockage Azure Blob configuré (accounting-documents).',
    },
    {
      provider: 'minio',
      values: {
        OBJECT_STORAGE_PROVIDER: 'minio',
        MINIO_ENDPOINT: 'localhost',
      },
      detail: 'Stockage MinIO configuré.',
    },
  ])(
    'reports $provider document storage as configured',
    async ({ values, detail }) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{}]);
      const service = new PlatformAdminService(
        { query } as unknown as DataSource,
        {
          get: jest.fn((key: string, fallback?: string) =>
            key in values ? values[key as keyof typeof values] : fallback,
          ),
        } as unknown as ConfigService,
        { sendTestEmail: jest.fn() } as never,
        { operationalSnapshot: jest.fn() } as never,
      );

      const overview = await service.overview();
      const storage = overview.services.find(
        (item) => item.code === 'OBJECT_STORAGE',
      );

      expect(storage).toMatchObject({ status: 'CONFIGURE', detail });
    },
  );

  it('prevents an administrator from disabling their own account', async () => {
    const service = new PlatformAdminService(
      {} as DataSource,
      {} as ConfigService,
      { sendTestEmail: jest.fn() } as never,
      { operationalSnapshot: jest.fn() } as never,
    );

    await expect(
      service.updateUserStatus(actor, actor.userId, {
        isActive: false,
        reason: 'Test de sécurité',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents disabling the last active platform administrator', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: '2acbd709-8f3a-4e6e-8087-e337130773ae',
            email: 'backup@fiscora.tn',
            fullName: 'Backup admin',
            isActive: true,
            isPlatformAdmin: true,
          },
        ])
        .mockResolvedValueOnce([{ count: '1' }]),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        (callback: (entityManager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      ),
    } as unknown as DataSource;
    const service = new PlatformAdminService(
      dataSource,
      {} as ConfigService,
      { sendTestEmail: jest.fn() } as never,
      { operationalSnapshot: jest.fn() } as never,
    );

    await expect(
      service.updateUserStatus(actor, '2acbd709-8f3a-4e6e-8087-e337130773ae', {
        isActive: false,
        reason: 'Test du dernier administrateur',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
