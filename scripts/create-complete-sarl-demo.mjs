import { readFile } from 'node:fs/promises';

const API = process.env.DEMO_API_URL ?? 'http://localhost:3000';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo.sarl.complete@comptatn.tn';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoSarl2026!';
const ORGANIZATION_NAME =
  process.env.DEMO_ORGANIZATION_NAME ?? 'Cabinet Démo Compta TN';
const OWNER_NAME =
  process.env.DEMO_OWNER_NAME ?? 'Sami Démo Expert-Comptable';
const PDF_DIRECTORY = new URL('../output/pdf/sarl-demo/', import.meta.url);

let token = '';

function log(message) {
  process.stdout.write(`[demo] ${message}\n`);
}

async function request(method, path, body, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: payload,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const error = new Error(
      `${method} ${path} -> ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function upload(path, name, mimeType, content, fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  form.append('isClientVisible', 'true');
  form.append('file', new Blob([content], { type: mimeType }), name);
  return request('POST', path, form);
}

async function demoPdf(name) {
  return readFile(new URL(name, PDF_DIRECTORY));
}

async function authenticate() {
  try {
    const existing = await request('POST', '/api/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    token = existing.accessToken;
    return existing;
  } catch (error) {
    if (error.status !== 401) throw error;
  }
  const created = await request('POST', '/api/auth/register', {
    fullName: OWNER_NAME,
    email: EMAIL,
    password: PASSWORD,
    organizationName: ORGANIZATION_NAME,
  });
  token = created.accessToken;
  return created;
}

async function finishExistingScenario(root, organization, dossier) {
  const dossierRoot = `${root}/dossiers/${dossier.id}`;
  log('Reprise contrôlée du scénario existant');

  const tasks = await request('GET', `${dossierRoot}/tasks?pageSize=100`);
  const task = tasks.items?.find((item) =>
    item.title.includes('comptabilité de juin 2026'),
  );
  if (task?.status === 'EN_COURS') {
    await request('PATCH', `${dossierRoot}/tasks/${task.id}/progress`, {
      status: 'PRETE_POUR_REVISION',
      comment: 'Contrôles terminés.',
    });
    await request('POST', `${dossierRoot}/tasks/${task.id}/complete`);
  } else if (task?.status === 'PRETE_POUR_REVISION') {
    await request('POST', `${dossierRoot}/tasks/${task.id}/complete`);
  }

  let feeInvoices = await request('GET', `${dossierRoot}/invoices`);
  let feeInvoice = feeInvoices.find(
    (item) => item.description === 'Honoraires comptables — juin 2026',
  );
  if (!feeInvoice) {
    feeInvoice = await request('POST', `${dossierRoot}/invoices`, {
      issueDate: '2026-06-30',
      dueDate: '2026-07-15',
      description: 'Honoraires comptables — juin 2026',
      netAmount: '600.000',
      vatRate: '0.19000',
      stampDuty: '1.000',
      notes: 'Facture pédagogique du cabinet.',
    });
  }
  if (feeInvoice.status === 'BROUILLON') {
    feeInvoice = await request(
      'POST',
      `${dossierRoot}/invoices/${feeInvoice.id}/send`,
    );
  }
  if (feeInvoice.status === 'ENVOYEE') {
    feeInvoice = await request(
      'POST',
      `${dossierRoot}/invoices/${feeInvoice.id}/payments`,
      {
        paymentDate: '2026-07-10',
        amount: '715.000',
        reference: 'HON-JUIN-2026',
      },
    );
  }

  await request('POST', `${dossierRoot}/obligations/generate`, { year: 2026 });
  const documentRoot = `${dossierRoot}/documents`;
  const documents = await request(
    'GET',
    `${documentRoot}?periodYear=2026&periodMonth=6`,
  );
  let receiptDocument = documents.find(
    (item) => item.originalName === 'accuse-depot-declaration-juin-2026.pdf',
  );
  if (!receiptDocument) {
    receiptDocument = await upload(
      documentRoot,
      'accuse-depot-declaration-juin-2026.pdf',
      'application/pdf',
      await demoPdf('accuse-depot-declaration-juin-2026.pdf'),
      { category: 'DECLARATIONS', periodYear: 2026, periodMonth: 6 },
    );
  }

  let declarations = await request(
    'GET',
    `${dossierRoot}/monthly-declarations?year=2026`,
  );
  let declaration = declarations.find(
    (item) => item.periodYear === 2026 && item.periodMonth === 6,
  );
  if (!declaration) {
    declaration = await request(
      'POST',
      `${dossierRoot}/monthly-declarations/prepare`,
      { periodYear: 2026, periodMonth: 6 },
    );
  }
  if (Number(declaration.checksJson?.blockingCount ?? 0) > 0) {
    throw new Error(
      `La déclaration contient des contrôles bloquants: ${JSON.stringify(declaration.checksJson)}`,
    );
  }
  if (['BROUILLON', 'REJETEE'].includes(declaration.status)) {
    declaration = await request(
      'POST',
      `${dossierRoot}/monthly-declarations/${declaration.id}/review`,
      { comment: 'Déclaration de démonstration contrôlée.' },
    );
  }
  if (declaration.status === 'PRETE_POUR_REVISION') {
    declaration = await request(
      'POST',
      `${dossierRoot}/monthly-declarations/${declaration.id}/validate`,
    );
  }
  if (declaration.status === 'VALIDEE') {
    declaration = await request(
      'POST',
      `${dossierRoot}/monthly-declarations/${declaration.id}/file`,
      {
        filingReference: 'DEMO-DECL-2026-06-0001',
        receiptDocumentId: receiptDocument.id,
      },
    );
  }

  const [
    invoices,
    payments,
    statements,
    employees,
    payrollRuns,
    assets,
    obligations,
    billing,
    profitability,
    trialBalance,
  ] = await Promise.all([
    request('GET', `${dossierRoot}/business-invoices`),
    request('GET', `${dossierRoot}/payments`),
    request('GET', `${dossierRoot}/bank-reconciliation/statements`),
    request('GET', `${dossierRoot}/employees`),
    request('GET', `${dossierRoot}/payroll-runs`),
    request('GET', `${dossierRoot}/fixed-assets`),
    request('GET', `${dossierRoot}/obligations?year=2026`),
    request('GET', `${root}/billing/summary`),
    request('GET', `${root}/profitability?from=2026-06-01&to=2026-06-30`),
    request(
      'GET',
      `${dossierRoot}/reports/trial-balance?from=2026-01-01&to=2026-06-30`,
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        credentials: { email: EMAIL, password: PASSWORD },
        url: 'http://127.0.0.1:5173/',
        organization: { id: organization.id, name: organization.name },
        dossier: {
          id: dossier.id,
          legalName: dossier.legalName,
          tradeName: dossier.tradeName,
        },
        sample: {
          postedInvoices: invoices.filter(
            (item) => item.status === 'COMPTABILISEE',
          ).length,
          postedPayments: payments.filter(
            (item) => item.status === 'COMPTABILISE',
          ).length,
          bankStatements: statements.map((item) => ({
            id: item.id,
            status: item.status,
          })),
          employees: employees.length,
          payrollRuns: payrollRuns.map((item) => ({
            periodMonth: item.periodMonth,
            status: item.status,
          })),
          fixedAssets: assets.length,
          declaration: {
            id: declaration.id,
            status: declaration.status,
            totalDue: declaration.totalDue,
            reference: declaration.filingReference,
          },
          obligations: obligations.length,
          billing,
          profitability,
          trialBalanceAccounts: Array.isArray(trialBalance)
            ? trialBalance.length
            : trialBalance.items?.length,
        },
      },
      null,
      2,
    ),
  );
}

async function main() {
  await request('GET', '/health');
  log('API disponible');

  const auth = await authenticate();
  const organization =
    auth.organizations.find((item) => item.name === ORGANIZATION_NAME) ??
    auth.organizations[0];
  if (!organization)
    throw new Error('Organisation de démonstration introuvable.');
  const organizationId = organization.id;
  const root = `/api/organizations/${organizationId}`;

  const existingDossiers = await request(
    'GET',
    `${root}/dossiers?pageSize=100`,
  );
  const alreadyCreated = existingDossiers.items?.find(
    (item) => item.legalName === 'TechNova Solutions SARL',
  );
  if (alreadyCreated) {
    await finishExistingScenario(root, organization, alreadyCreated);
    return;
  }

  log('Configuration du cabinet et de l’exercice');
  await request('PUT', `${root}/company-profile`, {
    legalName: `${ORGANIZATION_NAME} SARL`,
    tradingName: ORGANIZATION_NAME,
    taxIdentifier: '1789456/A/M/000',
    registrationNumber: 'B01123452026',
    countryCode: 'TN',
    baseCurrencyCode: 'TND',
    addressLine1: '12 avenue Habib-Bourguiba',
    city: 'Tunis',
    postalCode: '1001',
    phone: '+216 71 000 111',
    email: 'contact.demo@comptatn.tn',
  });
  await request('POST', `${root}/fiscal-years`, {
    name: 'Exercice 2026',
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
  });

  log('Création des paramètres fiscaux versionnés de démonstration');
  const fiscalSource = {
    sourceLabel: 'Jeu de démonstration Compta TN — valeurs à confirmer',
    sourceUrl: 'https://www.finances.gov.tn/',
  };
  const parameters = [
    ['TFP_TAUX_INDUSTRIE', 'TFP industrie — démonstration', 'TAUX', '0.01000'],
    [
      'TFP_TAUX_AUTRES',
      'TFP autres activités — démonstration',
      'TAUX',
      '0.02000',
    ],
    ['FOPROLOS_TAUX', 'FOPROLOS — démonstration', 'TAUX', '0.01000'],
    ['TCL_TAUX', 'TCL — démonstration', 'TAUX', '0.00200'],
    ['TIMBRE_MONTANT', 'Droit de timbre — démonstration', 'MONTANT', '1.00000'],
  ];
  for (const [code, label, valueType, value] of parameters) {
    await request('POST', `${root}/fiscal-settings/parameters`, {
      code,
      label,
      valueType,
      value,
      effectiveFrom: '2026-01-01',
      notes:
        'Paramètre pédagogique. Vérifier le texte officiel avant utilisation réelle.',
      ...fiscalSource,
    });
  }
  for (const [code, label, rate] of [
    ['TVA19', 'TVA 19 % — démonstration', '0.19000'],
    ['TVA13', 'TVA 13 % — démonstration', '0.13000'],
    ['TVA7', 'TVA 7 % — démonstration', '0.07000'],
  ]) {
    await request('POST', `${root}/fiscal-settings/vat-rates`, {
      code,
      label,
      rate,
      effectiveFrom: '2026-01-01',
      ...fiscalSource,
    });
  }
  await request('POST', `${root}/fiscal-settings/withholding-rates`, {
    natureCode: 'HONORAIRES',
    label: 'Retenue honoraires — démonstration',
    rate: '0.01500',
    effectiveFrom: '2026-01-01',
    ...fiscalSource,
  });

  log('Création de la SARL, du contact principal et de l’affectation');
  const dossier = await request('POST', `${root}/dossiers`, {
    legalName: 'TechNova Solutions SARL',
    tradeName: 'TechNova',
    taxIdentifier: '1765432/B/M/000',
    rneNumber: 'B02198762025',
    vatCode: 'TVA',
    customsCode: 'TN-TECH-2026',
    legalForm: 'SARL',
    taxRegime: 'REEL',
    isVatSubject: true,
    hasVatSuspension: false,
    isTotallyExporting: false,
    activitySector: 'Services informatiques et conseil',
    cnssEmployerNumber: 'CNSS-884422-10',
    employeeCount: 1,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
    monthlyFee: '600.000',
    annualFee: '7200.000',
    billingFrequency: 'MENSUELLE',
    internalNotes:
      'Dossier entièrement fictif créé pour présenter tous les modules.',
    tags: ['DEMO', 'SARL', 'SERVICES', 'TVA'],
  });
  const dossierId = dossier.id;
  const dossierRoot = `${root}/dossiers/${dossierId}`;
  await request('POST', `${dossierRoot}/contacts`, {
    fullName: 'Mehdi Ben Salah',
    role: 'Gérant',
    phone: '+216 22 345 678',
    email: 'mehdi.demo@technova.tn',
    whatsappNumber: '+216 22 345 678',
    isPrimary: true,
  });
  const members = await request('GET', `${root}/members`);
  const ownerMembership =
    members.find((item) => item.email === EMAIL) ?? members[0];
  const ownerMembershipId = ownerMembership.membershipId ?? ownerMembership.id;
  await request('PUT', `${dossierRoot}/assignments/${ownerMembershipId}`, {
    assignmentRole: 'RESPONSABLE',
    isActive: true,
    monthlyTimeBudgetMinutes: 1200,
  });

  log('Plan comptable, comptes spécialisés et journaux');
  await request('POST', `${root}/ledger-accounts/apply-starter-template`);
  let accounts = await request(
    'GET',
    `${root}/ledger-accounts?includeInactive=true`,
  );
  const accountDefinitions = [
    ['411100', 'Client Alpha Distribution', 'Asset', 'Debit'],
    ['411200', 'Client Carthage Retail', 'Asset', 'Debit'],
    ['401100', 'Fournisseur Bureau Plus', 'Liability', 'Credit'],
    ['401200', 'Fournisseur Digital Systems', 'Liability', 'Credit'],
    ['532100', 'Banque BIAT — compte courant', 'Asset', 'Debit'],
    ['604100', 'Achats de services et sous-traitance', 'Expense', 'Debit'],
    ['606300', 'Fournitures administratives', 'Expense', 'Debit'],
    ['706100', 'Prestations de services informatiques', 'Revenue', 'Credit'],
    ['218300', 'Matériel informatique', 'Asset', 'Debit'],
    ['281830', 'Amortissements du matériel informatique', 'Asset', 'Credit'],
    ['681120', 'Dotations aux amortissements', 'Expense', 'Debit'],
    ['436620', 'TVA déductible', 'Asset', 'Debit'],
    ['436710', 'TVA collectée', 'Liability', 'Credit'],
    ['437100', 'Retenues à la source', 'Liability', 'Credit'],
    ['436500', 'Droits de timbre', 'Liability', 'Credit'],
    ['658100', 'Frais bancaires', 'Expense', 'Debit'],
  ];
  for (const [code, name, type, normalBalance] of accountDefinitions) {
    if (!accounts.some((item) => item.code === code)) {
      await request('POST', `${root}/ledger-accounts`, {
        code,
        name,
        description: 'Compte créé pour le scénario de démonstration SARL.',
        type,
        normalBalance,
        allowsPosting: true,
      });
    }
  }
  accounts = await request(
    'GET',
    `${root}/ledger-accounts?includeInactive=true`,
  );
  const account = (code) => {
    const item = accounts.find((candidate) => candidate.code === code);
    if (!item) throw new Error(`Compte ${code} introuvable.`);
    return item.id;
  };
  const journals = {};
  for (const [key, code, name, type] of [
    ['purchases', 'ACH', 'Journal des achats', 'ACHATS'],
    ['sales', 'VEN', 'Journal des ventes', 'VENTES'],
    ['bank', 'BQ', 'Journal Banque BIAT', 'BANQUE'],
    ['misc', 'OD', 'Opérations diverses', 'OPERATIONS_DIVERSES'],
    ['payroll', 'PAIE', 'Journal de paie', 'PAIE'],
  ]) {
    journals[key] = await request('POST', `${dossierRoot}/journals`, {
      code,
      name,
      type,
    });
  }

  log('Documents commerciaux et pièces attendues');
  const documentRoot = `${dossierRoot}/documents`;
  const salesDocument = await upload(
    documentRoot,
    'facture-vente-fv-2026-001.pdf',
    'application/pdf',
    await demoPdf('facture-vente-fv-2026-001.pdf'),
    { category: 'FACTURES_VENTES', periodYear: 2026, periodMonth: 6 },
  );
  await request('PATCH', `${documentRoot}/${salesDocument.id}`, {
    category: 'FACTURES_VENTES',
    periodYear: 2026,
    periodMonth: 6,
    processingStatus: 'TRAITE',
  });
  const expectation = await request('POST', `${documentRoot}/missing`, {
    periodYear: 2026,
    periodMonth: 6,
    label: 'Facture principale de vente de juin',
    category: 'FACTURES_VENTES',
  });
  await request(
    'PATCH',
    `${documentRoot}/missing/${expectation.id}/receive/${salesDocument.id}`,
  );
  const purchaseDocument = await upload(
    documentRoot,
    'facture-achat-fa-2026-062.pdf',
    'application/pdf',
    await demoPdf('facture-achat-fa-2026-062.pdf'),
    { category: 'FACTURES_ACHATS', periodYear: 2026, periodMonth: 6 },
  );
  await request('PATCH', `${documentRoot}/${purchaseDocument.id}`, {
    category: 'FACTURES_ACHATS',
    periodYear: 2026,
    periodMonth: 6,
    processingStatus: 'TRAITE',
  });

  log('Clients, fournisseurs et factures comptabilisées');
  const thirdPartyRoot = dossierRoot;
  const customerAlpha = await request(
    'POST',
    `${thirdPartyRoot}/third-parties`,
    {
      type: 'CLIENT',
      name: 'Alpha Distribution SARL',
      taxIdentifier: '1234567/C/A/000',
      rneNumber: 'B01111112024',
      email: 'finance@alpha-demo.tn',
      phone: '+216 71 111 111',
      address: 'Charguia 1, Tunis',
      receivableAccountId: account('411100'),
    },
  );
  const customerCarthage = await request(
    'POST',
    `${thirdPartyRoot}/third-parties`,
    {
      type: 'CLIENT',
      name: 'Carthage Retail SA',
      taxIdentifier: '2345678/D/A/000',
      rneNumber: 'B02222222023',
      email: 'compta@carthage-demo.tn',
      receivableAccountId: account('411200'),
    },
  );
  const supplierOffice = await request(
    'POST',
    `${thirdPartyRoot}/third-parties`,
    {
      type: 'FOURNISSEUR',
      name: 'Bureau Plus SARL',
      taxIdentifier: '3456789/E/A/000',
      rneNumber: 'B03333332022',
      email: 'facturation@bureauplus-demo.tn',
      payableAccountId: account('401100'),
    },
  );
  const supplierDigital = await request(
    'POST',
    `${thirdPartyRoot}/third-parties`,
    {
      type: 'FOURNISSEUR',
      name: 'Digital Systems SARL',
      taxIdentifier: '4567890/F/A/000',
      rneNumber: 'B04444442021',
      email: 'sales@digitalsystems-demo.tn',
      payableAccountId: account('401200'),
    },
  );

  const invoiceRoot = `${dossierRoot}/business-invoices`;
  async function createAndPostInvoice(dto) {
    const draft = await request('POST', invoiceRoot, dto);
    await request('POST', `${invoiceRoot}/${draft.id}/validate`);
    return request('POST', `${invoiceRoot}/${draft.id}/post`);
  }
  const saleOne = await createAndPostInvoice({
    type: 'VENTE',
    kind: 'FACTURE',
    number: 'FV-2026-001',
    invoiceDate: '2026-06-03',
    dueDate: '2026-06-30',
    thirdPartyId: customerAlpha.id,
    thirdPartyName: customerAlpha.name,
    thirdPartyTaxIdentifier: customerAlpha.taxIdentifier,
    journalId: journals.sales.id,
    thirdPartyAccountId: account('411100'),
    vatAccountId: account('436710'),
    stampAccountId: account('436500'),
    stampDuty: '1.000',
    sourceDocumentId: salesDocument.id,
    notes: 'Développement d’un portail B2B — démonstration.',
    lines: [
      {
        accountId: account('706100'),
        description: 'Développement portail B2B',
        quantity: '1.000',
        unitPrice: '10000.000',
        discountRate: '0.00000',
        vatCode: 'TVA19',
      },
    ],
  });
  const saleTwo = await createAndPostInvoice({
    type: 'VENTE',
    kind: 'FACTURE',
    number: 'FV-2026-002',
    invoiceDate: '2026-06-12',
    dueDate: '2026-07-12',
    thirdPartyId: customerCarthage.id,
    thirdPartyName: customerCarthage.name,
    thirdPartyTaxIdentifier: customerCarthage.taxIdentifier,
    journalId: journals.sales.id,
    thirdPartyAccountId: account('411200'),
    vatAccountId: account('436710'),
    stampAccountId: account('436500'),
    stampDuty: '1.000',
    notes: 'Contrat de maintenance — paiement partiel.',
    lines: [
      {
        accountId: account('706100'),
        description: 'Maintenance annuelle — acompte',
        quantity: '1.000',
        unitPrice: '5000.000',
        discountRate: '0.00000',
        vatCode: 'TVA19',
      },
    ],
  });
  const purchaseRent = await createAndPostInvoice({
    type: 'ACHAT',
    kind: 'FACTURE',
    number: 'FA-2026-061',
    invoiceDate: '2026-06-05',
    dueDate: '2026-06-20',
    thirdPartyId: supplierOffice.id,
    thirdPartyName: supplierOffice.name,
    thirdPartyTaxIdentifier: supplierOffice.taxIdentifier,
    journalId: journals.purchases.id,
    thirdPartyAccountId: account('401100'),
    vatAccountId: account('436620'),
    stampAccountId: account('436500'),
    stampDuty: '1.000',
    notes: 'Sous-traitance et services administratifs.',
    lines: [
      {
        accountId: account('604100'),
        description: 'Services de sous-traitance',
        quantity: '1.000',
        unitPrice: '2000.000',
        discountRate: '0.00000',
        vatCode: 'TVA19',
      },
    ],
  });
  const purchaseComputer = await createAndPostInvoice({
    type: 'ACHAT',
    kind: 'FACTURE',
    number: 'FA-2026-062',
    invoiceDate: '2026-06-07',
    dueDate: '2026-06-25',
    thirdPartyId: supplierDigital.id,
    thirdPartyName: supplierDigital.name,
    thirdPartyTaxIdentifier: supplierDigital.taxIdentifier,
    journalId: journals.purchases.id,
    thirdPartyAccountId: account('401200'),
    vatAccountId: account('436620'),
    stampAccountId: account('436500'),
    stampDuty: '1.000',
    notes: 'Acquisition ordinateur de développement.',
    sourceDocumentId: purchaseDocument.id,
    lines: [
      {
        accountId: account('218300'),
        description: 'Ordinateur portable professionnel',
        quantity: '1.000',
        unitPrice: '3000.000',
        discountRate: '0.00000',
        vatCode: 'TVA19',
      },
    ],
  });

  log('Encaissements, décaissements et lettrage');
  async function createAndPostPayment(dto) {
    const draft = await request('POST', `${dossierRoot}/payments`, dto);
    return request('POST', `${dossierRoot}/payments/${draft.id}/post`);
  }
  const receiptAlpha = await createAndPostPayment({
    thirdPartyId: customerAlpha.id,
    direction: 'ENCAISSEMENT',
    paymentDate: '2026-06-10',
    amount: saleOne.outstandingAmount,
    method: 'Virement bancaire',
    reference: 'ENC-ALPHA-001',
    journalId: journals.bank.id,
    cashAccountId: account('532100'),
    thirdPartyAccountId: account('411100'),
    allocations: [{ invoiceId: saleOne.id, amount: saleOne.outstandingAmount }],
  });
  const receiptCarthage = await createAndPostPayment({
    thirdPartyId: customerCarthage.id,
    direction: 'ENCAISSEMENT',
    paymentDate: '2026-06-18',
    amount: '3000.000',
    method: 'Virement bancaire',
    reference: 'ENC-CARTHAGE-001',
    journalId: journals.bank.id,
    cashAccountId: account('532100'),
    thirdPartyAccountId: account('411200'),
    allocations: [{ invoiceId: saleTwo.id, amount: '3000.000' }],
  });
  const paymentOffice = await createAndPostPayment({
    thirdPartyId: supplierOffice.id,
    direction: 'DECAISSEMENT',
    paymentDate: '2026-06-20',
    amount: purchaseRent.outstandingAmount,
    method: 'Virement bancaire',
    reference: 'DEC-BUREAU-001',
    journalId: journals.bank.id,
    cashAccountId: account('532100'),
    thirdPartyAccountId: account('401100'),
    allocations: [
      { invoiceId: purchaseRent.id, amount: purchaseRent.outstandingAmount },
    ],
  });
  const paymentDigital = await createAndPostPayment({
    thirdPartyId: supplierDigital.id,
    direction: 'DECAISSEMENT',
    paymentDate: '2026-06-25',
    amount: purchaseComputer.outstandingAmount,
    method: 'Virement bancaire',
    reference: 'DEC-DIGITAL-001',
    journalId: journals.bank.id,
    cashAccountId: account('532100'),
    thirdPartyAccountId: account('401200'),
    allocations: [
      {
        invoiceId: purchaseComputer.id,
        amount: purchaseComputer.outstandingAmount,
      },
    ],
  });

  log('Relevé bancaire et rapprochement automatique');
  const bankRoot = `${dossierRoot}/bank-reconciliation`;
  const bankAccount = await request('POST', `${bankRoot}/accounts`, {
    name: 'Compte courant BIAT Démo',
    bankName: 'BIAT',
    iban: 'TN59 1000 6035 1835 9847 8831',
    ledgerAccountId: account('532100'),
    journalId: journals.bank.id,
    currency: 'TND',
  });
  const bankCsv = [
    'Date;Libelle;Reference;Montant',
    `2026-06-10;Virement Alpha Distribution;ENC-ALPHA-001;${receiptAlpha.amount}`,
    `2026-06-18;Virement Carthage Retail;ENC-CARTHAGE-001;${receiptCarthage.amount}`,
    `2026-06-20;Virement Bureau Plus;DEC-BUREAU-001;-${paymentOffice.amount}`,
    `2026-06-25;Virement Digital Systems;DEC-DIGITAL-001;-${paymentDigital.amount}`,
  ].join('\n');
  const statementForm = new FormData();
  statementForm.append('bankAccountId', bankAccount.id);
  statementForm.append('periodStart', '2026-06-01');
  statementForm.append('periodEnd', '2026-06-30');
  statementForm.append('openingBalance', '0.000');
  statementForm.append('closingBalance', '8949.000');
  statementForm.append(
    'file',
    new Blob([bankCsv], { type: 'text/csv' }),
    'releve-biat-juin-2026.csv',
  );
  const statement = await request(
    'POST',
    `${bankRoot}/statements/import`,
    statementForm,
  );
  const autoMatch = await request(
    'POST',
    `${bankRoot}/statements/${statement.id}/auto-match`,
  );
  const reconciledStatement = await request(
    'POST',
    `${bankRoot}/statements/${statement.id}/reconcile`,
  );
  await upload(
    documentRoot,
    'releve-bancaire-biat-juin-2026.pdf',
    'application/pdf',
    await demoPdf('releve-bancaire-biat-juin-2026.pdf'),
    {
      category: 'RELEVES_BANCAIRES',
      periodYear: 2026,
      periodMonth: 6,
    },
  );

  log('Paie et CNSS');
  const employee = await request('POST', `${dossierRoot}/employees`, {
    fullName: 'Amira Trabelsi',
    cin: '11223344',
    cnssNumber: '01234567-89',
    hireDate: '2026-01-02',
    contractType: 'CDI',
    grossSalary: '1800.000',
  });
  const payroll = await request('POST', `${dossierRoot}/payroll-runs`, {
    periodYear: 2026,
    periodMonth: 6,
  });
  const validatedPayroll = await request(
    'POST',
    `${dossierRoot}/payroll-runs/${payroll.id}/validate`,
  );
  await upload(
    documentRoot,
    'bulletin-paie-amira-juin-2026.pdf',
    'application/pdf',
    await demoPdf('bulletin-paie-amira-juin-2026.pdf'),
    { category: 'PAIE', periodYear: 2026, periodMonth: 6 },
  );

  log('Immobilisation et première dotation');
  const assetRoot = `${dossierRoot}/fixed-assets`;
  const category = await request('POST', `${assetRoot}/categories`, {
    code: 'INFO',
    name: 'Matériel informatique',
    assetAccountId: account('218300'),
    accumulatedDepreciationAccountId: account('281830'),
    depreciationExpenseAccountId: account('681120'),
    defaultMethod: 'LINEAIRE',
    defaultUsefulLifeMonths: 36,
  });
  const asset = await request('POST', assetRoot, {
    categoryId: category.id,
    code: 'PC-2026-001',
    name: 'Ordinateur portable Dell Démo',
    description: 'Poste de développement acquis en juin 2026.',
    acquisitionDate: '2026-06-07',
    serviceDate: '2026-06-07',
    purchaseInvoiceId: purchaseComputer.id,
    supplierId: supplierDigital.id,
    acquisitionCost: '3000.000',
    residualValue: '0.000',
    accountingMethod: 'LINEAIRE',
    usefulLifeMonths: 36,
    fiscalMethod: 'LINEAIRE',
    fiscalUsefulLifeMonths: 36,
  });
  await request('POST', `${assetRoot}/${asset.id}/generate-schedule`);
  const assetWithSchedule = await request('GET', `${assetRoot}/${asset.id}`);
  const firstDepreciation =
    assetWithSchedule.depreciationPeriods.find(
      (item) => item.periodYear === 2026 && item.periodMonth === 6,
    ) ?? assetWithSchedule.depreciationPeriods[0];
  if (firstDepreciation) {
    await request(
      'POST',
      `${assetRoot}/depreciation-periods/${firstDepreciation.id}/post`,
      {
        journalId: journals.misc.id,
      },
    );
  }

  log('Tâche, checklist, temps passé et rentabilité');
  const task = await request('POST', `${dossierRoot}/tasks`, {
    title: 'Préparer et contrôler la comptabilité de juin 2026',
    description:
      'Contrôle des ventes, achats, banque, paie et déclaration mensuelle.',
    dueOn: '2026-07-15',
    priority: 'HAUTE',
    checklist: [
      'Contrôler les factures',
      'Rapprocher la banque',
      'Vérifier la paie',
    ],
  });
  await request(
    'PUT',
    `${dossierRoot}/tasks/${task.id}/assignee/${ownerMembershipId}`,
  );
  await request('POST', `${dossierRoot}/tasks/${task.id}/comments`, {
    body: 'Toutes les pièces de démonstration sont disponibles.',
  });
  const timeEntry = await request('POST', `${dossierRoot}/time-entries`, {
    workDate: '2026-06-30',
    durationMinutes: 240,
    billable: true,
    description: 'Saisie, contrôle et rapprochement du dossier TechNova.',
    taskId: task.id,
  });
  await request('POST', `${dossierRoot}/time-entries/${timeEntry.id}/submit`);
  await request('POST', `${dossierRoot}/time-entries/${timeEntry.id}/review`, {
    decision: 'APPROUVER',
    comment: 'Temps vérifié pour la démonstration.',
  });
  await request('POST', `${root}/team-cost-rates`, {
    membershipId: ownerMembershipId,
    compensationType: 'HORAIRE',
    payRateAmount: '25.000',
    employerCostRateAmount: '40.000',
    monthlyTargetMinutes: 9600,
    effectiveFrom: '2026-01-01',
  });
  for (const item of task.checklist) {
    await request(
      'PATCH',
      `${dossierRoot}/tasks/${task.id}/checklist/${item.id}`,
      { isCompleted: true },
    );
  }
  await request('PATCH', `${dossierRoot}/tasks/${task.id}/progress`, {
    status: 'EN_COURS',
    comment: 'Traitement en cours.',
  });
  await request('PATCH', `${dossierRoot}/tasks/${task.id}/progress`, {
    status: 'PRETE_POUR_REVISION',
    comment: 'Contrôles terminés.',
  });
  await request('POST', `${dossierRoot}/tasks/${task.id}/complete`);

  log('Honoraires du cabinet et encaissement');
  const feeInvoice = await request('POST', `${dossierRoot}/invoices`, {
    issueDate: '2026-06-30',
    dueDate: '2026-07-15',
    description: 'Honoraires comptables — juin 2026',
    netAmount: '600.000',
    vatRate: '0.19000',
    stampDuty: '1.000',
    notes: 'Facture pédagogique du cabinet.',
  });
  await request('POST', `${dossierRoot}/invoices/${feeInvoice.id}/send`);
  await request('POST', `${dossierRoot}/invoices/${feeInvoice.id}/payments`, {
    paymentDate: '2026-07-10',
    amount: '715.000',
    reference: 'HON-JUIN-2026',
  });

  log('Obligations et déclaration mensuelle complète');
  await request('POST', `${dossierRoot}/obligations/generate`, { year: 2026 });
  const receiptDocument = await upload(
    documentRoot,
    'accuse-depot-declaration-juin-2026.pdf',
    'application/pdf',
    await demoPdf('accuse-depot-declaration-juin-2026.pdf'),
    { category: 'DECLARATIONS', periodYear: 2026, periodMonth: 6 },
  );
  const declaration = await request(
    'POST',
    `${dossierRoot}/monthly-declarations/prepare`,
    {
      periodYear: 2026,
      periodMonth: 6,
    },
  );
  if (Number(declaration.checksJson?.blockingCount ?? 0) > 0) {
    throw new Error(
      `La déclaration contient des contrôles bloquants: ${JSON.stringify(declaration.checksJson)}`,
    );
  }
  await request(
    'POST',
    `${dossierRoot}/monthly-declarations/${declaration.id}/review`,
    {
      comment: 'Déclaration de démonstration contrôlée.',
    },
  );
  await request(
    'POST',
    `${dossierRoot}/monthly-declarations/${declaration.id}/validate`,
  );
  const filedDeclaration = await request(
    'POST',
    `${dossierRoot}/monthly-declarations/${declaration.id}/file`,
    {
      filingReference: 'DEMO-DECL-2026-06-0001',
      receiptDocumentId: receiptDocument.id,
    },
  );

  log('Contrôles finaux des rapports');
  const [
    trialBalance,
    financialSummary,
    agedBalance,
    profitability,
    billingSummary,
    obligations,
  ] = await Promise.all([
    request(
      'GET',
      `${dossierRoot}/reports/trial-balance?from=2026-01-01&to=2026-06-30`,
    ),
    request(
      'GET',
      `${dossierRoot}/reports/financial-summary?from=2026-01-01&to=2026-06-30`,
    ),
    request(
      'GET',
      `${dossierRoot}/reports/aged-balance?from=2026-01-01&to=2026-06-30`,
    ),
    request('GET', `${root}/profitability?from=2026-06-01&to=2026-06-30`),
    request('GET', `${root}/billing/summary`),
    request('GET', `${dossierRoot}/obligations?year=2026`),
  ]);

  const result = {
    credentials: { email: EMAIL, password: PASSWORD },
    url: 'http://127.0.0.1:5173/',
    organization: { id: organizationId, name: organization.name },
    dossier: {
      id: dossierId,
      legalName: dossier.legalName,
      tradeName: dossier.tradeName,
    },
    sample: {
      customers: 2,
      suppliers: 2,
      postedInvoices: 4,
      postedPayments: 4,
      bankStatement: {
        id: reconciledStatement.id,
        status: reconciledStatement.status,
        automaticallyMatched: autoMatch.matched,
      },
      employee: employee.fullName,
      payrollStatus: validatedPayroll.status,
      fixedAsset: asset.name,
      declaration: {
        id: filedDeclaration.id,
        status: filedDeclaration.status,
        totalDue: filedDeclaration.totalDue,
        reference: filedDeclaration.filingReference,
      },
      obligations: obligations.length,
      billing: billingSummary,
      trialBalanceAccounts: Array.isArray(trialBalance)
        ? trialBalance.length
        : trialBalance.items?.length,
      agedBalanceRows: Array.isArray(agedBalance)
        ? agedBalance.length
        : agedBalance.items?.length,
      financialSummary,
      profitability,
    },
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
