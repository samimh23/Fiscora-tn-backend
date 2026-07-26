/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

jest.setTimeout(30_000);

describe('Plateforme comptable NestJS (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('expose la santé et l’interface HTML', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('healthy'));
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect(({ text }) => expect(text).toContain('Atelier NestJS'));
  });

  it('permet le parcours administrateur complet', async () => {
    const email = `admin-${crypto.randomUUID()}@example.com`;
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        fullName: 'Administrateur Intégration',
        email,
        password: 'MotDePasse123',
        organizationName: 'Cabinet Intégration',
      })
      .expect(201);

    expect(registration.body.user.email).toBe(email);
    expect(registration.body.organizations).toHaveLength(1);
    expect(registration.body.organizations[0].role).toBe('Propriétaire');

    const token = registration.body.accessToken as string;
    const organizationId = registration.body.organizations[0].id as string;
    const authorization = `Bearer ${token}`;

    const roles = await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/roles`)
      .set('Authorization', authorization)
      .expect(200);
    expect(roles.body.map((role: { name: string }) => role.name)).toEqual(
      expect.arrayContaining([
        'Propriétaire',
        'Collaborateur',
        'Portail client',
      ]),
    );

    await request(app.getHttpServer())
      .put(`/api/organizations/${organizationId}/company-profile`)
      .set('Authorization', authorization)
      .send({
        legalName: 'Cabinet Intégration SARL',
        tradingName: 'Cabinet Intégration',
        taxIdentifier: 'MF-001',
        registrationNumber: 'RC-001',
        countryCode: 'TN',
        baseCurrencyCode: 'TND',
        addressLine1: '1 rue du Test',
        addressLine2: null,
        city: 'Tunis',
        postalCode: '1000',
        phone: null,
        email,
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/fiscal-years`)
      .set('Authorization', authorization)
      .send({
        name: 'Exercice 2026',
        startsOn: '2026-01-01',
        endsOn: '2026-12-31',
      })
      .expect(201);

    const account = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '530000',
        name: 'Caisse',
        description: 'Disponibilités',
        type: 'Actif',
        normalBalance: 'Débit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    expect(account.body.type).toBe('Actif');
    expect(account.body.normalBalance).toBe('Débit');
    const revenueAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '706000',
        name: 'Prestations de services',
        description: 'Produits des prestations',
        type: 'Produit',
        normalBalance: 'Crédit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const clientAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '411000',
        name: 'Clients',
        type: 'Actif',
        normalBalance: 'Débit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const supplierAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '401000',
        name: 'Fournisseurs',
        type: 'Passif',
        normalBalance: 'Crédit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const expenseAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '606000',
        name: 'Achats non stockés',
        type: 'Charge',
        normalBalance: 'Débit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const fixedAssetAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '218200',
        name: 'Matériel informatique',
        type: 'Actif',
        normalBalance: 'Débit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const accumulatedDepreciationAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '281820',
        name: 'Amortissement du matériel informatique',
        type: 'Actif',
        normalBalance: 'Crédit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const resultAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '120000',
        name: 'Résultat de l’exercice',
        type: 'CapitauxPropres',
        normalBalance: 'Crédit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const vatCollectedAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '436710',
        name: 'TVA collectée',
        type: 'Passif',
        normalBalance: 'Crédit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const vatDeductibleAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '436660',
        name: 'TVA déductible',
        type: 'Actif',
        normalBalance: 'Débit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const stampRevenueAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '758000',
        name: 'Droit de timbre facturé',
        type: 'Produit',
        normalBalance: 'Crédit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const stampExpenseAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '635800',
        name: 'Droit de timbre supporté',
        type: 'Charge',
        normalBalance: 'Débit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const withholdingReceivableAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '434000',
        name: 'Retenue à la source à récupérer',
        type: 'Actif',
        normalBalance: 'Débit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);
    const withholdingPayableAccount = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/ledger-accounts`)
      .set('Authorization', authorization)
      .send({
        code: '432000',
        name: 'Retenue à la source à payer',
        type: 'Passif',
        normalBalance: 'Crédit',
        parentAccountId: null,
        allowsPosting: true,
      })
      .expect(201);

    const dossierPayload = {
      legalName: 'Société Cliente A',
      tradeName: 'Cliente A',
      taxIdentifier: `MF-${crypto.randomUUID()}`,
      rneNumber: 'RNE-A',
      vatCode: 'A',
      customsCode: null,
      legalForm: 'SARL',
      taxRegime: 'REEL',
      isVatSubject: true,
      hasVatSuspension: false,
      isTotallyExporting: false,
      activitySector: 'Services informatiques',
      cnssEmployerNumber: 'CNSS-A',
      employeeCount: 5,
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
      monthlyFee: '450.000',
      annualFee: null,
      billingFrequency: 'MENSUELLE',
      internalNotes: 'Dossier prioritaire',
      tags: ['TVA', 'Mensuel'],
    };
    const dossierA = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/dossiers`)
      .set('Authorization', authorization)
      .send(dossierPayload)
      .expect(201);
    const dossierB = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/dossiers`)
      .set('Authorization', authorization)
      .send({
        ...dossierPayload,
        legalName: 'Société Cliente B',
        tradeName: 'Cliente B',
        taxIdentifier: `MF-${crypto.randomUUID()}`,
        rneNumber: 'RNE-B',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/contacts`,
      )
      .set('Authorization', authorization)
      .send({
        fullName: 'Contact Principal',
        role: 'Gérante',
        phone: '+216 20 000 000',
        email: 'contact@example.com',
        whatsappNumber: '+216 20 000 000',
        isPrimary: true,
      })
      .expect(201);

    const collaboratorRole = roles.body.find(
      (role: { name: string }) => role.name === 'Collaborateur',
    ) as { id: string };
    const collaboratorEmail = `collaborateur-${crypto.randomUUID()}@example.com`;
    const invitation = await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/invitations`)
      .set('Authorization', authorization)
      .send({ email: collaboratorEmail, roleId: collaboratorRole.id })
      .expect(201);
    const invitationToken = (invitation.body as { invitationToken: string })
      .invitationToken;
    const collaborator = await request(app.getHttpServer())
      .post('/api/auth/accept-invitation')
      .send({
        token: invitationToken,
        fullName: 'Collaborateur Intégration',
        password: 'MotDePasse123',
      })
      .expect(200);
    const collaboratorAuthorization = `Bearer ${collaborator.body.accessToken}`;

    const members = await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/members`)
      .set('Authorization', authorization)
      .expect(200);
    const collaboratorMembership = members.body.find(
      (member: { email: string }) => member.email === collaboratorEmail,
    ) as { membershipId: string };

    await request(app.getHttpServer())
      .put(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/assignments/${collaboratorMembership.membershipId}`,
      )
      .set('Authorization', authorization)
      .send({
        assignmentRole: 'RESPONSABLE',
        isActive: true,
        monthlyTimeBudgetMinutes: 1200,
      })
      .expect(200);

    const collaboratorDossiers = await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/dossiers`)
      .set('Authorization', collaboratorAuthorization)
      .expect(200);
    expect(collaboratorDossiers.body.total).toBe(1);
    expect(collaboratorDossiers.body.items[0].id).toBe(dossierA.body.id);

    await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/dossiers/${dossierA.body.id}`)
      .set('Authorization', collaboratorAuthorization)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/dossiers/${dossierB.body.id}`)
      .set('Authorization', collaboratorAuthorization)
      .expect(404);

    const generation = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations/generate`,
      )
      .set('Authorization', authorization)
      .send({ year: 2026 })
      .expect(201);
    expect(generation.body.created).toBe(16);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations/generate`,
      )
      .set('Authorization', authorization)
      .send({ year: 2026 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.created).toBe(0);
        expect(body.existing).toBe(16);
        expect(body.notApplicable).toBe(12);
      });

    const collaboratorObligations = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations?year=2026`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200);
    expect(collaboratorObligations.body).toHaveLength(16);
    const monthlyJanuary = collaboratorObligations.body.find(
      (item: { code: string; periodMonth: number }) =>
        item.code === 'DECLARATION_MENSUELLE_REEL' && item.periodMonth === 1,
    ) as { id: string; dueOn: string };
    expect(monthlyJanuary.dueOn).toBe('2026-02-28');
    const monthlyFebruary = collaboratorObligations.body.find(
      (item: { code: string; periodMonth: number }) =>
        item.code === 'DECLARATION_MENSUELLE_REEL' && item.periodMonth === 2,
    ) as { id: string };

    const applicableSettings = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/fiscal-settings/applicable?date=2026-02-01`,
      )
      .set('Authorization', authorization)
      .expect(200);
    expect(applicableSettings.body.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CNSS_RSNA_SALARIE',
          value: '0.09180',
        }),
        expect.objectContaining({
          code: 'CNSS_RSNA_EMPLOYEUR',
          value: '0.16570',
        }),
      ]),
    );
    expect(applicableSettings.body.incomeTaxBrackets).toHaveLength(8);

    for (const parameter of [
      {
        code: 'TFP_TAUX_AUTRES',
        label: 'TFP autres activités',
        valueType: 'TAUX',
        value: '0.02000',
      },
      {
        code: 'FOPROLOS_TAUX',
        label: 'FOPROLOS',
        valueType: 'TAUX',
        value: '0.01000',
      },
      {
        code: 'TCL_TAUX',
        label: 'TCL',
        valueType: 'TAUX',
        value: '0.00200',
      },
      {
        code: 'TIMBRE_MONTANT',
        label: 'Droit de timbre',
        valueType: 'MONTANT',
        value: '1.00000',
      },
    ]) {
      await request(app.getHttpServer())
        .post(`/api/organizations/${organizationId}/fiscal-settings/parameters`)
        .set('Authorization', authorization)
        .send({ ...parameter, effectiveFrom: '2026-01-01' })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/fiscal-settings/withholding-rates`,
      )
      .set('Authorization', authorization)
      .send({
        natureCode: 'HONORAIRES',
        label: 'Retenue sur honoraires',
        rate: '0.03000',
        effectiveFrom: '2026-01-01',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/fiscal-settings/vat-rates`)
      .set('Authorization', authorization)
      .send({
        code: 'TVA19',
        label: 'TVA 19 %',
        rate: '0.19000',
        effectiveFrom: '2026-01-01',
      })
      .expect(201);

    const uploadedDocument = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/documents`,
      )
      .set('Authorization', collaboratorAuthorization)
      .field('category', 'FACTURES_VENTES')
      .field('periodYear', '2026')
      .field('periodMonth', '2')
      .attach('file', Buffer.from('%PDF-1.4 fichier de test'), {
        filename: 'facture-test.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(uploadedDocument.body.version).toBe(1);
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/documents/${uploadedDocument.body.id}/download`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => expect(body.expiresInSeconds).toBe(900));
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/documents/missing`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        periodYear: 2026,
        periodMonth: 2,
        label: 'Relevé bancaire',
        category: 'RELEVES_BANCAIRES',
      })
      .expect(201);

    const declaration = await request(app.getHttpServer())
      .put(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/monthly-declarations`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        periodYear: 2026,
        periodMonth: 2,
        vatCollected: '1000.000',
        vatDeductible: '300.000',
        vatCreditPrevious: '100.000',
        withholdingBase: '1000.000',
        withholdingNature: 'HONORAIRES',
        tfpBase: '10000.000',
        foprolosBase: '10000.000',
        tclBase: '10000.000',
      })
      .expect(200);
    expect(declaration.body.totalDue).toBe('951.000');
    expect(declaration.body.withholdingRate).toBe('0.03000');
    expect(declaration.body.parameterSnapshot.tfp.value).toBe('0.02000');
    expect(declaration.body.obligationId).toBe(monthlyFebruary.id);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/monthly-declarations/${declaration.body.id}/review`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/monthly-declarations/${declaration.body.id}/validate`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('VALIDEE'));

    const journal = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/journals`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ code: 'VT', name: 'Journal des ventes', type: 'VENTES' })
      .expect(201);
    const purchaseJournal = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/journals`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ code: 'AC', name: 'Journal des achats', type: 'ACHATS' })
      .expect(201);
    const bankJournal = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/journals`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ code: 'BQ', name: 'Journal de banque', type: 'BANQUE' })
      .expect(201);
    const miscellaneousJournal = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/journals`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        code: 'OD',
        name: 'Opérations diverses',
        type: 'OPERATIONS_DIVERSES',
      })
      .expect(201);

    const priorYearEntry = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/entries`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        journalId: miscellaneousJournal.body.id,
        entryDate: '2025-06-30',
        pieceReference: 'TEST-2025-001',
        description: 'Opération de test pour la clôture 2025',
        lines: [
          {
            accountId: fixedAssetAccount.body.id,
            label: 'Actif de test',
            debit: '1000.000',
            credit: '0.000',
          },
          {
            accountId: revenueAccount.body.id,
            label: 'Produit de test',
            debit: '0.000',
            credit: '1000.000',
          },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/entries/${priorYearEntry.body.id}/post`,
      )
      .set('Authorization', authorization)
      .expect(201);

    const adjustment = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/period-closing/adjustments`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        type: 'CHARGE_A_PAYER',
        entryDate: '2025-12-31',
        reversalDate: '2026-01-01',
        description: 'Charge à payer de clôture',
        journalId: miscellaneousJournal.body.id,
        lines: [
          {
            accountId: expenseAccount.body.id,
            label: 'Charge à rattacher',
            debit: '100.000',
            credit: '0.000',
          },
          {
            accountId: supplierAccount.body.id,
            label: 'Dette à payer',
            debit: '0.000',
            credit: '100.000',
          },
        ],
      })
      .expect(201);
    expect(adjustment.body.journalEntry.status).toBe('COMPTABILISEE');
    expect(adjustment.body.reversalEntry).toBeDefined();

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/period-closing/periods/2025/1/lock`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ note: 'Tentative collaborateur' })
      .expect(403);
    for (let month = 1; month <= 12; month += 1) {
      await request(app.getHttpServer())
        .post(
          `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/period-closing/periods/2025/${month}/lock`,
        )
        .set('Authorization', authorization)
        .send({ note: 'Contrôles terminés' })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/entries`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        journalId: miscellaneousJournal.body.id,
        entryDate: '2025-12-31',
        pieceReference: 'REFUSEE-2025',
        description: 'Cette écriture doit être refusée',
        lines: [
          {
            accountId: fixedAssetAccount.body.id,
            label: 'Débit',
            debit: '1.000',
            credit: '0.000',
          },
          {
            accountId: revenueAccount.body.id,
            label: 'Crédit',
            debit: '0.000',
            credit: '1.000',
          },
        ],
      })
      .expect(409);
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/period-closing/years/2025/readiness`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ready).toBe(true);
        expect(body.unlockedPeriods).toHaveLength(0);
      });
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/period-closing/years/2025/close`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        closingJournalId: miscellaneousJournal.body.id,
        openingJournalId: miscellaneousJournal.body.id,
        resultAccountId: resultAccount.body.id,
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/period-closing/years/2025/close`,
      )
      .set('Authorization', authorization)
      .send({
        closingJournalId: miscellaneousJournal.body.id,
        openingJournalId: miscellaneousJournal.body.id,
        resultAccountId: resultAccount.body.id,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('CLOTUREE');
        expect(body.netResult).toBe('900.000');
        expect(body.closingJournalEntry).toBeDefined();
        expect(body.openingJournalEntry).toBeDefined();
      });
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/period-closing/periods?year=2025`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(12);
        expect(
          body.every(
            (period: { status: string }) => period.status === 'CLOTUREE',
          ),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/mappings/apply-defaults`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(201)
      .expect(({ body }) => expect(body.total).toBeGreaterThanOrEqual(8));
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/mappings`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              accountCode: '218200',
              statementSection: 'BILAN_IMMOB_CORPORELLES',
            }),
            expect.objectContaining({
              accountCode: '706000',
              statementSection: 'RESULTAT_REVENUS',
            }),
          ]),
        );
      });
    let financialNotes = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/notes/2025/generate`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('BROUILLON');
        expect(body.sections).toHaveLength(10);
        expect(
          body.sections.find(
            (section: { code: string }) => section.code === 'IMMOBILISATIONS',
          ).autoData,
        ).toHaveLength(1);
      });
    for (const code of [
      'METHODES_COMPTABLES',
      'ENGAGEMENTS_HORS_BILAN',
      'EVENTUALITES_LITIGES',
      'EVENEMENTS_POSTERIEURS',
    ]) {
      const section = financialNotes.body.sections.find(
        (item: { code: string }) => item.code === code,
      );
      financialNotes = await request(app.getHttpServer())
        .put(
          `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/notes/2025/sections/${section.id}`,
        )
        .set('Authorization', collaboratorAuthorization)
        .send({
          content:
            code === 'METHODES_COMPTABLES'
              ? 'Coût historique et continuité d’exploitation.'
              : 'Néant.',
        })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/notes/2025/submit`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('PRETES_POUR_REVISION'));
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/notes/2025/validate`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/notes/2025/validate`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('VALIDEES'));
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/statements/2025`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.source).toBe('TEMPS_REEL');
        expect(body.balanceSheet.totalAssets.current).toBe('1000.000');
        expect(body.balanceSheet.totalEquityAndLiabilities.current).toBe(
          '1000.000',
        );
        expect(body.incomeStatement.netResult.current).toBe('900.000');
        expect(body.notes.status).toBe('VALIDEES');
        expect(
          body.balanceSheet.assets.find(
            (line: { code: string }) => line.code === 'BILAN_IMMOB_CORPORELLES',
          ).noteNumber,
        ).toBe(2);
        expect(
          body.controls.every(
            (item: { status: string }) => item.status === 'OK',
          ),
        ).toBe(true);
      });
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/statements/2025/finalize`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/statements/2025/finalize`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => {
        expect(body.source).toBe('SNAPSHOT_DEFINITIF');
        expect(body.snapshot.version).toBe(1);
        expect(body.snapshot.sourceHash).toMatch(/^[a-f0-9]{64}$/);
      });
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/statements/2025/export?format=pdf`,
      )
      .set('Authorization', collaboratorAuthorization)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect('Content-Type', /application\/pdf/)
      .expect(200)
      .expect(({ body }) =>
        expect(body.subarray(0, 4).toString()).toBe('%PDF'),
      );
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/financial-statements/statements/2025/export?format=xlsx`,
      )
      .set('Authorization', collaboratorAuthorization)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect('Content-Type', /spreadsheetml/)
      .expect(200)
      .expect(({ body }) => expect(body.subarray(0, 2).toString()).toBe('PK'));

    const customer = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/third-parties`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        type: 'CLIENT',
        name: 'Client Démo',
        taxIdentifier: 'MF-CLIENT',
        receivableAccountId: clientAccount.body.id,
      })
      .expect(201);
    const supplier = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/third-parties`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        type: 'FOURNISSEUR',
        name: 'Fournisseur Démo',
        taxIdentifier: 'MF-FOURNISSEUR',
        payableAccountId: supplierAccount.body.id,
      })
      .expect(201);

    const saleInvoice = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        type: 'VENTE',
        number: 'FV-2026-001',
        invoiceDate: '2026-02-10',
        dueDate: '2026-03-10',
        thirdPartyId: customer.body.id,
        thirdPartyName: 'Client Démo',
        thirdPartyTaxIdentifier: 'MF-CLIENT',
        journalId: journal.body.id,
        thirdPartyAccountId: clientAccount.body.id,
        vatAccountId: vatCollectedAccount.body.id,
        stampAccountId: stampRevenueAccount.body.id,
        withholdingAccountId: withholdingReceivableAccount.body.id,
        withholdingNature: 'HONORAIRES',
        lines: [
          {
            accountId: revenueAccount.body.id,
            description: 'Mission comptable',
            quantity: '2.000',
            unitPrice: '500.000',
            discountRate: '0.10000',
            vatCode: 'TVA19',
          },
        ],
      })
      .expect(201);
    expect(saleInvoice.body.netAmount).toBe('900.000');
    expect(saleInvoice.body.vatAmount).toBe('171.000');
    expect(saleInvoice.body.grossAmount).toBe('1072.000');
    expect(saleInvoice.body.withholdingAmount).toBe('27.000');
    expect(saleInvoice.body.netPayable).toBe('1045.000');
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${saleInvoice.body.id}/validate`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('VALIDEE');
        expect(body.journalEntryId).toBeTruthy();
      });
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${saleInvoice.body.id}/post`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('COMPTABILISEE'));

    const purchaseInvoice = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        type: 'ACHAT',
        number: 'FA-2026-001',
        invoiceDate: '2026-02-11',
        thirdPartyId: supplier.body.id,
        thirdPartyName: 'Fournisseur Démo',
        journalId: purchaseJournal.body.id,
        thirdPartyAccountId: supplierAccount.body.id,
        vatAccountId: vatDeductibleAccount.body.id,
        stampAccountId: stampExpenseAccount.body.id,
        withholdingAccountId: withholdingPayableAccount.body.id,
        withholdingNature: 'HONORAIRES',
        lines: [
          {
            accountId: expenseAccount.body.id,
            description: 'Fournitures',
            quantity: '1.000',
            unitPrice: '1000.000',
            vatCode: 'TVA19',
          },
        ],
      })
      .expect(201);
    expect(purchaseInvoice.body.grossAmount).toBe('1191.000');
    expect(purchaseInvoice.body.netPayable).toBe('1161.000');
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${purchaseInvoice.body.id}/validate`,
      )
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${purchaseInvoice.body.id}/post`,
      )
      .set('Authorization', authorization)
      .expect(201);

    const creditNote = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        type: 'VENTE',
        kind: 'AVOIR',
        number: 'AV-2026-001',
        invoiceDate: '2026-02-12',
        thirdPartyId: customer.body.id,
        thirdPartyName: 'Client Démo',
        originalInvoiceId: saleInvoice.body.id,
        journalId: journal.body.id,
        thirdPartyAccountId: clientAccount.body.id,
        stampDuty: '0.000',
        lines: [
          {
            accountId: revenueAccount.body.id,
            description: 'Remise commerciale',
            quantity: '1.000',
            unitPrice: '100.000',
            vatRate: '0.00000',
          },
        ],
      })
      .expect(201);
    expect(creditNote.body.netPayable).toBe('100.000');
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${creditNote.body.id}/validate`,
      )
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${creditNote.body.id}/post`,
      )
      .set('Authorization', authorization)
      .expect(201);

    const createAndPostPayment = async (
      direction: 'ENCAISSEMENT' | 'DECAISSEMENT',
      thirdPartyId: string,
      thirdPartyAccountId: string,
      invoiceId: string,
      amount: string,
      reference: string,
    ) => {
      const payment = await request(app.getHttpServer())
        .post(
          `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/payments`,
        )
        .set('Authorization', collaboratorAuthorization)
        .send({
          thirdPartyId,
          direction,
          paymentDate: '2026-02-15',
          amount,
          method: 'VIREMENT',
          reference,
          journalId: bankJournal.body.id,
          cashAccountId: account.body.id,
          thirdPartyAccountId,
          allocations: [{ invoiceId, amount }],
        })
        .expect(201);
      expect(payment.body.status).toBe('BROUILLON');
      return request(app.getHttpServer())
        .post(
          `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/payments/${payment.body.id}/post`,
        )
        .set('Authorization', authorization)
        .expect(201)
        .expect(({ body }) => expect(body.status).toBe('COMPTABILISE'));
    };

    await createAndPostPayment(
      'ENCAISSEMENT',
      customer.body.id,
      clientAccount.body.id,
      saleInvoice.body.id,
      '500.000',
      'ENC-001',
    );
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${saleInvoice.body.id}`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.paidAmount).toBe('500.000');
        expect(body.creditedAmount).toBe('100.000');
        expect(body.outstandingAmount).toBe('445.000');
        expect(body.settlementStatus).toBe('PARTIELLEMENT_REGLEE');
      });
    await createAndPostPayment(
      'ENCAISSEMENT',
      customer.body.id,
      clientAccount.body.id,
      saleInvoice.body.id,
      '445.000',
      'ENC-002',
    );
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${saleInvoice.body.id}`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.paidAmount).toBe('945.000');
        expect(body.outstandingAmount).toBe('0.000');
        expect(body.settlementStatus).toBe('REGLEE');
      });
    await createAndPostPayment(
      'DECAISSEMENT',
      supplier.body.id,
      supplierAccount.body.id,
      purchaseInvoice.body.id,
      '100.000',
      'DEC-001',
    );
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/business-invoices/${purchaseInvoice.body.id}`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.paidAmount).toBe('100.000');
        expect(body.outstandingAmount).toBe('1061.000');
      });
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/third-parties`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(2);
        expect(
          body.find((item: { id: string }) => item.id === supplier.body.id)
            .payableBalance,
        ).toBe('1061.000');
      });

    const bankAccount = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/accounts`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        name: 'Compte bancaire principal',
        bankName: 'Banque Démo',
        iban: 'TN5901000000000000000000',
        ledgerAccountId: account.body.id,
        journalId: bankJournal.body.id,
      })
      .expect(201);

    const februaryStatementCsv = Buffer.from(
      [
        'Date;Libellé;Référence;Débit;Crédit;Solde',
        '15/02/2026;Virement client;ENC-001;;500,000;500,000',
        '15/02/2026;Virement client;ENC-002;;445,000;945,000',
        '15/02/2026;Virement fournisseur;DEC-001;100,000;;845,000',
      ].join('\n'),
      'utf8',
    );
    const februaryStatement = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/statements/import`,
      )
      .set('Authorization', collaboratorAuthorization)
      .field('bankAccountId', bankAccount.body.id)
      .field('periodStart', '2026-02-01')
      .field('periodEnd', '2026-02-28')
      .field('openingBalance', '0.000')
      .field('closingBalance', '845.000')
      .attach('file', februaryStatementCsv, {
        filename: 'releve-fevrier.csv',
        contentType: 'text/csv',
      })
      .expect(201);
    expect(februaryStatement.body.rowCount).toBe(3);
    expect(februaryStatement.body.unmatchedCount).toBe(3);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/statements/${februaryStatement.body.id}/auto-match`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(201)
      .expect(({ body }) => {
        expect(body.matched).toBe(3);
        expect(body.statement.status).toBe('PRET_A_VALIDER');
      });
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/statements/${februaryStatement.body.id}/reconcile`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/statements/${februaryStatement.body.id}/reconcile`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('RAPPROCHE');
        expect(body.bookClosingBalance).toBe('845.000');
        expect(body.difference).toBe('0.000');
      });

    const marchStatementCsv = Buffer.from(
      [
        'Date;Libellé;Référence;Débit;Crédit;Solde',
        '05/03/2026;Frais bancaires;FB-001;10,000;;835,000',
      ].join('\n'),
      'utf8',
    );
    const marchStatement = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/statements/import`,
      )
      .set('Authorization', collaboratorAuthorization)
      .field('bankAccountId', bankAccount.body.id)
      .field('periodStart', '2026-03-01')
      .field('periodEnd', '2026-03-31')
      .field('openingBalance', '845.000')
      .field('closingBalance', '835.000')
      .attach('file', marchStatementCsv, {
        filename: 'releve-mars.csv',
        contentType: 'text/csv',
      })
      .expect(201);
    const bankFeeTransaction = marchStatement.body.transactions[0];
    const bankFeeEntry = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/transactions/${bankFeeTransaction.id}/generate-entry`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        counterpartAccountId: expenseAccount.body.id,
        description: 'Frais bancaires mars',
        pieceReference: 'FB-001',
      })
      .expect(201);
    expect(bankFeeEntry.body.status).toBe('BROUILLON');
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/entries/${bankFeeEntry.body.id}/post`,
      )
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/transactions/${bankFeeTransaction.id}/match-entry`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ journalEntryId: bankFeeEntry.body.id })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('RAPPROCHEE'));
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/bank-reconciliation/statements/${marchStatement.body.id}/reconcile`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => expect(body.bookClosingBalance).toBe('835.000'));

    const assetCategory = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/categories`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        code: 'INFO',
        name: 'Matériel informatique',
        assetAccountId: fixedAssetAccount.body.id,
        accumulatedDepreciationAccountId:
          accumulatedDepreciationAccount.body.id,
        depreciationExpenseAccountId: expenseAccount.body.id,
        defaultMethod: 'LINEAIRE',
        defaultUsefulLifeMonths: 12,
      })
      .expect(201);
    const fixedAsset = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        categoryId: assetCategory.body.id,
        code: 'IMMO-2026-001',
        name: 'Ordinateur de production',
        description: 'Immobilisation de test avec plans comptable et fiscal.',
        acquisitionDate: '2026-01-01',
        serviceDate: '2026-01-01',
        purchaseInvoiceId: purchaseInvoice.body.id,
        supplierId: supplier.body.id,
        acquisitionCost: '1200.000',
        residualValue: '0.000',
        accountingMethod: 'LINEAIRE',
        usefulLifeMonths: 12,
        fiscalMethod: 'LINEAIRE',
        fiscalUsefulLifeMonths: 24,
      })
      .expect(201);
    const assetWithSchedule = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/${fixedAsset.body.id}/generate-schedule`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(201);
    expect(assetWithSchedule.body.depreciationPeriods).toHaveLength(24);
    expect(assetWithSchedule.body.depreciationPeriods[0].accountingAmount).toBe(
      '100.000',
    );
    expect(assetWithSchedule.body.depreciationPeriods[0].fiscalAmount).toBe(
      '50.000',
    );

    const accountingPeriods2026 =
      assetWithSchedule.body.depreciationPeriods.filter(
        (period: { periodYear: number; accountingAmount: string }) =>
          period.periodYear === 2026 && period.accountingAmount !== '0.000',
      ) as Array<{ id: string }>;
    expect(accountingPeriods2026).toHaveLength(12);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/depreciation-periods/${accountingPeriods2026[0].id}/post`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ journalId: miscellaneousJournal.body.id })
      .expect(403);
    for (const period of accountingPeriods2026) {
      await request(app.getHttpServer())
        .post(
          `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/depreciation-periods/${period.id}/post`,
        )
        .set('Authorization', authorization)
        .send({ journalId: miscellaneousJournal.body.id })
        .expect(201);
    }

    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/${fixedAsset.body.id}`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('TOTALEMENT_AMORTIE');
        expect(body.postedAccountingDepreciation).toBe('1200.000');
        expect(body.netBookValue).toBe('0.000');
      });
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/reports/depreciation?year=2026`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0].posted).toBe(12);
        expect(body.totals.accounting).toBe('1200.000');
        expect(body.totals.fiscal).toBe('600.000');
        expect(body.totals.temporaryDifference).toBe('600.000');
      });
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/years/2026/validate`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/years/2026/validate`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('VALIDEE');
        expect(body.totalAccounting).toBe('1200.000');
        expect(body.totalFiscal).toBe('600.000');
      });
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/fixed-assets/${fixedAsset.body.id}/dispose`,
      )
      .set('Authorization', authorization)
      .send({
        disposalDate: '2027-01-15',
        proceeds: '100.000',
        journalId: miscellaneousJournal.body.id,
        settlementAccountId: account.body.id,
        gainAccountId: revenueAccount.body.id,
        lossAccountId: expenseAccount.body.id,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('CEDEE');
        expect(body.disposalGainLoss).toBe('100.000');
        expect(body.disposalJournalEntry).toBeDefined();
      });

    const entry = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/entries`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        journalId: journal.body.id,
        entryDate: '2026-02-10',
        pieceReference: 'FV-001',
        description: 'Facture prestation',
        sourceDocumentId: uploadedDocument.body.id,
        lines: [
          {
            accountId: account.body.id,
            label: 'Encaissement',
            debit: '1000.000',
            credit: '0.000',
          },
          {
            accountId: revenueAccount.body.id,
            label: 'Prestation',
            debit: '0.000',
            credit: '1000.000',
          },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/entries/${entry.body.id}/post`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/entries/${entry.body.id}/post`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('COMPTABILISEE'));
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/reports/trial-balance?from=2026-01-01&to=2026-12-31`,
      )
      .set('Authorization', authorization)
      .expect(200)
      .expect(({ body }) => expect(body.length).toBeGreaterThanOrEqual(6));

    const invoice = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/invoices`,
      )
      .set('Authorization', authorization)
      .send({
        issueDate: '2026-02-01',
        dueDate: '2026-02-15',
        description: 'Honoraires février',
        netAmount: '500.000',
        vatRate: '0.19000',
        stampDuty: '1.000',
      })
      .expect(201);
    expect(invoice.body.totalAmount).toBe('596.000');
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/invoices/${invoice.body.id}/send`,
      )
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/invoices/${invoice.body.id}/payments`,
      )
      .set('Authorization', authorization)
      .send({
        paymentDate: '2026-02-12',
        amount: '596.000',
        reference: 'VIR-001',
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('PAYEE'));

    await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/team-cost-rates`)
      .set('Authorization', authorization)
      .send({
        membershipId: collaboratorMembership.membershipId,
        compensationType: 'MENSUELLE',
        payRateAmount: '1500.000',
        employerCostRateAmount: '2000.000',
        monthlyTargetMinutes: 9600,
        effectiveFrom: '2026-02-01',
        effectiveTo: '2026-02-28',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/team-cost-rates`)
      .set('Authorization', collaboratorAuthorization)
      .expect(403);

    const timeEntry = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/time-entries`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        workDate: '2026-02-10',
        durationMinutes: 600,
        billable: true,
        description: 'Tenue et déclaration du mois de février',
        taskId: null,
      })
      .expect(201);
    expect(timeEntry.body.status).toBe('BROUILLON');
    expect(timeEntry.body.durationHours).toBe('10.00');
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/time-entries/${timeEntry.body.id}/submit`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('SOUMIS'));
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/time-entries/${timeEntry.body.id}/review`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ decision: 'APPROUVER' })
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/time-entries/${timeEntry.body.id}/review`,
      )
      .set('Authorization', authorization)
      .send({ decision: 'APPROUVER', comment: 'Temps contrôlé' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('APPROUVE'));
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/profitability?from=2026-02-01&to=2026-02-28`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(403);
    const profitability = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/profitability?from=2026-02-01&to=2026-02-28`,
      )
      .set('Authorization', authorization)
      .expect(200);
    const dossierProfitability = profitability.body.dossiers.find(
      (item: { dossierId: string }) => item.dossierId === dossierA.body.id,
    );
    expect(dossierProfitability.approvedHours).toBe('10.00');
    expect(dossierProfitability.budgetHours).toBe('20.00');
    expect(dossierProfitability.allocatedEmployerCost).toBe('125.000');
    expect(dossierProfitability.billedRevenueNet).toBe('500.000');
    expect(dossierProfitability.collectedRevenueNet).toBe('500.000');
    expect(dossierProfitability.marginOnBilled).toBe('375.000');
    expect(profitability.body.members[0].payAmount).toBeDefined();

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/employees`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        fullName: 'Salarié Démo',
        cin: '12345678',
        cnssNumber: 'CNSS-001',
        hireDate: '2025-01-01',
        contractType: 'CDI',
        grossSalary: '2000.000',
      })
      .expect(201);
    const payroll = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/payroll-runs`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        periodYear: 2026,
        periodMonth: 2,
      })
      .expect(201);
    expect(payroll.body.lines).toHaveLength(1);
    expect(payroll.body.employeeRate).toBe('0.09180');
    expect(payroll.body.employerRate).toBe('0.16570');
    expect(payroll.body.lines[0].incomeTax).toBe('315.753');
    expect(payroll.body.lines[0].netSalary).toBe('1500.647');
    expect(payroll.body.parameterSnapshot.incomeTax.method).toBe(
      'BAREME_PROGRESSIF_ANNUALISE',
    );
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/payroll-runs/${payroll.body.id}/validate`,
      )
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/payroll/cnss/2026/1`,
      )
      .set('Authorization', authorization)
      .expect(200)
      .expect(({ body }) => expect(body.employees).toHaveLength(1));

    await request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/notifications/scan`)
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/notifications?unreadOnly=true`)
      .set('Authorization', collaboratorAuthorization)
      .expect(200)
      .expect(({ body }) => expect(body.length).toBeGreaterThan(0));

    const automaticTasks = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/tasks`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(200);
    expect(automaticTasks.body.total).toBe(16);
    const obligationTask = automaticTasks.body.items.find(
      (item: { obligationId: string }) =>
        item.obligationId === monthlyJanuary.id,
    ) as { id: string; checklistTotal: number };
    expect(obligationTask.checklistTotal).toBe(3);

    const manualTask = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/tasks`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        title: 'Récupérer le relevé bancaire',
        description: 'Demander le relevé du mois au client.',
        dueOn: '2026-02-10',
        priority: 'HAUTE',
        checklist: ['Envoyer la demande', 'Recevoir le relevé'],
      })
      .expect(201);
    expect(manualTask.body.type).toBe('MANUELLE');
    expect(manualTask.body.checklistTotal).toBe(2);

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/tasks/${manualTask.body.id}/comments`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ body: 'Demande envoyée au client.' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/tasks/${manualTask.body.id}/progress`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ status: 'EN_COURS', comment: 'Traitement commencé' })
      .expect(200);
    for (const checklistItem of manualTask.body.checklist as {
      id: string;
    }[]) {
      await request(app.getHttpServer())
        .patch(
          `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/tasks/${manualTask.body.id}/checklist/${checklistItem.id}`,
        )
        .set('Authorization', collaboratorAuthorization)
        .send({ isCompleted: true })
        .expect(200);
    }
    await request(app.getHttpServer())
      .patch(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/tasks/${manualTask.body.id}/progress`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        status: 'PRETE_POUR_REVISION',
        comment: 'Relevé reçu et contrôlé',
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/tasks/${manualTask.body.id}/complete`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/tasks/${manualTask.body.id}/complete`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('TERMINEE'));

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierB.body.id}/tasks`,
      )
      .set('Authorization', authorization)
      .send({
        title: 'Tâche privée du dossier B',
        dueOn: '2026-03-01',
        priority: 'NORMALE',
      })
      .expect(201);
    const collaboratorCabinetTasks = await request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/tasks`)
      .set('Authorization', collaboratorAuthorization)
      .expect(200);
    expect(
      collaboratorCabinetTasks.body.items.some(
        (item: { dossierId: string }) => item.dossierId === dossierB.body.id,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .patch(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations/${monthlyJanuary.id}/progress`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ status: 'EN_COURS', comment: 'Préparation démarrée' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations/${monthlyJanuary.id}/progress`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({
        status: 'PRETE_POUR_REVISION',
        comment: 'Prête pour validation',
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations/${monthlyJanuary.id}/validate`,
      )
      .set('Authorization', collaboratorAuthorization)
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations/${monthlyJanuary.id}/validate`,
      )
      .set('Authorization', authorization)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('VALIDEE'));
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations/${monthlyJanuary.id}/file`,
      )
      .set('Authorization', authorization)
      .send({ amountDue: '1250.500', notes: 'Quittance à joindre' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('DEPOSEE'));
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}/obligations/${monthlyJanuary.id}/pay`,
      )
      .set('Authorization', authorization)
      .send({ amountPaid: '1250.500', paymentReference: 'PAY-2026-001' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('PAYEE'));

    await request(app.getHttpServer())
      .patch(
        `/api/organizations/${organizationId}/dossiers/${dossierA.body.id}`,
      )
      .set('Authorization', collaboratorAuthorization)
      .send({ status: 'SUSPENDU' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('SUSPENDU'));
  });
});
