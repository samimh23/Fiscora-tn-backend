import { LiveFinancialService } from './live-financial.service';
import type { LiveFinancialIntent } from './live-financial-intent';
import { PermissionNames } from '../database/permissions';

const baseIntent: LiveFinancialIntent = {
  operation: 'BALANCES',
  partyName: null,
  partyType: 'ANY',
  invoiceNumber: null,
  paymentReference: null,
  year: null,
  unsupportedPeriod: false,
};
const invoice = {
  id: 'invoice',
  number: 'A-001',
  type: 'ACHAT',
  kind: 'FACTURE',
  status: 'COMPTABILISEE',
  invoice_date: '2026-09-01',
  due_date: '2026-09-30',
  third_party_name: 'MYTEK',
  net_amount: '100.000',
  vat_amount: '19.000',
  gross_amount: '120.000',
  net_payable: '120.000',
  paid_amount: '50.000',
  credited_amount: '10.000',
  outstanding_amount: '60.000',
  currency_code: 'TND',
};
const payment = {
  id: 'payment',
  reference: 'VIR-1',
  payment_date: '2026-09-02',
  status: 'COMPTABILISE',
  direction: 'DECAISSEMENT',
  method: 'Virement',
  amount: '50.000',
  allocated_amount: '50.000',
  instrument_status: null,
  correction_type: null,
  correction_date: null,
  correction_reason: null,
};
const balance = {
  ...invoice,
  supplier_due: '60.000',
  supplier_refund: '20.000',
  customer_due: '90.000',
  customer_refund: '5.000',
  record_count: '1',
};

function setup(
  permissions = [
    PermissionNames.BusinessInvoicesView,
    PermissionNames.ThirdPartiesView,
    PermissionNames.PaymentsView,
    PermissionNames.FinancialStatementsView,
  ],
) {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
  const getAccessibleEntity = jest.fn().mockResolvedValue({});
  const findOne = jest.fn().mockResolvedValue({
    organization: { isActive: true },
    role: {
      rolePermissions: permissions.map((permissionName) => ({
        permissionName,
      })),
    },
  });
  const getReport = jest.fn();
  const service = new LiveFinancialService(
    { query } as never,
    { getAccessibleEntity } as never,
    { findOne } as never,
    { getReport } as never,
  );
  const ask = (change: Partial<LiveFinancialIntent> = {}) =>
    service.answer('org', 'dossier', 'user', { ...baseIntent, ...change });
  return { service, ask, query, getAccessibleEntity, findOne, getReport };
}

describe('LiveFinancialService permissions and scope', () => {
  it.each(['BALANCES', 'INVOICE_DETAILS', 'FINANCIAL_SUMMARY'] as const)(
    'denies %s without its permissions before querying financial records',
    async (operation) => {
      const test = setup([]);
      await expect(test.ask({ operation })).rejects.toThrow('permissions');
      expect(test.query).not.toHaveBeenCalled();
      expect(test.getReport).not.toHaveBeenCalled();
      expect(test.getAccessibleEntity).toHaveBeenCalledWith(
        'org',
        'dossier',
        'user',
      );
      expect(test.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org', userId: 'user', isActive: true },
        }),
      );
    },
  );
  it('requires payment permission for invoice/payment history, not just invoice access', async () => {
    const test = setup([PermissionNames.BusinessInvoicesView]);
    await expect(
      test.ask({ operation: 'INVOICE_DETAILS', invoiceNumber: 'A-001' }),
    ).rejects.toThrow('permissions');
    expect(test.query).not.toHaveBeenCalled();
  });
  it('stops on inaccessible dossier and inactive membership', async () => {
    const test = setup();
    test.getAccessibleEntity.mockRejectedValueOnce(new Error('not accessible'));
    await expect(test.ask()).rejects.toThrow('not accessible');
    expect(test.findOne).not.toHaveBeenCalled();
    test.findOne.mockResolvedValueOnce({
      organization: { isActive: false },
      role: { rolePermissions: [] },
    });
    await expect(test.ask()).rejects.toThrow('permissions');
    expect(test.query).not.toHaveBeenCalled();
  });
  it.each([{ year: 2025 }, { unsupportedPeriod: true }])(
    'does not silently answer historical balances as current: %j',
    async (change) => {
      const test = setup();
      const result = await test.ask(change);
      expect(result.answer).toContain('état actuel');
      expect(result.citations).toEqual([]);
      expect(test.query).not.toHaveBeenCalled();
    },
  );
});

