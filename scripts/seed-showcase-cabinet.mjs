const API = 'http://localhost:3000';
const EMAIL = `showcase.${Date.now()}@fiscora.test`;
const PASSWORD = 'ShowcaseCabinet2026!';

let token = '';

async function request(method, path, body, isForm = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function log(msg) {
  process.stdout.write(`[showcase] ${msg}\n`);
}

async function setupDossierChart(dossierRoot) {
  await request('POST', `${dossierRoot}/ledger-accounts/apply-tunisian-chart`);
  const accounts = await request('GET', `${dossierRoot}/ledger-accounts?includeInactive=true`);
  const acc = (code) => accounts.find((a) => a.code === code);
  const misc = await request('POST', `${dossierRoot}/journals`, { code: 'OD', name: 'Opérations diverses', type: 'OPERATIONS_DIVERSES' });
  const sales = await request('POST', `${dossierRoot}/journals`, { code: 'VEN', name: 'Journal des ventes', type: 'VENTES' });
  const purchases = await request('POST', `${dossierRoot}/journals`, { code: 'ACH', name: 'Journal des achats', type: 'ACHATS' });
  const bank = await request('POST', `${dossierRoot}/journals`, { code: 'BQ', name: 'Journal banque', type: 'BANQUE' });
  return { accounts, acc, journals: { misc, sales, purchases, bank } };
}

async function postEntry(dossierRoot, journalId, entryDate, lines, description) {
  const draft = await request('POST', `${dossierRoot}/entries`, {
    journalId, entryDate, pieceReference: `SHOWCASE-${entryDate}-${Math.random().toString(36).slice(2, 6)}`, description, lines,
  });
  await request('POST', `${dossierRoot}/entries/${draft.id}/submit`);
  return request('POST', `${dossierRoot}/entries/${draft.id}/post`);
}

async function main() {
  const auth = await request('POST', '/api/auth/register', {
    fullName: 'Cabinet Showcase',
    email: EMAIL,
    password: PASSWORD,
    organizationName: 'Cabinet Showcase Fiscora',
  });
  token = auth.accessToken;
  const organizationId = auth.organizations[0].id;
  const root = `/api/organizations/${organizationId}`;
  log(`org ${organizationId}`);

  // ---------- Dossier 1: flagship, REEL, services, fully populated ----------
  const d1 = await request('POST', `${root}/dossiers`, {
    legalName: 'Atlas Conseil SARL', tradeName: 'Atlas Conseil',
    taxIdentifier: '1122334/A/M/000', rneNumber: 'B01234562024',
    legalForm: 'SARL', taxRegime: 'REEL', isVatSubject: true, hasVatSuspension: false, isTotallyExporting: false,
    activitySector: 'Services informatiques et conseil', cnssEmployerNumber: 'CNSS-1001', employeeCount: 2,
    fiscalYearStartMonth: 1, fiscalYearStartDay: 1, monthlyFee: '450.000', annualFee: '5400.000', billingFrequency: 'MENSUELLE',
  });
  const d1Root = `${root}/dossiers/${d1.id}`;
  log(`dossier 1 (flagship) ${d1.id}`);

  const chart1 = await setupDossierChart(d1Root);
  const a = chart1.acc;

  // Employees + 2 months payroll
  const emp1 = await request('POST', `${d1Root}/employees`, {
    fullName: 'Rania Ferchichi', cin: '08765432', cnssNumber: '02233445-11', hireDate: '2024-03-01', contractType: 'CDI', grossSalary: '2200.000',
  });
  await request('POST', `${d1Root}/employees`, {
    fullName: 'Karim Bouzid', cin: '07654321', cnssNumber: '02233446-22', hireDate: '2025-01-15', contractType: 'CDI', grossSalary: '1600.000',
  });
  for (const month of [5, 6]) {
    const run = await request('POST', `${d1Root}/payroll-runs`, { periodYear: 2026, periodMonth: month });
    await request('POST', `${d1Root}/payroll-runs/${run.id}/validate`);
  }
  log('payroll: 2 employees, 2 months validated');

  // Third parties + invoices (sale with RS, purchase)
  const client = await request('POST', `${d1Root}/third-parties`, {
    type: 'CLIENT', name: 'Meditel Distribution SARL', taxIdentifier: '2233445/B/A/000', receivableAccountId: a('411')?.id,
  });
  const supplier = await request('POST', `${d1Root}/third-parties`, {
    type: 'FOURNISSEUR', name: 'Office Solutions SARL', taxIdentifier: '3344556/C/A/000', payableAccountId: a('4011')?.id,
  });
  const revenueAcct = a('705');
  const expenseAcct = a('604');
  const vatCollectedAcct = a('436711');
  const vatDeductibleAcct = a('43666');
  const rsAcct = a('432');

  const saleDraft = await request('POST', `${d1Root}/business-invoices`, {
    type: 'VENTE', nature: 'SERVICES', kind: 'FACTURE', number: 'FV-2026-001', invoiceDate: '2026-05-12',
    thirdPartyId: client.id, thirdPartyName: client.name, thirdPartyTaxIdentifier: client.taxIdentifier,
    journalId: chart1.journals.sales.id, thirdPartyAccountId: client.receivableAccountId, vatAccountId: vatCollectedAcct?.id,
    withholdingAccountId: rsAcct?.id, withholdingBase: '12000.000', withholdingNature: 'RS_5_HONORAIRES', stampDuty: '0.000',
    lines: [{ accountId: revenueAcct.id, description: 'Audit et conseil SI', quantity: '1.000', unitPrice: '12000.000', discountRate: '0.00000', vatCode: 'TVA_19' }],
  });
  await request('POST', `${d1Root}/business-invoices/${saleDraft.id}/validate`);
  await request('POST', `${d1Root}/business-invoices/${saleDraft.id}/post`);

  const purchaseDraft = await request('POST', `${d1Root}/business-invoices`, {
    type: 'ACHAT', nature: 'BIENS', kind: 'FACTURE', number: 'FA-2026-014', invoiceDate: '2026-05-20',
    thirdPartyId: supplier.id, thirdPartyName: supplier.name, thirdPartyTaxIdentifier: supplier.taxIdentifier,
    journalId: chart1.journals.purchases.id, thirdPartyAccountId: supplier.payableAccountId, vatAccountId: vatDeductibleAcct?.id, stampDuty: '0.000',
    lines: [{ accountId: expenseAcct.id, description: 'Fournitures bureau', quantity: '1.000', unitPrice: '1500.000', discountRate: '0.00000', vatCode: 'TVA_19' }],
  });
  await request('POST', `${d1Root}/business-invoices/${purchaseDraft.id}/validate`);
  await request('POST', `${d1Root}/business-invoices/${purchaseDraft.id}/post`);
  log('invoices: 1 sale (with RS), 1 purchase, posted');

  // Fixed asset
  const bankLedgerAcct = a('5321');
  const equipAcct = a('2282');
  const accDeprecAcct = a('2828');
  const deprecExpenseAcct = a('6811');
  if (equipAcct && accDeprecAcct && deprecExpenseAcct) {
    const category = await request('POST', `${d1Root}/fixed-assets/categories`, {
      code: 'INFO', name: 'Matériel informatique', assetAccountId: equipAcct.id, accumulatedDepreciationAccountId: accDeprecAcct.id,
      depreciationExpenseAccountId: deprecExpenseAcct.id, defaultMethod: 'LINEAIRE', defaultUsefulLifeMonths: 36,
    });
    const asset = await request('POST', `${d1Root}/fixed-assets`, {
      categoryId: category.id, code: 'PC-2026-01', name: 'Poste de travail développeur', acquisitionDate: '2026-02-01', serviceDate: '2026-02-01',
      acquisitionCost: '2400.000', residualValue: '0.000', fiscalMethod: 'LINEAIRE', fiscalUsefulLifeMonths: 36,
    });
    await request('POST', `${d1Root}/fixed-assets/${asset.id}/generate-schedule`);
    const withSchedule = await request('GET', `${d1Root}/fixed-assets/${asset.id}`);
    const firstPeriod = withSchedule.depreciationPeriods?.[0];
    if (firstPeriod) await request('POST', `${d1Root}/fixed-assets/depreciation-periods/${firstPeriod.id}/post`, { journalId: chart1.journals.misc.id });
    log('fixed asset created with schedule + first dotation posted');
  }

  // Bank account + statement import + reconciliation
  if (bankLedgerAcct) {
    const bankAccount = await request('POST', `${d1Root}/bank-reconciliation/accounts`, {
      name: 'Compte courant BIAT', bankName: 'BIAT', iban: 'TN5910006035183598478831', ledgerAccountId: bankLedgerAcct.id, journalId: chart1.journals.bank.id, currency: 'TND',
    });
    const csv = ['Date;Libelle;Reference;Montant', '2026-05-25;Virement Meditel;FV-2026-001;12000.000'].join('\n');
    const form = new FormData();
    form.append('bankAccountId', bankAccount.id);
    form.append('periodStart', '2026-05-01');
    form.append('periodEnd', '2026-05-31');
    form.append('openingBalance', '0.000');
    form.append('closingBalance', '12000.000');
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'releve-mai-2026.csv');
    const statement = await request('POST', `${d1Root}/bank-reconciliation/statements/import`, form, true);
    await request('POST', `${d1Root}/bank-reconciliation/statements/${statement.id}/auto-match`);
    log('bank statement imported + auto-matched');
  }

  // Monthly VAT declaration prepared
  await request('POST', `${d1Root}/monthly-declarations/prepare`, { periodYear: 2026, periodMonth: 5 }).catch((e) => log(`declaration prep skipped: ${e.message.slice(0, 100)}`));

  // ---------- Dossier 2: REEL, banking sector -> majoré 35% ----------
  const d2 = await request('POST', `${root}/dossiers`, {
    legalName: 'Banque du Sud SA', legalForm: 'SA', taxRegime: 'REEL', isVatSubject: true, hasVatSuspension: false, isTotallyExporting: false,
    activitySector: 'Banque et services financiers', employeeCount: 0, fiscalYearStartMonth: 1, fiscalYearStartDay: 1,
  });
  log(`dossier 2 (banque, majoré) ${d2.id}`);
  const d2Root = `${root}/dossiers/${d2.id}`;
  const chart2 = await setupDossierChart(d2Root);
  const misc2 = chart2.journals.misc;
  const rev2 = chart2.acc('705');
  const bank2 = chart2.acc('5321');
  await postEntry(d2Root, misc2.id, '2026-04-10', [
    { accountId: bank2.id, label: 'Produit test', debit: '50000.000', credit: '0.000' },
    { accountId: rev2.id, label: 'Produit test', debit: '0.000', credit: '50000.000' },
  ], 'Produit bancaire test');

  // ---------- Dossier 3: REEL, exportateur -> 10% ----------
  const d3 = await request('POST', `${root}/dossiers`, {
    legalName: 'TexportMed SARL', legalForm: 'SARL', taxRegime: 'REEL', isVatSubject: true, hasVatSuspension: true, isTotallyExporting: true,
    activitySector: 'Textile export', employeeCount: 0, fiscalYearStartMonth: 1, fiscalYearStartDay: 1,
  });
  log(`dossier 3 (exportateur) ${d3.id}`);
  const d3Root = `${root}/dossiers/${d3.id}`;
  const chart3 = await setupDossierChart(d3Root);
  const rev3 = chart3.acc('705');
  const bank3 = chart3.acc('5321');
  await postEntry(d3Root, chart3.journals.misc.id, '2026-03-15', [
    { accountId: bank3.id, label: 'Export test', debit: '30000.000', credit: '0.000' },
    { accountId: rev3.id, label: 'Export test', debit: '0.000', credit: '30000.000' },
  ], 'Vente export test');

  // ---------- Dossier 4: FORFAITAIRE ----------
  const d4 = await request('POST', `${root}/dossiers`, {
    legalName: 'Souk Rapide', legalForm: 'PERSONNE_PHYSIQUE', taxRegime: 'FORFAITAIRE', isVatSubject: false, hasVatSuspension: false, isTotallyExporting: false,
    activitySector: 'Commerce de détail', employeeCount: 0, fiscalYearStartMonth: 1, fiscalYearStartDay: 1,
  });
  log(`dossier 4 (forfaitaire) ${d4.id}`);

  console.log('\n=== SHOWCASE CREDENTIALS ===');
  console.log(JSON.stringify({
    url: 'http://localhost:5173/',
    email: EMAIL,
    password: PASSWORD,
    organizationId,
    dossiers: {
      flagship_atlas_conseil: d1.id,
      banque_du_sud: d2.id,
      texportmed: d3.id,
      souk_rapide_forfaitaire: d4.id,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
