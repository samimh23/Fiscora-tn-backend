import type { DataSource } from 'typeorm';
import { SaasSubscriptionsService } from './saas-subscriptions.service';

describe('SaasSubscriptionsService', () => {
  it('returns only supported subscription usage without querying TTN', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        collaboratorsUsed: '2',
        maxCollaborators: '10',
        dossiersUsed: '4',
        maxActiveDossiers: '100',
        storageUsedBytes: '1024',
        maxStorageBytes: '2048',
        ocrUsed: '3',
        monthlyOcrDocuments: '200',
      },
    ]);
    const service = new SaasSubscriptionsService({
      query,
    } as unknown as DataSource);

    const result = await service.organizationUsage('org');
    expect(Object.keys(result.metrics)).toEqual([
      'collaborators',
      'activeDossiers',
      'storageBytes',
      'ocrDocuments',
    ]);
    expect(result.metrics.ocrDocuments).toMatchObject({ used: 3, limit: 200 });
    const sqlCalls = query.mock.calls as Array<[string]>;
    expect(sqlCalls[0][0]).not.toContain('ttn_einvoice');
  });

  it('retourne des limites numériques exploitables par le front', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: 'f8ac0da1-f7dc-46aa-9c4e-f3caf444adcc',
        code: 'PRO',
        name: 'Professionnel',
        description: 'Cabinets en croissance',
        monthlyPriceTnd: '149.000',
        annualPriceTnd: '1490.000',
        maxCollaborators: '10',
        maxActiveDossiers: '100',
        maxStorageBytes: '53687091200',
        monthlyOcrDocuments: '1500',
        monthlyTtnSubmissions: '1000',
        features: { reportingAdvanced: true },
        isActive: true,
        isPublic: true,
      },
    ]);
    const service = new SaasSubscriptionsService({
      query,
    } as unknown as DataSource);

    const [plan] = await service.plans();

    expect(plan.monthlyPriceTnd).toBe(149);
    expect(plan.maxStorageGb).toBe(50);
    expect(plan.maxActiveDossiers).toBe(100);
    expect(plan).not.toHaveProperty('monthlyTtnSubmissions');
  });
});