describe('LiveFinancialService balances', () => {
  it('uses current outstanding amounts, separates refunds, and cites records', async () => {
    const test = setup();
    test.query.mockResolvedValueOnce([balance]);
    const result = await test.ask();
    expect(result.answer).toContain('À payer aux fournisseurs : 60.000');
    expect(result.answer).toContain('à récupérer des fournisseurs : 20.000');
    expect(result.answer).toContain('À recevoir des clients : 90.000');
    expect(result.answer).toContain('à rembourser aux clients : 5.000');
    expect(result.citations[1]).toMatchObject({
      kind: 'BUSINESS_INVOICE',
      sourceId: 'invoice',
      path: '/factures?dossierId=dossier',
    });
    const [sql, params] = test.query.mock.calls[0];
    expect(params.slice(0, 2)).toEqual(['org', 'dossier']);
    expect(sql).toContain("kind='FACTURE' AND status='COMPTABILISEE'");
    expect(sql).toContain('GREATEST(-outstanding_amount,0)');
    expect(sql).not.toContain('outstanding_amount-paid_amount');
  });
  it('matches a named supplier only inside the accessible dossier', async () => {
    const test = setup();
    test.query
      .mockResolvedValueOnce([
        {
          id: 'supplier',
          name: 'MYTEK',
          tax_identifier: 'MF123',
          type: 'FOURNISSEUR',
        },
      ])
      .mockResolvedValueOnce([balance]);
    const result = await test.ask({
      partyName: 'MYTEK',
      partyType: 'SUPPLIER',
    });
    expect(result.answer).toContain('MYTEK');
    expect(result.answer).not.toContain('À recevoir des clients');
    expect(test.query.mock.calls[1][1]).toEqual([
      'org',
      'dossier',
      true,
      'supplier',
      'MYTEK',
      'MF123',
      'SUPPLIER',
    ]);
    expect(result.answer).toContain('sans tiers lié');
  });
  it('supports invoices without a linked third-party record using their exact name and tax identity', async () => {
    const test = setup();
    test.query
      .mockResolvedValueOnce([
        {
          id: null,
          name: 'MYTEK',
          tax_identifier: 'MF123',
          type: 'FOURNISSEUR',
        },
      ])
      .mockResolvedValueOnce([balance]);
    await test.ask({ partyName: 'MYTEK', partyType: 'SUPPLIER' });
    expect(test.query.mock.calls[1][1]).toEqual([
      'org',
      'dossier',
      true,
      null,
      'MYTEK',
      'MF123',
      'SUPPLIER',
    ]);
    expect(test.query.mock.calls[1][0]).toContain(
      'third_party_id IS NULL AND third_party_name=$5',
    );
  });
  it('asks for clarification rather than summing two matching suppliers', async () => {
    const test = setup();
    test.query.mockResolvedValueOnce([
      { id: 'a', name: 'ABC SARL', tax_identifier: '1', type: 'FOURNISSEUR' },
      {
        id: 'b',
        name: 'ABC SERVICES',
        tax_identifier: '2',
        type: 'FOURNISSEUR',
      },
    ]);
    const result = await test.ask({ partyName: 'ABC', partyType: 'SUPPLIER' });
    expect(result.answer).toContain('Plusieurs tiers');
    expect(result.citations).toEqual([]);
    expect(test.query).toHaveBeenCalledTimes(1);
  });
  it('does not confuse missing party with zero debt and escapes LIKE wildcards', async () => {
    const test = setup();
    test.query.mockResolvedValueOnce([]);
    const result = await test.ask({ partyName: "A%_'; DROP TABLE users;--" });
    expect(result.answer).toContain('ne signifie pas que le solde est nul');
    expect(test.query.mock.calls[0][0]).not.toContain('DROP TABLE');
    expect(test.query.mock.calls[0][1][2]).toBe(
      "%A\\%\\_'; DROP TABLE users;--%",
    );
  });
  it('reports zero for a known party with no posted outstanding invoices', async () => {
    const test = setup();
    test.query
      .mockResolvedValueOnce([
        { id: 'a', name: 'ABC', tax_identifier: null, type: 'CLIENT' },
      ])
      .mockResolvedValueOnce([]);
    expect(
      (await test.ask({ partyName: 'ABC', partyType: 'CUSTOMER' })).answer,
    ).toContain('À recevoir des clients : 0.000');
  });
  it('limits displayed records without limiting the SQL aggregate', async () => {
    const test = setup();
    test.query.mockResolvedValueOnce(
      Array.from({ length: 31 }, (_, index) => ({
        ...balance,
        id: `invoice-${index}`,
        number: `A-${index}`,
        record_count: '800',
        supplier_due: '10000.000',
      })),
    );
    const result = await test.ask();
    expect(result.answer).toContain('10000.000');
    expect(result.answer).toContain('30 factures affichées sur 800');
    expect(result.citations).toHaveLength(31);
    expect(test.query.mock.calls[0][0]).toMatch(/OVER\(\).*LIMIT 31/s);
  });
});

