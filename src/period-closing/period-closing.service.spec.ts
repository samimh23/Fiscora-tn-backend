import { EntityManager } from 'typeorm';
import {
  AccountingYearClosing,
  FiscalYear,
  FiscalYearStatus,
  JournalType,
  LedgerAccountType,
} from '../database/entities';
import { PeriodClosingService } from './period-closing.service';

describe('Controlled annual closure', () => {
  function setup() {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      existsBy: jest.fn().mockResolvedValue(false),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((_entity: unknown, value: object) => value),
      save: jest.fn((value: object) =>
        Promise.resolve({ ...value, id: 'closing' }),
      ),
      findOneOrFail: jest.fn().mockResolvedValue({ id: 'closing' }),
    };
    const transaction = jest.fn((run: (m: EntityManager) => unknown) =>
      run(manager as unknown as EntityManager),
    );
    const service = new PeriodClosingService(
      { transaction } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOneBy: jest
          .fn()
          .mockResolvedValue({ id: 'result', type: LedgerAccountType.Equity }),
      } as never,
      {
        findOneBy: jest.fn().mockResolvedValue({
          id: 'journal',
          type: JournalType.Miscellaneous,
        }),
      } as never,
      {} as never,
      { assertDateOpen: jest.fn() } as never,
    );
    jest.spyOn(service, 'yearReadiness').mockResolvedValue({
      startsOn: '2025-01-01',
      endsOn: '2025-12-31',
      existingClosing: null,
      unlockedPeriods: [],
      ready: true,
    } as never);
    jest
      .spyOn(service as never, 'accountBalances')
      .mockResolvedValue([] as never);
    jest
      .spyOn(service as never, 'createAutomaticEntry')
      .mockResolvedValue(null as never);
    jest.spyOn(service as never, 'audit').mockResolvedValue(undefined as never);
    return { service, manager, transaction };
  }
  const dto = {
    closingJournalId: 'journal',
    openingJournalId: 'journal',
    resultAccountId: 'result',
  };
  it('updates fiscal-year status and provenance inside the closure transaction', async () => {
    const { service, manager } = setup();
    await service.closeYear('org', 'dossier', 2025, 'user', dto);
    expect(manager.create).toHaveBeenCalledWith(
      AccountingYearClosing,
      expect.objectContaining({ closedByUserId: 'user' }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      FiscalYear,
      {
        organizationId: 'org',
        dossierId: 'dossier',
        startsOn: '2025-01-01',
        endsOn: '2025-12-31',
      },
      expect.objectContaining({
        status: FiscalYearStatus.Closed,
        closedByUserId: 'user',
      }),
    );
  });
  it('rejects unready years without entering a transaction', async () => {
    const { service, transaction } = setup();
    jest.spyOn(service, 'yearReadiness').mockResolvedValue({
      startsOn: '2025-01-01',
      endsOn: '2025-12-31',
      existingClosing: null,
      unlockedPeriods: [{ year: 2025, month: 1 }],
      ready: false,
    } as never);
    await expect(
      service.closeYear('org', 'dossier', 2025, 'user', dto),
    ).rejects.toThrow('verrouillées');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('does not update the fiscal-year if entry creation fails', async () => {
    const { service, manager } = setup();
    jest
      .spyOn(service as never, 'createAutomaticEntry')
      .mockRejectedValue(new Error('entry failed') as never);
    await expect(
      service.closeYear('org', 'dossier', 2025, 'user', dto),
    ).rejects.toThrow('entry failed');
    expect(manager.update).not.toHaveBeenCalled();
  });
});
