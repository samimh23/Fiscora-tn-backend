import { ObligationsService } from './obligations.service';
import {
  DossierStatus,
  ObligationFrequency,
  ObligationStatus,
} from '../database/entities';

describe('Fiscal calendar generation and existing declarations', () => {
  function setup(existing: boolean) {
    const template = {
      id: 'template',
      code: 'DECLARATION_MENSUELLE_REEL',
      version: 1,
      organizationId: null,
      frequency: ObligationFrequency.Monthly,
      dueDay: 28,
      dueMonthOffset: 1,
      applicability: {},
      name: 'Mensuelle',
    };
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([template]),
    };
    const instances = {
      findOneBy: jest
        .fn()
        .mockResolvedValue(existing ? { id: 'obligation' } : null),
      create: jest.fn((value: object) => ({ ...value, id: 'obligation' })),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const tasks = { save: jest.fn(), create: jest.fn() };
    const checklist = { save: jest.fn(), create: jest.fn() };
    const workflow = {
      reconcileGeneratedDeclaration: jest
        .fn()
        .mockResolvedValue(ObligationStatus.Filed),
    };
    const service = new ObligationsService(
      {
        getAccessibleEntity: jest.fn().mockResolvedValue({
          status: DossierStatus.Active,
          legalForm: 'SARL',
          isTotallyExporting: false,
        }),
      } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(builder) } as never,
      instances as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {
        create: jest.fn((value: object) => value),
        save: jest.fn().mockResolvedValue(undefined),
      } as never,
      tasks as never,
      checklist as never,
      workflow as never,
    );
    return { service, instances, tasks, checklist, workflow };
  }
  it('does not create redundant preparation tasks after a previously filed declaration', async () => {
    const ctx = setup(false);
    const result = await ctx.service.generate('org', 'dossier', 'user', 2026);
    expect(result).toMatchObject({ created: 12, existing: 0 });
    expect(ctx.workflow.reconcileGeneratedDeclaration).toHaveBeenCalledTimes(
      12,
    );
    expect(ctx.tasks.save).not.toHaveBeenCalled();
    expect(ctx.checklist.save).not.toHaveBeenCalled();
  });
  it('also reconciles already-generated instances when regenerating the calendar', async () => {
    const ctx = setup(true);
    const result = await ctx.service.generate('org', 'dossier', 'user', 2026);
    expect(result).toMatchObject({ created: 0, existing: 12 });
    expect(ctx.workflow.reconcileGeneratedDeclaration).toHaveBeenCalledTimes(
      12,
    );
    expect(ctx.instances.save).not.toHaveBeenCalled();
    expect(ctx.tasks.save).not.toHaveBeenCalled();
  });
});
