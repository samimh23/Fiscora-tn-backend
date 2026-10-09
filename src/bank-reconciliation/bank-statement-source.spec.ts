import { BankStatement } from '../database/entities';
import { createHash } from 'node:crypto';
import { BankReconciliationService } from './bank-reconciliation.service';

describe('AI bank statement source and retry safety', () => {
  function setup(
    existing: {
      id: string;
      bankAccountId: string;
      closingBalance?: string;
    } | null = null,
  ) {
    const statements = {
      findOne: jest.fn().mockResolvedValue(
        existing
          ? {
              periodStart: '2026-09-01',
              periodEnd: '2026-09-30',
              openingBalance: '100.000',
              closingBalance: '90.000',
              transactions: [
                {
                  fingerprint: createHash('sha256')
                    .update('2026-09-15||-10.000||frais|1')
                    .digest('hex'),
                },
              ],
              ...existing,
            }
          : null,
      ),
      existsBy: jest.fn().mockResolvedValue(false),
    };
    const manager = {
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn((value: unknown) =>
        Promise.resolve(
          Array.isArray(value)
            ? value
            : { id: 'new-statement', ...(value as object) },
        ),
      ),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(manager),
      ),
    };
    const service = Object.create(
      BankReconciliationService.prototype,
    ) as BankReconciliationService;
    Object.assign(service, {
      statements,
      dataSource,
      dossiers: { getAccessibleEntity: jest.fn() },
      bankAccounts: {
        findOneBy: jest.fn().mockResolvedValue({ id: 'account' }),
      },
      transactions: { existsBy: jest.fn().mockResolvedValue(false) },
    });
    jest
      .spyOn(service, 'getStatement')
      .mockResolvedValue({ id: existing?.id ?? 'new-statement' } as never);
    return { service, statements, manager, dataSource };
  }
  const extraction = {
    bank_statement: {
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      opening_balance: '100.000',
      closing_balance: '90.000',
      transactions: [
        {
          transaction_date: '2026-09-15',
          description: 'Frais',
          amount: '-10.000',
        },
      ],
    },
  };

  it('persists the original document ID on a new statement', async () => {
    const { service, manager } = setup();
    await service.importExtractedStatement(
      'org',
      'dossier',
      'user',
      'account',
      'source.png',
      extraction,
      'document',
    );
    expect(manager.create).toHaveBeenCalledWith(
      BankStatement,
      expect.objectContaining({ sourceDocumentId: 'document' }),
    );
  });

  it('reuses a source-linked statement on retry without duplicating rows', async () => {
    const { service, statements, dataSource } = setup({
      id: 'existing',
      bankAccountId: 'account',
    });
    const result = await service.importExtractedStatement(
      'org',
      'dossier',
      'user',
      'account',
      'source.png',
      extraction,
      'document',
    );
    expect(result.id).toBe('existing');
    expect(statements.findOne).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        dossierId: 'dossier',
        sourceDocumentId: 'document',
      },
      relations: { transactions: true },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('cannot reimport the same source into another bank account', async () => {
    const { service, dataSource } = setup({
      id: 'existing',
      bankAccountId: 'other-account',
    });
    await expect(
      service.importExtractedStatement(
        'org',
        'dossier',
        'user',
        'account',
        'source.png',
        extraction,
        'document',
      ),
    ).rejects.toThrow('autre compte');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('cannot approve changed labels over an existing source-linked import', async () => {
    const { service, dataSource } = setup({
      id: 'existing',
      bankAccountId: 'account',
      closingBalance: '80.000',
    });
    await expect(
      service.importExtractedStatement(
        'org',
        'dossier',
        'user',
        'account',
        'source.png',
        extraction,
        'document',
      ),
    ).rejects.toThrow('données différentes');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
