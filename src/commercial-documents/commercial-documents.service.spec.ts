import type { DataSource, Repository } from 'typeorm';
import {
  AccountingDocument,
  CommercialDocument,
  CommercialDocumentDirection,
  CommercialDocumentKind,
  CommercialDocumentStatus,
  LedgerAccount,
  ThirdParty,
  ThirdPartyType,
} from '../database/entities';
import type { DossiersService } from '../dossiers/dossiers.service';
import type { FiscalSettingsService } from '../fiscal-settings/fiscal-settings.service';
import type { DocumentObjectStorage } from '../documents/object-storage/object-storage';
import { CommercialDocumentsService } from './commercial-documents.service';

describe('CommercialDocumentsService client invoice publication', () => {
  it('publishes a confirmed sales invoice into the accounting collection', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const dossierId = '22222222-2222-4222-8222-222222222222';
    const documentId = '33333333-3333-4333-8333-333333333333';
    const userId = '44444444-4444-4444-8444-444444444444';
    const document = {
      id: documentId,
      organizationId,
      dossierId,
      direction: CommercialDocumentDirection.Sale,
      kind: CommercialDocumentKind.Invoice,
      status: CommercialDocumentStatus.Draft,
      number: 'FAC-2026-001',
      issueDate: '2026-09-17',
      validUntil: null,
      thirdPartyId: '55555555-5555-4555-8555-555555555555',
      thirdParty: {
        name: 'Client Démo',
        email: 'client@example.com',
        address: 'Tunis',
        taxIdentifier: '1234567/A/M/000',
        type: ThirdPartyType.Customer,
      },
      currencyCode: 'TND',
      netAmount: '100.000',
      vatAmount: '19.000',
      grossAmount: '119.000',
      accountingDocumentId: null,
      notes: null,
      lines: [
        {
          description: 'Prestation',
          quantity: '1.000',
          unitPrice: '100.000',
          vatRate: '0.19000',
          grossAmount: '119.000',
        },
      ],
    } as CommercialDocument;
    const documents = {
      findOne: jest.fn().mockResolvedValue(document),
    } as unknown as Repository<CommercialDocument>;
    const putObject = jest.fn().mockResolvedValue(undefined);
    const objectStorage = { putObject } as unknown as DocumentObjectStorage;
    const dossiers = {
      getAccessibleEntity: jest.fn().mockResolvedValue({
        id: dossierId,
        legalName: 'Société Démo',
        tradeName: 'Démo',
        taxIdentifier: '7654321/B/M/000',
        rneNumber: 'B1234562026',
      }),
    } as unknown as DossiersService;
    const create = jest.fn((entity: unknown, value: Record<string, unknown>) =>
      entity === AccountingDocument
        ? { id: '66666666-6666-4666-8666-666666666666', ...value }
        : value,
    );
    const save = jest.fn((value: unknown) => Promise.resolve(value));
    const manager = { create, save };
    const dataSource = {
      transaction: jest.fn(
        (work: (input: typeof manager) => Promise<unknown>) => work(manager),
      ),
    } as unknown as DataSource;
    const service = new CommercialDocumentsService(
      dataSource,
      documents,
      {} as Repository<ThirdParty>,
      {} as Repository<LedgerAccount>,
      objectStorage,
      dossiers,
      {} as FiscalSettingsService,
    );

    const result = await service.confirm(
      organizationId,
      dossierId,
      documentId,
      userId,
    );

    expect(putObject).toHaveBeenCalledWith(
      expect.stringContaining('/generated-sales-invoices/'),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(create).toHaveBeenCalledWith(
      AccountingDocument,
      expect.objectContaining({
        category: 'FACTURES_VENTES',
        processingStatus: 'A_TRAITER',
        extractionStatus: 'VALIDEE',
        ingestionSource: 'GENERATED',
        isClientVisible: true,
      }),
    );
    expect(result).toMatchObject({
      status: CommercialDocumentStatus.Confirmed,
      accountingDocumentId: '66666666-6666-4666-8666-666666666666',
    });
  });
});
