const API = 'http://localhost:3000';
const EMAIL = `liasse.${Date.now()}@fiscora.test`;
const PASSWORD = 'VerifyLiasse2026!';

let token = '';

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
    throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const auth = await request('POST', '/api/auth/register', {
    fullName: 'Verify Liasse',
    email: EMAIL,
    password: PASSWORD,
    organizationName: 'Cabinet Liasse Verification',
  });
  token = auth.accessToken;
  const organizationId = auth.organizations[0].id;
  const root = `/api/organizations/${organizationId}`;
  console.log('[verify] org', organizationId);

  const dossier = await request('POST', `${root}/dossiers`, {
    legalName: 'Verify Liasse SARL',
    legalForm: 'SARL',
    taxRegime: 'REEL',
    isVatSubject: true,
    hasVatSuspension: false,
    isTotallyExporting: false,
    activitySector: 'Services informatiques',
    employeeCount: 0,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
  });
  const dossierRoot = `${root}/dossiers/${dossier.id}`;
  const annualTaxRoot = `${dossierRoot}/annual-tax`;
  console.log('[verify] dossier', dossier.id);

  await request('POST', `${dossierRoot}/ledger-accounts/apply-tunisian-chart`);
  const accounts = await request('GET', `${dossierRoot}/ledger-accounts?includeInactive=true`);
  const expenseAccount = accounts.find((a) => a.code.startsWith('60') && a.allowsPosting);
  const revenueAccount = accounts.find((a) => a.code.startsWith('70') && a.allowsPosting);
  const bankAccount = accounts.find((a) => a.code.startsWith('53') && a.allowsPosting);
  if (!expenseAccount || !revenueAccount || !bankAccount)
    throw new Error('Comptes 6/7/5 introuvables dans le plan de démarrage.');

  const journal = await request('POST', `${dossierRoot}/journals`, {
    code: 'OD',
    name: 'Opérations diverses',
    type: 'OPERATIONS_DIVERSES',
  });
  const salesJournal = await request('POST', `${dossierRoot}/journals`, {
    code: 'VEN',
    name: 'Journal des ventes',
    type: 'VENTES',
  });

  async function postEntry(entryDate, debitAccountId, creditAccountId, amount, description) {
    const draft = await request('POST', `${dossierRoot}/entries`, {
      journalId: journal.id,
      entryDate,
      pieceReference: `TEST-${entryDate}`,
      description,
      lines: [
        { accountId: debitAccountId, label: description, debit: amount, credit: '0.000' },
        { accountId: creditAccountId, label: description, debit: '0.000', credit: amount },
      ],
    });
    await request('POST', `${dossierRoot}/entries/${draft.id}/submit`);
    return request('POST', `${dossierRoot}/entries/${draft.id}/post`);
  }

  // Year 1: a loss (expense 10000, no revenue)
  await postEntry('2024-06-15', expenseAccount.id, bankAccount.id, '10000.000', 'Charge test perte 2024');
  // Year 2: a profit (revenue 8000)
  await postEntry('2025-06-15', bankAccount.id, revenueAccount.id, '8000.000', 'Produit test profit 2025');
  // Year 3: another profit (revenue 15000) to check remaining carryforward + withholding annex
  const saleThirdParty = await request('POST', `${dossierRoot}/third-parties`, {
    type: 'CLIENT',
    name: 'Client Retenue Test',
    taxIdentifier: '9998887/A/A/000',
    receivableAccountId: accounts.find((a) => a.code.startsWith('411'))?.id ?? bankAccount.id,
  });
  await request('POST', `${dossierRoot}/business-invoices`, {
    type: 'VENTE',
    nature: 'SERVICES',
    kind: 'FACTURE',
    number: 'FV-TEST-001',
    invoiceDate: '2026-03-10',
    thirdPartyId: saleThirdParty.id,
    thirdPartyName: saleThirdParty.name,
    thirdPartyTaxIdentifier: saleThirdParty.taxIdentifier,
    journalId: salesJournal.id,
    thirdPartyAccountId: saleThirdParty.receivableAccountId ?? bankAccount.id,
    vatAccountId: accounts.find((a) => a.code === '436711')?.id,
    withholdingAccountId: accounts.find((a) => a.code === '432')?.id,
    stampDuty: '0.000',
    withholdingBase: '15000.000',
    withholdingNature: 'RS_5_HONORAIRES',
    lines: [
      { accountId: revenueAccount.id, description: 'Prestation test', quantity: '1.000', unitPrice: '15000.000', discountRate: '0.00000', vatCode: 'TVA_19' },
    ],
  }).then(async (draft) => {
    await request('POST', `${dossierRoot}/business-invoices/${draft.id}/validate`);
    return request('POST', `${dossierRoot}/business-invoices/${draft.id}/post`);
  }).catch((e) => console.log('[verify] sale invoice (non-blocking for this check):', e.message));

  console.log('\n=== Year 2024: calculate (should show a loss, no finalize yet) ===');
  const calc2024 = await request('POST', `${annualTaxRoot}/2024/calculate`, {});
  console.log(JSON.stringify(calc2024.fiscal, null, 2));

  console.log('\n=== Year 2024: finalize (should create a loss carryforward row) ===');
  const fin2024 = await request('POST', `${annualTaxRoot}/2024/finalize`, {});
  console.log('finalized:', fin2024.finalized, 'fiscalResult:', fin2024.fiscal.fiscalResult);

  console.log('\n=== Deficits after 2024 finalize ===');
  console.log(JSON.stringify(await request('GET', `${annualTaxRoot}/deficits`), null, 2));

  console.log('\n=== Year 2025: calculate preview (should show carryforward available + applied) ===');
  const calc2025 = await request('POST', `${annualTaxRoot}/2025/calculate`, {});
  console.log(JSON.stringify(calc2025.fiscal, null, 2));

  console.log('\n=== Year 2025: finalize (consumes carryforward) ===');
  const fin2025 = await request('POST', `${annualTaxRoot}/2025/finalize`, {});
  console.log('fiscalResultBeforeCarryforward:', fin2025.fiscal.fiscalResultBeforeCarryforward, 'carryforwardApplied:', fin2025.fiscal.carryforwardApplied, 'fiscalResult:', fin2025.fiscal.fiscalResult);

  console.log('\n=== Deficits after 2025 finalize (should show ~2000 remaining) ===');
  console.log(JSON.stringify(await request('GET', `${annualTaxRoot}/deficits`), null, 2));

  console.log('\n=== Year 2024 finalize again (should 409 conflict) ===');
  try {
    await request('POST', `${annualTaxRoot}/2024/finalize`, {});
    console.log('ERROR: expected a conflict, did not get one');
  } catch (e) {
    console.log('OK, got expected error:', e.message.slice(0, 120));
  }

  console.log('\n=== Amortissements annex (empty dossier, should be empty rows) ===');
  console.log(JSON.stringify(await request('GET', `${annualTaxRoot}/2026/annexes/amortissements`), null, 2));

  console.log('\n=== Retenues à la source annex for 2026 ===');
  console.log(JSON.stringify(await request('GET', `${annualTaxRoot}/2026/annexes/retenues-source`), null, 2));

  console.log('\n=== Régularisation for 2026 (should show RS subie from sale invoice) ===');
  const calc2026 = await request('POST', `${annualTaxRoot}/2026/calculate`, {});
  console.log(JSON.stringify(calc2026.regularisation, null, 2));

  console.log('\nCredentials:', JSON.stringify({ email: EMAIL, password: PASSWORD, organizationId, dossierId: dossier.id }));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
