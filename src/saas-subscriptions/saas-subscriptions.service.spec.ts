import type { DataSource } from 'typeorm';
import { SaasSubscriptionsService } from './saas-subscriptions.service';

describe('SaasSubscriptionsService', () => {
  it('calcule les indicateurs SaaS sans mélanger les honoraires clients', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        trialing: '4',
        active: '10',
        pastDue: '2',
        suspended: '1',
        cancelled: '3',
        mrrTnd: '1490.000',
        collectedThisMonthTnd: '1200.000',
        overdueInvoices: '2',
        overdueAmountTnd: '298.000',
      },
    ]);
    const service = new SaasSubscriptionsService({
      query,
    } as unknown as DataSource);

    const result = await service.analytics();

    expect(result.mrrTnd).toBe(1490);
    expect(result.arrTnd).toBe(17880);
    expect(result.averageRevenuePerActiveCabinetTnd).toBe(149);
    expect(result.subscriptions.trialing).toBe(4);
    expect(result.overdueAmountTnd).toBe(298);
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
  });
});