describe('LiveFinancialService invoice/payment details', () => {
  it('lists invoice amounts, canceled payments, posted credit notes and corrections without re-subtracting history', async () => {
    const test = setup();
    test.query
      .mockResolvedValueOnce([invoice])
      .mockResolvedValueOnce([
        {
          ...payment,
          status: 'ANNULE',
          correction_type: 'ANNULATION_SAISIE',
          correction_date: '2026-09-03',
          correction_reason: 'Wrong entry',
        },
      ])
      .mockResolvedValueOnce([
        {
          ...invoice,
          id: 'credit',
          number: 'AV-1',
          net_payable: '10.000',
          kind: 'AVOIR',
        },
      ]);
    const result = await test.ask({
      operation: 'INVOICE_DETAILS',
      invoiceNumber: 'A-001',
    });
    expect(result.answer).toContain('solde signé 60.000');
    expect(result.answer).toContain('ANNULE');
    expect(result.answer).toContain('ANNULATION_SAISIE');
    expect(result.answer).toContain('Avoir AV-1 : 10.000');
    expect(result.citations.map((citation) => citation.kind)).toEqual([
      'BUSINESS_INVOICE',
      'PAYMENT',
      'BUSINESS_INVOICE',
    ]);
    for (const call of test.query.mock.calls)
      expect(call[1].slice(0, 2)).toEqual(['org', 'dossier']);
    expect(test.query.mock.calls[1][1][2]).toBe('invoice');
  });
  it('labels draft invoice balances as unpublished', async () => {
    const test = setup();
    test.query
      .mockResolvedValueOnce([{ ...invoice, status: 'BROUILLON' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const result = await test.ask({
      operation: 'INVOICE_DETAILS',
      invoiceNumber: 'A-001',
    });
    expect(result.answer).toContain('n’est pas comptabilisée');
    expect(result.answer).toContain('Aucun règlement affecté');
  });
  it.each([
    { records: [] },
    { records: [invoice, { ...invoice, id: 'sale', type: 'VENTE' }] },
  ])(
    'does not guess a missing or ambiguous invoice: %j',
    async ({ records }) => {
      const test = setup();
      test.query.mockResolvedValueOnce(records);
      const result = await test.ask({
        operation: 'INVOICE_DETAILS',
        invoiceNumber: 'A-001',
      });
      expect(result.citations).toEqual([]);
      expect(test.query).toHaveBeenCalledTimes(1);
    },
  );
  it('requires an explicit invoice number or payment reference', async () => {
    const test = setup();
    expect((await test.ask({ operation: 'INVOICE_DETAILS' })).answer).toContain(
      'Quel numéro',
    );
    expect(test.query).not.toHaveBeenCalled();
  });
  it('resolves payment reference and displays its allocation and instrument status', async () => {
    const test = setup();
    test.query
      .mockResolvedValueOnce([
        { ...payment, method: 'Chèque', instrument_status: 'DEPOSE' },
      ])
      .mockResolvedValueOnce([{ ...invoice, allocated_amount: '50.000' }]);
    const result = await test.ask({
      operation: 'INVOICE_DETAILS',
      paymentReference: 'VIR-1',
    });
    expect(result.answer).toContain('instrument DEPOSE');
    expect(result.answer).toContain('ne prouve pas');
    expect(result.answer).toContain('affectation 50.000');
    expect(test.query.mock.calls[0][1]).toEqual(['org', 'dossier', 'VIR-1']);
    expect(test.query.mock.calls[1][1]).toEqual(['org', 'dossier', 'payment']);
  });
});

describe('LiveFinancialService financial summary', () => {
  const report = {
    source: 'TEMPS_REEL',
    generatedAtUtc: '2026-09-30T12:00:00Z',
    dossier: { legalName: 'Demo SARL' },
    currencyCode: 'TND',
    period: { startsOn: '2026-01-01', endsOn: '2026-12-31' },
    incomeStatement: {
      operatingResult: { current: '300.000' },
      ordinaryResultBeforeTax: { current: '250.000' },
      netResult: { current: '200.000' },
      lines: [
        { label: 'Revenus', current: '1000.000' },
        { label: 'Achats', current: '700.000' },
      ],
    },
    balanceSheet: {
      totalAssets: { current: '2000.000' },
      totalEquityAndLiabilities: { current: '2000.000' },
    },
    cashFlowStatement: {
      closingCash: { current: '500.000' },
      cashVariation: { current: '100.000' },
    },
    controls: [],
    mappingWarnings: [],
  };
  it('uses the existing annual report, not invoice TTC subtraction', async () => {
    const test = setup();
    test.getReport.mockResolvedValue(report);
    const result = await test.ask({
      operation: 'FINANCIAL_SUMMARY',
      year: 2026,
    });
    expect(test.getReport).toHaveBeenCalledWith('org', 'dossier', 2026, 'user');
    expect(test.query).not.toHaveBeenCalled();
    expect(result.answer).toContain('résultat net : 200.000');
    expect(result.answer).toContain('Revenus : 1000.000');
    expect(result.answer).toContain('Ce n’est pas un solde bancaire');
    expect(result.citations[0].path).toBe(
      '/etats-financiers?dossierId=dossier&year=2026',
    );
  });
  it('identifies finalized reports and warns about anomalies and missing mappings', async () => {
    const test = setup();
    test.getReport.mockResolvedValue({
      ...report,
      source: 'SNAPSHOT_DEFINITIF',
      snapshot: {
        id: 'snapshot',
        version: 2,
        finalizedAtUtc: '2026-09-01T00:00:00Z',
      },
      controls: [{ status: 'ANOMALIE', label: 'Balance', message: 'Écart' }],
      mappingWarnings: [{ code: '601' }],
    });
    const result = await test.ask({
      operation: 'FINANCIAL_SUMMARY',
      year: 2026,
    });
    expect(result.answer).toContain('états finalisés, version 2');
    expect(result.answer).toContain('Contrôle à vérifier');
    expect(result.answer).toContain('résumé peut être incomplet');
    expect(result.citations[0].sourceId).toBe('snapshot');
  });
  it('asks for a year instead of assuming one', async () => {
    const test = setup();
    const result = await test.ask({ operation: 'FINANCIAL_SUMMARY' });
    expect(result.answer).toContain('quel exercice');
    expect(test.getReport).not.toHaveBeenCalled();
  });
});
