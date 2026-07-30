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

  it('prevents an administrator from disabling their own account', async () => {
    const service = new PlatformAdminService(
      {} as DataSource,
      {} as ConfigService,
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
    const service = new PlatformAdminService(dataSource, {} as ConfigService);

    await expect(
      service.updateUserStatus(actor, '2acbd709-8f3a-4e6e-8087-e337130773ae', {
        isActive: false,
        reason: 'Test du dernier administrateur',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
