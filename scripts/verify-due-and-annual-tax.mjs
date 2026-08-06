const API = 'http://localhost:3000';
const EMAIL = `verify.${Date.now()}@fiscora.test`;
const PASSWORD = 'VerifySession2026!';

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
    fullName: 'Verify Session',
    email: EMAIL,
    password: PASSWORD,
    organizationName: 'Cabinet Verification',
  });
  token = auth.accessToken;
  const organizationId = auth.organizations[0].id;
  const root = `/api/organizations/${organizationId}`;
  console.log('[verify] org created', organizationId);

  const dossierReel = await request('POST', `${root}/dossiers`, {
    legalName: 'Verify Services SARL',
    legalForm: 'SARL',
    taxRegime: 'REEL',
    isVatSubject: true,
    hasVatSuspension: false,
    isTotallyExporting: false,
    activitySector: 'Services informatiques',
    cnssEmployerNumber: 'CNSS-VERIFY-01',
    employeeCount: 1,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
  });
  console.log('[verify] dossier REEL created', dossierReel.id);
  const dossierRoot = `${root}/dossiers/${dossierReel.id}`;

  const employee = await request('POST', `${dossierRoot}/employees`, {
    fullName: 'Amira Verify',
    cin: '11223344',
    cnssNumber: '01234567-89',
    hireDate: '2026-01-02',
    contractType: 'CDI',
    grossSalary: '1800.000',
  });
  console.log('[verify] employee created', employee.id);

  for (const month of [1, 2, 3]) {
    const run = await request('POST', `${dossierRoot}/payroll-runs`, {
      periodYear: 2026,
      periodMonth: month,
    });
    await request('POST', `${dossierRoot}/payroll-runs/${run.id}/validate`);
    console.log(`[verify] payroll run ${month}/2026 validated`, run.id);
  }

  console.log('\n=== DUE (déclaration annuelle) ===');
  const due = await request('GET', `${dossierRoot}/payroll/due/2026`);
  console.log(JSON.stringify(due, null, 2));

  console.log('\n=== Annual tax — IS régime réel, sector=Services (should auto-pick IS_TAUX_STANDARD 15%) ===');
  const isReport = await request('POST', `${dossierRoot}/annual-tax/2026/calculate`, {});
  console.log(JSON.stringify(isReport.fiscal, null, 2));

  console.log('\n=== Annual tax — override sector to banking sector via new dossier (should auto-pick IS_TAUX_MAJORE 35%) ===');
  const dossierBank = await request('POST', `${root}/dossiers`, {
    legalName: 'Verify Banque SA',
    legalForm: 'SA',
    taxRegime: 'REEL',
    isVatSubject: true,
    hasVatSuspension: false,
    isTotallyExporting: false,
    activitySector: 'Banque et services financiers',
    employeeCount: 0,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
  });
  const bankReport = await request(
    'POST',
    `${root}/dossiers/${dossierBank.id}/annual-tax/2026/calculate`,
    {},
  );
  console.log(JSON.stringify(bankReport.fiscal, null, 2));

  console.log('\n=== Annual tax — exporting dossier (should auto-pick IS_TAUX_EXPORTATEUR 10%) ===');
  const dossierExport = await request('POST', `${root}/dossiers`, {
    legalName: 'Verify Export SARL',
    legalForm: 'SARL',
    taxRegime: 'REEL',
    isVatSubject: true,
    hasVatSuspension: false,
    isTotallyExporting: true,
    activitySector: 'Textile export',
    employeeCount: 0,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
  });
  const exportReport = await request(
    'POST',
    `${root}/dossiers/${dossierExport.id}/annual-tax/2026/calculate`,
    {},
  );
  console.log(JSON.stringify(exportReport.fiscal, null, 2));

  console.log('\n=== Annual tax — régime forfaitaire, low turnover (should auto-pick 4000 TND) ===');
  const dossierForfait = await request('POST', `${root}/dossiers`, {
    legalName: 'Verify Petit Commerce',
    legalForm: 'PERSONNE_PHYSIQUE',
    taxRegime: 'FORFAITAIRE',
    isVatSubject: false,
    hasVatSuspension: false,
    isTotallyExporting: false,
    activitySector: 'Commerce de detail',
    employeeCount: 0,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
  });
  const forfaitReport = await request(
    'POST',
    `${root}/dossiers/${dossierForfait.id}/annual-tax/2026/calculate`,
    {},
  );
  console.log(JSON.stringify(forfaitReport.fiscal, null, 2));
  console.log('warning:', forfaitReport.warning);

  console.log('\n=== Credentials for manual UI check ===');
  console.log(JSON.stringify({ email: EMAIL, password: PASSWORD, organizationId, dossierReelId: dossierReel.id }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
