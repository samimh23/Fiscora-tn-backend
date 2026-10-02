import {
  BillingFrequency,
  ClientDossier,
  MemberCompensationType,
  OrganizationMembership,
} from '../database/entities';
import { PermissionNames } from '../database/permissions';
import { estimateContractFee } from './contract-fee';
import { ProductivityService } from './productivity.service';

describe('Agreed dossier fees', () => {
  const monthly = {
    billingFrequency: BillingFrequency.Monthly,
    monthlyFee: '500.000',
    annualFee: '9999.000',
  };
  it('uses the monthly fee once for a full month', () => {
    expect(estimateContractFee(monthly, '2026-10-01', '2026-10-31')).toBe(
      500000n,
    );
  });
  it('prorates partial months using calendar days', () => {
    expect(estimateContractFee(monthly, '2026-10-01', '2026-10-30')).toBe(
      483871n,
    );
    expect(estimateContractFee(monthly, '2026-04-01', '2026-04-15')).toBe(
      250000n,
    );
    expect(estimateContractFee(monthly, '2028-02-01', '2028-02-29')).toBe(
      500000n,
    );
    expect(estimateContractFee(monthly, '2026-10-31', '2026-11-01')).toBe(
      32796n,
    );
  });
  it('counts complete months across the year boundary without daily rounding drift', () => {
    expect(estimateContractFee(monthly, '2026-12-01', '2027-01-31')).toBe(
      1000000n,
    );
  });
  it('spreads annual fees over 12 months and preserves the full-year amount', () => {
    const annual = {
      ...monthly,
      billingFrequency: BillingFrequency.Annual,
      annualFee: '1000.000',
    };
    expect(estimateContractFee(annual, '2026-10-01', '2026-10-31')).toBe(
      83333n,
    );
    expect(estimateContractFee(annual, '2026-01-01', '2026-12-31')).toBe(
      1000000n,
    );
  });
  it('distinguishes missing, zero and unsupported legacy fees', () => {
    expect(
      estimateContractFee(
        { ...monthly, monthlyFee: null },
        '2026-10-01',
        '2026-10-31',
      ),
    ).toBeNull();
    expect(
      estimateContractFee(
        { ...monthly, monthlyFee: '0.000' },
        '2026-10-01',
        '2026-10-31',
      ),
    ).toBe(0n);
    expect(
      estimateContractFee(
        { ...monthly, billingFrequency: BillingFrequency.PerService },
        '2026-10-01',
        '2026-10-31',
      ),
    ).toBeNull();
  });
});

describe('Profitability estimates stay separate from invoices', () => {
  const service = Object.create(
    ProductivityService.prototype,
  ) as ProductivityService;
  const builder = (rows: unknown[]) => {
    const chain = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    return { createQueryBuilder: jest.fn().mockReturnValue(chain), chain };
  };
  const membership = Object.assign(new OrganizationMembership(), {
    id: 'worker',
    user: { fullName: 'Colab' },
  });

  async function run(
    minutes = 600,
    billed = '0.000',
    collected = '0.000',
    withFee = true,
  ) {
    const dossiers = [
      Object.assign(new ClientDossier(), {
        id: 'dossier',
        legalName: 'Client',
        billingFrequency: BillingFrequency.Monthly,
        monthlyFee: withFee ? '500.000' : null,
      }),
    ];
    const entries = builder([
      {
        dossierId: 'dossier',
        membershipId: 'worker',
        membership,
        workDate: '2026-10-02',
        durationMinutes: minutes,
        billable: false,
      },
    ]);
    Object.assign(service, {
      timeEntries: entries,
      costRates: builder([
        {
          membershipId: 'worker',
          compensationType: MemberCompensationType.Hourly,
          payRateAmount: '10.000',
          employerCostRateAmount: '10.000',
          effectiveFrom: '2026-10-01',
          effectiveTo: null,
        },
      ]),
      assignments: { find: jest.fn().mockResolvedValue([]) },
      dataSource: {
        query: jest
          .fn()
          .mockResolvedValue([{ dossier_id: 'dossier', billed, collected }]),
      },
    });
    const actorSpy = jest
      .spyOn(service, 'getActor' as never)
      .mockResolvedValue({
        membership,
        permissions: new Set([PermissionNames.DossiersAssign]),
      } as never);
    const dossierSpy = jest
      .spyOn(service, 'accessibleDossiers' as never)
      .mockResolvedValue(dossiers as never);
    try {
      const result = await service.profitability('org', 'user', {
        from: '2026-10-01',
        to: '2026-10-31',
      });
      expect(entries.chain.andWhere).toHaveBeenCalledWith(
        'entry.status = :status',
        { status: 'APPROUVE' },
      );
      return result;
    } finally {
      actorSpy.mockRestore();
      dossierSpy.mockRestore();
    }
  }

  it('gives 400 estimated margin for 500 monthly fee and ten approved hours at 10/hour, with no invoice', async () => {
    const result = await run();
    expect(result.totals).toMatchObject({
      estimatedRevenueNet: '500.000',
      estimatedMargin: '400.000',
      allocatedEmployerCost: '100.000',
      billedRevenueNet: '0.000',
      collectedRevenueNet: '0.000',
    });
    expect(result.dossiers[0]).toMatchObject({
      estimatedMargin: '400.000',
      estimatedMarginRate: '80.00',
      missingContractFee: false,
    });
    expect(result.members[0]).toMatchObject({
      allocatedEstimatedRevenue: '500.000',
      contributionMarginEstimated: '400.000',
      allocatedBilledRevenue: '0.000',
    });
  });
  it('does not add a real invoice to the agreed estimate or invent receipts', async () => {
    const result = await run(600, '500.000', '200.000');
    expect(result.totals).toMatchObject({
      estimatedRevenueNet: '500.000',
      billedRevenueNet: '500.000',
      collectedRevenueNet: '200.000',
      estimatedMargin: '400.000',
      marginOnBilled: '400.000',
      marginOnCollected: '100.000',
    });
  });
  it('uses precise minutes rather than displayed rounded hours', async () => {
    const result = await run(1);
    expect(result.totals).toMatchObject({
      allocatedEmployerCost: '0.167',
      estimatedMargin: '499.833',
    });
  });
  it('flags missing fees without falling back to invoices', async () => {
    const result = await run(600, '500.000', '0.000', false);
    expect(result.totals).toMatchObject({
      estimatedRevenueNet: '0.000',
      missingContractFeeCount: 1,
    });
    expect(result.dossiers[0].missingContractFee).toBe(true);
  });
});
