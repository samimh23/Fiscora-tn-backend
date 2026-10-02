import {
  BillingFrequency,
  ClientDossier,
  DossierAssignmentRole,
  MemberCompensationType,
  OrganizationMembership,
} from '../database/entities';
import { PermissionNames, SystemRoleNames } from '../database/permissions';
import { CreateMemberCostRateDto } from './dto';
import { ProductivityService } from './productivity.service';

describe('Portal clients are not cabinet workers', () => {
  const member = (id: string, role: string) =>
    Object.assign(new OrganizationMembership(), {
      id,
      user: { fullName: id },
      role: { name: role, normalizedName: role.toUpperCase() },
    });
  const portal = member('Moula', SystemRoleNames.ClientPortal);
  const worker = member('Colab', SystemRoleNames.Collaborator);
  const owner = member('Owner', SystemRoleNames.Owner);
  const rate = (membership: OrganizationMembership) => ({
    id: membership.id,
    membershipId: membership.id,
    membership,
    compensationType: MemberCompensationType.Hourly,
    payRateAmount: '10.000',
    employerCostRateAmount: '10.000',
    monthlyTargetMinutes: 9600,
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
  });
  const builder = (rows: unknown[]) => ({
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    }),
  });

  it.each([DossierAssignmentRole.Client, DossierAssignmentRole.Support])(
    'excludes portal assignments (%s), historical hours and costs but keeps internal staff',
    async (assignmentRole) => {
      const service = Object.create(
        ProductivityService.prototype,
      ) as ProductivityService;
      Object.assign(service, {
        assignments: {
          find: jest.fn().mockResolvedValue(
            [portal, worker, owner].map((membership) => ({
              dossierId: 'dossier',
              membershipId: membership.id,
              membership,
              assignmentRole:
                membership === portal
                  ? assignmentRole
                  : DossierAssignmentRole.Support,
              monthlyTimeBudgetMinutes: 600,
            })),
          ),
        },
        timeEntries: builder(
          [portal, worker, owner].map((membership) => ({
            dossierId: 'dossier',
            membershipId: membership.id,
            membership,
            durationMinutes: 60,
            billable: true,
            workDate: '2026-10-02',
          })),
        ),
        costRates: builder([portal, worker, owner].map(rate)),
        dataSource: { query: jest.fn().mockResolvedValue([]) },
      });
      const actor = jest.spyOn(service, 'getActor' as never).mockResolvedValue({
        membership: owner,
        permissions: new Set([PermissionNames.DossiersAssign]),
      } as never);
      const dossiers = jest
        .spyOn(service, 'accessibleDossiers' as never)
        .mockResolvedValue([
          Object.assign(new ClientDossier(), {
            id: 'dossier',
            legalName: 'Client',
            billingFrequency: BillingFrequency.Monthly,
            monthlyFee: '500.000',
          }),
        ] as never);
      try {
        const result = await service.profitability('org', 'owner', {
          from: '2026-10-01',
          to: '2026-10-31',
        });
        expect(result.members.map((row) => row.membershipId)).toEqual([
          'Colab',
          'Owner',
        ]);
        expect(result.dossiers[0]).toMatchObject({
          approvedHours: '2.00',
          budgetHours: '20.00',
          allocatedEmployerCost: '20.000',
          estimatedMargin: '480.000',
        });
        expect(result.dossiers[0].workers).toHaveLength(2);
        expect(
          result.members.map((row) => row.allocatedEstimatedRevenue),
        ).toEqual(['250.000', '250.000']);
      } finally {
        actor.mockRestore();
        dossiers.mockRestore();
      }
    },
  );

  it('hides legacy portal cost rates without deleting them', async () => {
    const service = Object.create(
      ProductivityService.prototype,
    ) as ProductivityService;
    const repository = {
      find: jest
        .fn()
        .mockResolvedValue([rate(portal), rate(worker), rate(owner)]),
      delete: jest.fn(),
    };
    Object.assign(service, { costRates: repository });
    expect(
      (await service.listCostRates('org')).map((row) => row.membershipId),
    ).toEqual(['Colab', 'Owner']);
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: { membership: { user: true, role: true } },
      }),
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('rejects portal cost creation before writing anything', async () => {
    const service = Object.create(
      ProductivityService.prototype,
    ) as ProductivityService;
    const save = jest.fn();
    Object.assign(service, {
      memberships: { findOne: jest.fn().mockResolvedValue(portal) },
      costRates: { save },
    });
    await expect(
      service.createCostRate(
        'org',
        'owner',
        Object.assign(new CreateMemberCostRateDto(), {
          membershipId: portal.id,
          compensationType: MemberCompensationType.Hourly,
          payRateAmount: '10.000',
          employerCostRateAmount: '10.000',
          effectiveFrom: '2026-10-01',
        }),
      ),
    ).rejects.toThrow(
      'Un compte portail client ne peut pas avoir de coût collaborateur.',
    );
    expect(save).not.toHaveBeenCalled();
  });
});
