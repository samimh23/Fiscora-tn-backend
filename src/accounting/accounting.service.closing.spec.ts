import { AccountingService } from './accounting.service';
import { FiscalYearStatus } from '../database/entities';

describe('Legacy fiscal-year close', () => {
  it('cannot bypass the controlled accounting closure, even for a past year', async () => {
    const fiscalYears = {
      findOneBy: jest.fn().mockResolvedValue({
        status: FiscalYearStatus.Open,
        endsOn: '2020-12-31',
      }),
      save: jest.fn(),
    };
    const transaction = jest.fn();
    const audit = { save: jest.fn() };
    const access = jest.fn().mockResolvedValue({});
    const service = new AccountingService(
      {} as never,
      {} as never,
      fiscalYears as never,
      {} as never,
      audit as never,
      {} as never,
      { transaction } as never,
      { getAccessibleEntity: access } as never,
    );
    await expect(
      service.closeFiscalYear('org', 'dossier', 'year', 'user'),
    ).rejects.toThrow('Comptabilité → Clôture');
    expect(access).toHaveBeenCalledWith('org', 'dossier', 'user');
    expect(fiscalYears.findOneBy).toHaveBeenCalledWith({
      id: 'year',
      organizationId: 'org',
      dossierId: 'dossier',
    });
    expect(fiscalYears.save).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(audit.save).not.toHaveBeenCalled();
  });
});
