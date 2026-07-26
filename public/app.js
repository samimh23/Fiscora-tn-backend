(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)],
    key = 'accounting-nest-session';
  let state = JSON.parse(sessionStorage.getItem(key) || '{}');
  state.organizations ??= [];
  state.organizationId ??= '';
  state.dossiers ??= [];
  state.dossierId ??= '';
  state.obligations ??= [];
  state.obligationId ??= '';
  state.obligationYear ??= 2026;
  state.tasks ??= [];
  state.taskId ??= '';
  state.documents ??= [];
  state.declarations ??= [];
  state.declarationId ??= '';
  state.journals ??= [];
  state.journalId ??= '';
  state.entries ??= [];
  state.entryId ??= '';
  state.accounts ??= [];
  state.invoices ??= [];
  state.invoiceId ??= '';
  state.members ??= [];
  state.assignments ??= [];
  state.costRates ??= [];
  state.timeEntries ??= [];
  state.timeEntryId ??= '';
  state.employees ??= [];
  state.payrollRuns ??= [];
  state.payrollRunId ??= '';
  state.businessInvoices ??= [];
  state.businessInvoiceId ??= '';
  state.thirdParties ??= [];
  state.thirdPartyId ??= '';
  state.payments ??= [];
  state.paymentId ??= '';
  state.bankAccounts ??= [];
  state.bankAccountId ??= '';
  state.bankStatements ??= [];
  state.bankStatementId ??= '';
  state.bankTransactions ??= [];
  state.bankTransactionId ??= '';
  state.fixedAssetCategories ??= [];
  state.fixedAssetCategoryId ??= '';
  state.fixedAssets ??= [];
  state.fixedAssetId ??= '';
  state.fixedAssetPeriods ??= [];
  state.fixedAssetPeriodId ??= '';
  state.financialMappings ??= [];
  state.financialMappingAccountId ??= '';
  state.financialNotes ??= null;
  const save = () => sessionStorage.setItem(key, JSON.stringify(state));
  const notify = (m) => {
    const t = $('#toast');
    t.textContent = m;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  };
  const body = (f) => Object.fromEntries(new FormData(f).entries());
  const compact = (data) =>
    Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== ''),
    );
  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  const contextPath = (p) => {
    if (p.includes('{organizationId}')) {
      if (!state.organizationId)
        throw new Error('Choisissez une organisation.');
      p = p.replaceAll('{organizationId}', state.organizationId);
    }
    if (p.includes('{dossierId}')) {
      if (!state.dossierId) throw new Error('Choisissez un dossier client.');
      p = p.replaceAll('{dossierId}', state.dossierId);
    }
    if (p.includes('{obligationId}')) {
      if (!state.obligationId) throw new Error('Choisissez une obligation.');
      p = p.replaceAll('{obligationId}', state.obligationId);
    }
    if (p.includes('{taskId}')) {
      if (!state.taskId) throw new Error('Choisissez une tâche.');
      p = p.replaceAll('{taskId}', state.taskId);
    }
    return p;
  };
  function renderSession() {
    const org = state.organizations.find((x) => x.id === state.organizationId);
    $('#sessionText').textContent = state.accessToken
      ? `Connecté · ${state.user?.fullName || ''}`
      : 'Session inactive';
    $('#metricUser').textContent = state.user?.fullName || 'Non connecté';
    $('#metricEmail').textContent = state.user?.email || '—';
    $('#metricOrg').textContent = org?.name || 'Non choisie';
    $('#metricRole').textContent = org?.role || '—';
    $('#organizationSelect').innerHTML = state.organizations.length
      ? state.organizations
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.organizationId ? 'selected' : ''}>${x.name} · ${x.role}</option>`,
          )
          .join('')
      : '<option>Aucune</option>';
    $('#dossierSelect').innerHTML = state.dossiers.length
      ? state.dossiers
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.dossierId ? 'selected' : ''}>${x.legalName} · ${x.status}</option>`,
          )
          .join('')
      : '<option value="">Aucun dossier</option>';
    $('#obligationSelect').innerHTML = state.obligations.length
      ? state.obligations
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.obligationId ? 'selected' : ''}>${x.name} · ${x.periodMonth ? `${x.periodMonth}/${x.periodYear}` : x.periodQuarter ? `T${x.periodQuarter}/${x.periodYear}` : x.periodYear}</option>`,
          )
          .join('')
      : '<option value="">Aucune obligation</option>';
    $('#taskSelect').innerHTML = state.tasks.length
      ? state.tasks
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.taskId ? 'selected' : ''}>${x.title} · ${x.status}</option>`,
          )
          .join('')
      : '<option value="">Aucune tâche</option>';
    $('#timeEntryTaskSelect').innerHTML =
      '<option value="">Aucune tâche liée</option>' +
      state.tasks
        .map((x) => `<option value="${x.id}">${x.title} · ${x.status}</option>`)
        .join('');
    const memberOptions = state.members.length
      ? state.members
          .filter((x) => x.isActive)
          .map(
            (x) =>
              `<option value="${x.membershipId}">${x.fullName} · ${x.role}</option>`,
          )
          .join('')
      : '<option value="">Chargez les membres</option>';
    $('#assignmentMemberSelect').innerHTML = memberOptions;
    $('#teamCostMemberSelect').innerHTML = memberOptions;
    $('#journalSelect').innerHTML = state.journals.length
      ? state.journals
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.journalId ? 'selected' : ''}>${x.code} · ${x.name}</option>`,
          )
          .join('')
      : '<option value="">Chargez les journaux</option>';
    $('#businessInvoiceJournalSelect').innerHTML = state.journals.length
      ? state.journals
          .map(
            (x) =>
              `<option value="${x.id}">${x.code} · ${x.name} · ${x.type}</option>`,
          )
          .join('')
      : '<option value="">Chargez les journaux</option>';
    $('#paymentJournalSelect').innerHTML = state.journals.length
      ? state.journals
          .filter((x) => ['BANQUE', 'CAISSE'].includes(x.type))
          .map((x) => `<option value="${x.id}">${x.code} · ${x.name}</option>`)
          .join('')
      : '<option value="">Chargez les journaux</option>';
    $('#bankAccountJournalSelect').innerHTML = state.journals.length
      ? state.journals
          .filter((x) => x.type === 'BANQUE')
          .map((x) => `<option value="${x.id}">${x.code} · ${x.name}</option>`)
          .join('')
      : '<option value="">Créez un journal BANQUE</option>';
    const miscellaneousJournalOptions = state.journals
      .filter((x) => x.type === 'OPERATIONS_DIVERSES')
      .map((x) => `<option value="${x.id}">${x.code} · ${x.name}</option>`)
      .join('');
    $('#fixedAssetJournalSelect').innerHTML =
      miscellaneousJournalOptions ||
      '<option value="">Créez un journal OPÉRATIONS DIVERSES</option>';
    $('#fixedAssetDisposalJournalSelect').innerHTML =
      miscellaneousJournalOptions ||
      '<option value="">Créez un journal OPÉRATIONS DIVERSES</option>';
    $('#closingAdjustmentJournalSelect').innerHTML =
      miscellaneousJournalOptions ||
      '<option value="">Créez un journal OPÉRATIONS DIVERSES</option>';
    $('#closingJournalSelect').innerHTML =
      miscellaneousJournalOptions ||
      '<option value="">Créez un journal OPÉRATIONS DIVERSES</option>';
    $('#openingJournalSelect').innerHTML =
      miscellaneousJournalOptions ||
      '<option value="">Créez un journal OPÉRATIONS DIVERSES</option>';
    const thirdPartyOptions = state.thirdParties.length
      ? state.thirdParties
          .map((x) => `<option value="${x.id}">${x.name} · ${x.type}</option>`)
          .join('')
      : '<option value="">Chargez les tiers</option>';
    $('#businessInvoiceThirdPartySelect').innerHTML = thirdPartyOptions;
    $('#paymentThirdPartySelect').innerHTML = thirdPartyOptions;
    const openInvoiceOptions = state.businessInvoices.length
      ? state.businessInvoices
          .filter(
            (x) =>
              x.kind === 'FACTURE' &&
              x.status === 'COMPTABILISEE' &&
              Number(x.outstandingAmount) > 0,
          )
          .map(
            (x) =>
              `<option value="${x.id}">${x.number} · solde ${x.outstandingAmount} TND</option>`,
          )
          .join('')
      : '';
    $('#paymentInvoiceSelect').innerHTML =
      openInvoiceOptions || '<option value="">Aucune facture ouverte</option>';
    $('#businessInvoiceOriginalSelect').innerHTML =
      state.businessInvoices
        .filter((x) => x.kind === 'FACTURE' && x.status === 'COMPTABILISEE')
        .map(
          (x) =>
            `<option value="${x.id}">${x.type} ${x.number} · solde ${x.outstandingAmount}</option>`,
        )
        .join('') ||
      '<option value="">Facture originale (pour un avoir)</option>';
    $('#fixedAssetPurchaseInvoiceSelect').innerHTML =
      '<option value="">Aucune facture liée</option>' +
      state.businessInvoices
        .filter(
          (x) =>
            x.type === 'ACHAT' &&
            x.kind === 'FACTURE' &&
            x.status === 'COMPTABILISEE',
        )
        .map(
          (x) =>
            `<option value="${x.id}">${x.number} · ${x.thirdPartyName} · ${x.grossAmount} TND</option>`,
        )
        .join('');
    $('#fixedAssetSupplierSelect').innerHTML =
      '<option value="">Aucun fournisseur</option>' +
      state.thirdParties
        .filter((x) =>
          ['FOURNISSEUR', 'CLIENT_ET_FOURNISSEUR'].includes(x.type),
        )
        .map((x) => `<option value="${x.id}">${x.name}</option>`)
        .join('');
    $('#fixedAssetCategorySelect').innerHTML = state.fixedAssetCategories.length
      ? state.fixedAssetCategories
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.fixedAssetCategoryId ? 'selected' : ''}>${x.code} · ${x.name}</option>`,
          )
          .join('')
      : '<option value="">Créez une catégorie</option>';
    $('#fixedAssetSelect').innerHTML = state.fixedAssets.length
      ? state.fixedAssets
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.fixedAssetId ? 'selected' : ''}>${x.code} · ${x.name} · ${x.status}</option>`,
          )
          .join('')
      : '<option value="">Aucune immobilisation</option>';
    $('#fixedAssetPeriodSelect').innerHTML = state.fixedAssetPeriods.length
      ? state.fixedAssetPeriods
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.fixedAssetPeriodId ? 'selected' : ''}>${String(x.periodMonth).padStart(2, '0')}/${x.periodYear} · ${x.accountingAmount} TND · ${x.status}</option>`,
          )
          .join('')
      : '<option value="">Chargez ou générez un plan</option>';
    $('#bankStatementAccountSelect').innerHTML = state.bankAccounts.length
      ? state.bankAccounts
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.bankAccountId ? 'selected' : ''}>${x.name} · ${x.bankName}</option>`,
          )
          .join('')
      : '<option value="">Créez un compte bancaire</option>';
    $('#bankStatementSelect').innerHTML = state.bankStatements.length
      ? state.bankStatements
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.bankStatementId ? 'selected' : ''}>${x.periodStart} → ${x.periodEnd} · ${x.status}</option>`,
          )
          .join('')
      : '<option value="">Aucun relevé</option>';
    $('#bankTransactionSelect').innerHTML = state.bankTransactions.length
      ? state.bankTransactions
          .map(
            (x) =>
              `<option value="${x.id}" ${x.id === state.bankTransactionId ? 'selected' : ''}>${x.transactionDate} · ${x.amount} · ${x.description}</option>`,
          )
          .join('')
      : '<option value="">Aucune opération</option>';
    $('#bankPaymentMatchSelect').innerHTML = state.payments.length
      ? state.payments
          .filter((x) => x.status === 'COMPTABILISE')
          .map(
            (x) =>
              `<option value="${x.id}">${x.reference || x.method} · ${x.amount} · ${x.thirdParty?.name || ''}</option>`,
          )
          .join('')
      : '<option value="">Chargez les règlements</option>';
    $('#bankEntryMatchSelect').innerHTML = state.entries.length
      ? state.entries
          .filter((x) => x.status === 'COMPTABILISEE')
          .map(
            (x) =>
              `<option value="${x.id}">${x.pieceReference} · ${x.entryDate}</option>`,
          )
          .join('')
      : '<option value="">Chargez les écritures</option>';
    const accountOptions = state.accounts.length
      ? state.accounts
          .filter((x) => x.isActive && x.allowsPosting)
          .map((x) => `<option value="${x.id}">${x.code} · ${x.name}</option>`)
          .join('')
      : '<option value="">Chargez le plan comptable</option>';
    $('#debitAccountSelect').innerHTML = accountOptions;
    $('#creditAccountSelect').innerHTML = accountOptions;
    [
      '#businessInvoiceThirdPartyAccount',
      '#businessInvoiceLineAccount',
      '#businessInvoiceVatAccount',
      '#businessInvoiceStampAccount',
      '#businessInvoiceWithholdingAccount',
      '#paymentCashAccount',
      '#paymentThirdPartyAccount',
      '#bankLedgerAccountSelect',
      '#bankCounterpartAccountSelect',
      '#fixedAssetAccountSelect',
      '#fixedAssetAccumulatedAccountSelect',
      '#fixedAssetExpenseAccountSelect',
      '#fixedAssetSettlementAccountSelect',
      '#fixedAssetGainAccountSelect',
      '#fixedAssetLossAccountSelect',
      '#closingAdjustmentDebitAccountSelect',
      '#closingAdjustmentCreditAccountSelect',
    ].forEach((selector) => {
      $(selector).innerHTML = accountOptions;
    });
    $('#closingResultAccountSelect').innerHTML =
      state.accounts
        .filter(
          (x) => x.isActive && x.allowsPosting && x.type === 'CapitauxPropres',
        )
        .map((x) => `<option value="${x.id}">${x.code} · ${x.name}</option>`)
        .join('') ||
      '<option value="">Créez un compte de capitaux propres</option>';
    $('#financialMappingAccountSelect').innerHTML = state.financialMappings
      .length
      ? state.financialMappings
          .map(
            (x) =>
              `<option value="${x.accountId}" ${x.accountId === state.financialMappingAccountId ? 'selected' : ''}>${x.accountCode} · ${x.accountName} · ${x.source}</option>`,
          )
          .join('')
      : '<option value="">Chargez le mapping NC 01</option>';
    $('#thirdPartyReceivableAccount').innerHTML =
      '<option value="">Non renseigné</option>' + accountOptions;
    $('#thirdPartyPayableAccount').innerHTML =
      '<option value="">Non renseigné</option>' + accountOptions;
  }
  function auth(data) {
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.user = data.user;
    state.organizations = data.organizations || [];
    state.organizationId = state.organizations[0]?.id || '';
    state.dossiers = [];
    state.dossierId = '';
    state.obligations = [];
    state.obligationId = '';
    state.tasks = [];
    state.taskId = '';
    resetBusinessState();
    save();
    renderSession();
    notify('Session ouverte.');
  }
  function resetBusinessState() {
    state.members = [];
    state.documents = [];
    state.declarations = [];
    state.declarationId = '';
    state.journals = [];
    state.journalId = '';
    state.entries = [];
    state.entryId = '';
    state.accounts = [];
    state.invoices = [];
    state.invoiceId = '';
    state.assignments = [];
    state.costRates = [];
    state.timeEntries = [];
    state.timeEntryId = '';
    state.employees = [];
    state.payrollRuns = [];
    state.payrollRunId = '';
    state.businessInvoices = [];
    state.businessInvoiceId = '';
    state.thirdParties = [];
    state.thirdPartyId = '';
    state.payments = [];
    state.paymentId = '';
    state.bankAccounts = [];
    state.bankAccountId = '';
    state.bankStatements = [];
    state.bankStatementId = '';
    state.bankTransactions = [];
    state.bankTransactionId = '';
    state.fixedAssetCategories = [];
    state.fixedAssetCategoryId = '';
    state.fixedAssets = [];
    state.fixedAssetId = '';
    state.fixedAssetPeriods = [];
    state.fixedAssetPeriodId = '';
    state.financialMappings = [];
    state.financialMappingAccountId = '';
    state.financialNotes = null;
  }
  async function request(path, { method = 'GET', data, auth = true } = {}) {
    try {
      path = contextPath(path);
    } catch (e) {
      notify(e.message);
      throw e;
    }
    const start = performance.now(),
      headers = { Accept: 'application/json' };
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && state.accessToken)
      headers.Authorization = `Bearer ${state.accessToken}`;
    let response, payload;
    try {
      response = await fetch(path, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      const text = await response.text();
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
    } catch (e) {
      show(method, path, 'Réseau', performance.now() - start, {
        erreur: e.message,
      });
      throw e;
    }
    show(method, path, response.status, performance.now() - start, payload);
    if (!response.ok) {
      notify(
        Array.isArray(payload?.message)
          ? payload.message.join(' ')
          : payload?.message || `Erreur ${response.status}`,
      );
      throw new Error(payload?.message || 'Erreur API');
    }
    return payload;
  }
  async function upload(path, formData) {
    path = contextPath(path);
    const start = performance.now();
    const response = await fetch(path, {
      method: 'POST',
      headers: state.accessToken
        ? { Authorization: `Bearer ${state.accessToken}` }
        : {},
      body: formData,
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    show('POST', path, response.status, performance.now() - start, payload);
    if (!response.ok) {
      notify(payload?.message || `Erreur ${response.status}`);
      throw new Error(payload?.message || 'Erreur API');
    }
    return payload;
  }
  async function download(path, filename) {
    path = contextPath(path);
    const response = await fetch(path, {
      headers: state.accessToken
        ? { Authorization: `Bearer ${state.accessToken}` }
        : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      notify(payload?.message || `Erreur ${response.status}`);
      throw new Error(payload?.message || 'Erreur de téléchargement');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify(`${filename} téléchargé.`);
  }
  function renderFinancialMappingSelection() {
    const selected = state.financialMappings.find(
      (item) => item.accountId === state.financialMappingAccountId,
    );
    if (!selected) return;
    $('#financialStatementSection').value = selected.statementSection || '';
    $('#financialCashFlowCategory').value = selected.cashFlowCategory || '';
    $('#financialMappingSource').textContent =
      `${selected.accountCode} · ${selected.accountName} · ${selected.source}`;
  }
  function renderFinancialNotes() {
    const target = $('#financialNotesSections');
    if (!target) return;
    const notes = state.financialNotes;
    $('#financialNotesStatus').value = notes?.status || 'Non générées';
    if (!notes) {
      target.innerHTML =
        '<small>Générez ou chargez les annexes de l’exercice sélectionné.</small>';
      return;
    }
    const editable = notes.status !== 'VALIDEES';
    const documentOptions = state.documents.length
      ? state.documents
          .map(
            (document) =>
              `<option value="${escapeHtml(document.id)}">${escapeHtml(document.originalName)} · v${escapeHtml(document.version)}</option>`,
          )
          .join('')
      : '<option value="">Chargez d’abord les documents du dossier</option>';
    const formatValue = (column, value) => {
      if (value === null || value === undefined) return '—';
      if (column.type === 'MONEY')
        return new Intl.NumberFormat('fr-TN', {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        }).format(Number(value));
      return escapeHtml(value);
    };
    target.innerHTML = notes.sections
      .map((section) => {
        const tables = (section.autoData || [])
          .map(
            (table) => `<div class="financial-note-table-wrap">
              <b>${escapeHtml(table.title)}</b>
              ${
                table.rows?.length
                  ? `<table class="financial-note-table"><thead><tr>${table.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${table.rows
                      .map(
                        (row) =>
                          `<tr>${table.columns
                            .map(
                              (column) =>
                                `<td class="${column.type === 'TEXT' ? '' : 'number'}">${formatValue(column, row[column.key])}</td>`,
                            )
                            .join('')}</tr>`,
                      )
                      .join('')}</tbody></table>`
                  : `<small>${escapeHtml(table.emptyMessage || 'Aucune donnée disponible.')}</small>`
              }
            </div>`,
          )
          .join('');
        const linkedDocuments = section.documents.length
          ? section.documents
              .map(
                (document) =>
                  `<span>${escapeHtml(document.originalName)} · v${document.version} <button type="button" class="secondary financial-note-detach" data-section-id="${section.id}" data-document-id="${document.documentId}" ${editable ? '' : 'disabled'}>Retirer</button></span>`,
              )
              .join(' ')
          : '<small>Aucune pièce justificative liée.</small>';
        return `<article class="result financial-note-card" data-section-id="${section.id}">
          <h4>Note ${section.noteNumber} · ${escapeHtml(section.title)}</h4>
          <div class="financial-note-meta">${escapeHtml(section.source)}${section.isRequired ? ' · OBLIGATOIRE' : ''}</div>
          <label>Commentaire et informations complémentaires<textarea class="financial-note-content" rows="5" ${editable ? '' : 'disabled'}>${escapeHtml(section.content)}</textarea></label>
          <label>Codes des rubriques liées, séparés par des virgules<input class="financial-note-codes" value="${escapeHtml(section.statementLineCodes.join(','))}" ${editable ? '' : 'disabled'} /></label>
          ${tables}
          <div>${linkedDocuments}</div>
          <div class="fields">
            <label>Justificatif<select class="financial-note-document" ${editable ? '' : 'disabled'}>${documentOptions}</select></label>
          </div>
          <div class="financial-note-actions">
            <button type="button" class="primary financial-note-save" ${editable ? '' : 'disabled'}>Enregistrer la note</button>
            <button type="button" class="secondary financial-note-attach" ${editable ? '' : 'disabled'}>Joindre le document</button>
          </div>
        </article>`;
      })
      .join('');

    $$('.financial-note-save', target).forEach((button) => {
      button.onclick = async () => {
        const card = button.closest('.financial-note-card');
        const year = Number($('#financialStatementYear').value);
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}/sections/${card.dataset.sectionId}`,
          {
            method: 'PUT',
            data: {
              content: $('.financial-note-content', card).value,
              statementLineCodes: $('.financial-note-codes', card)
                .value.split(',')
                .map((code) => code.trim())
                .filter(Boolean),
            },
          },
        );
        renderFinancialNotes();
        notify('Note enregistrée.');
      };
    });
    $$('.financial-note-attach', target).forEach((button) => {
      button.onclick = async () => {
        const card = button.closest('.financial-note-card');
        const documentId = $('.financial-note-document', card).value;
        if (!documentId) return notify('Choisissez un document.');
        const year = Number($('#financialStatementYear').value);
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}/sections/${card.dataset.sectionId}/documents`,
          { method: 'POST', data: { documentId } },
        );
        renderFinancialNotes();
        notify('Justificatif lié.');
      };
    });
    $$('.financial-note-detach', target).forEach((button) => {
      button.onclick = async () => {
        const year = Number($('#financialStatementYear').value);
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}/sections/${button.dataset.sectionId}/documents/${button.dataset.documentId}`,
          { method: 'DELETE' },
        );
        renderFinancialNotes();
        notify('Justificatif retiré.');
      };
    });
  }
  function show(method, path, status, time, payload) {
    $('#responseTitle').textContent = `${method} ${path}`;
    $('#responseMeta').textContent = `HTTP ${status} · ${Math.round(time)} ms`;
    $('#responseBody').textContent =
      payload == null
        ? 'Réponse vide'
        : typeof payload === 'string'
          ? payload
          : JSON.stringify(payload, null, 2);
    $('#response').classList.add('open');
  }
  function items(target, data, format) {
    $(target).innerHTML = data.length
      ? data.map((x) => `<div class="result">${format(x)}</div>`).join('')
      : '<small>Aucune donnée.</small>';
  }
  async function action(name) {
    switch (name) {
      case 'me': {
        const d = await request('/api/auth/me');
        state.user = { id: d.id, email: d.email, fullName: d.fullName };
        state.organizations = d.organizations;
        state.organizationId ||= d.organizations[0]?.id || '';
        save();
        renderSession();
        break;
      }
      case 'refresh':
        if (!state.refreshToken)
          return notify('Aucun jeton de renouvellement.');
        auth(
          await request('/api/auth/refresh', {
            method: 'POST',
            auth: false,
            data: { refreshToken: state.refreshToken },
          }),
        );
        break;
      case 'organizations':
        state.organizations = await request('/api/organizations');
        state.organizationId ||= state.organizations[0]?.id || '';
        save();
        renderSession();
        break;
      case 'details':
        await request('/api/organizations/{organizationId}');
        break;
      case 'dossiers': {
        const data = await request(
          '/api/organizations/{organizationId}/dossiers?page=1&pageSize=100',
        );
        state.dossiers = data.items || [];
        if (!state.dossiers.some((item) => item.id === state.dossierId)) {
          state.dossierId = state.dossiers[0]?.id || '';
        }
        save();
        renderSession();
        items(
          '#dossierResults',
          state.dossiers,
          (x) =>
            `<b>${x.legalName}</b><small>${x.taxIdentifier || 'Sans matricule'} · ${x.legalForm} · ${x.status}</small>`,
        );
        break;
      }
      case 'contacts':
        items(
          '#contacts',
          await request(
            '/api/organizations/{organizationId}/dossiers/{dossierId}/contacts',
          ),
          (x) =>
            `<b>${x.fullName}${x.isPrimary ? ' · Principal' : ''}</b><small>${x.role || 'Sans fonction'} · ${x.email || x.phone || 'Sans coordonnées'}</small>`,
        );
        break;
      case 'obligationTemplates':
        items(
          '#obligationTemplates',
          await request(
            '/api/organizations/{organizationId}/obligation-templates',
          ),
          (x) =>
            `<b>${x.name} · v${x.version}</b><small>${x.frequency} · échéance J+${x.dueMonthOffset} au jour ${x.dueDay}${x.physicalPersonDueDay ? ` · personne physique : ${x.physicalPersonDueDay}` : ''}</small>`,
        );
        break;
      case 'obligations': {
        state.obligations = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/obligations?year=${state.obligationYear}`,
        );
        if (!state.obligations.some((item) => item.id === state.obligationId)) {
          state.obligationId = state.obligations[0]?.id || '';
        }
        save();
        renderSession();
        items(
          '#obligationsList',
          state.obligations,
          (x) =>
            `<b>${x.name} · ${x.status}${x.isLate ? ' · EN RETARD' : ''}</b><small>${x.periodMonth ? `Mois ${x.periodMonth}` : x.periodQuarter ? `Trimestre ${x.periodQuarter}` : `Année ${x.periodYear}`} · échéance ${x.dueOn}</small>`,
        );
        break;
      }
      case 'obligationStart':
        await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/obligations/{obligationId}/progress',
          {
            method: 'PATCH',
            data: { status: 'EN_COURS', comment: 'Travail commencé' },
          },
        );
        await action('obligations');
        break;
      case 'obligationReview':
        await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/obligations/{obligationId}/progress',
          {
            method: 'PATCH',
            data: {
              status: 'PRETE_POUR_REVISION',
              comment: 'Prête pour révision',
            },
          },
        );
        await action('obligations');
        break;
      case 'obligationValidate':
        await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/obligations/{obligationId}/validate',
          { method: 'POST' },
        );
        await action('obligations');
        break;
      case 'obligationFile':
        await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/obligations/{obligationId}/file',
          { method: 'POST', data: {} },
        );
        await action('obligations');
        break;
      case 'tasks': {
        const data = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/tasks?page=1&pageSize=100',
        );
        state.tasks = data.items || [];
        if (!state.tasks.some((item) => item.id === state.taskId)) {
          state.taskId = state.tasks[0]?.id || '';
        }
        save();
        renderSession();
        items(
          '#tasksList',
          state.tasks,
          (x) =>
            `<b>${x.title} · ${x.status}${x.isOverdue ? ' · EN RETARD' : ''}</b><small>${x.type} · ${x.priority} · échéance ${x.dueOn} · checklist ${x.checklistCompleted}/${x.checklistTotal}</small>`,
        );
        break;
      }
      case 'taskStart':
        await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/tasks/{taskId}/progress',
          {
            method: 'PATCH',
            data: { status: 'EN_COURS', comment: 'Travail commencé' },
          },
        );
        await action('tasks');
        break;
      case 'taskChecklistNext': {
        const task = state.tasks.find((item) => item.id === state.taskId);
        const next = task?.checklist?.find((item) => !item.isCompleted);
        if (!next) return notify('Toute la checklist est déjà terminée.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/tasks/{taskId}/checklist/${next.id}`,
          { method: 'PATCH', data: { isCompleted: true } },
        );
        await action('tasks');
        break;
      }
      case 'taskReview':
        await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/tasks/{taskId}/progress',
          {
            method: 'PATCH',
            data: {
              status: 'PRETE_POUR_REVISION',
              comment: 'Travail prêt pour révision',
            },
          },
        );
        await action('tasks');
        break;
      case 'taskComplete':
        await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/tasks/{taskId}/complete',
          { method: 'POST' },
        );
        await action('tasks');
        break;
      case 'taskComments':
        items(
          '#taskComments',
          await request(
            '/api/organizations/{organizationId}/dossiers/{dossierId}/tasks/{taskId}/comments',
          ),
          (x) =>
            `<b>${x.authorName || 'Utilisateur'}</b><small>${x.body}</small>`,
        );
        break;
      case 'fiscalSettings': {
        const snapshot = await request(
          `/api/organizations/{organizationId}/fiscal-settings/applicable?date=${new Date().toISOString().slice(0, 10)}`,
        );
        const rows = [
          ...snapshot.parameters.map((item) => ({
            title: item.label,
            detail: `${item.code} · ${item.value} · depuis ${item.effectiveFrom}`,
          })),
          ...snapshot.incomeTaxBrackets.map((item) => ({
            title: `IRPP ${item.lowerBound} → ${item.upperBound || '∞'} TND`,
            detail: `${item.rate} · depuis ${item.effectiveFrom}`,
          })),
          ...snapshot.withholdingRates.map((item) => ({
            title: item.label,
            detail: `${item.natureCode} · ${item.rate} · depuis ${item.effectiveFrom}`,
          })),
        ];
        items(
          '#fiscalSettingsList',
          rows,
          (item) => `<b>${item.title}</b><small>${item.detail}</small>`,
        );
        break;
      }
      case 'fixedAssetCategories':
        state.fixedAssetCategories = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets/categories',
        );
        if (
          !state.fixedAssetCategories.some(
            (item) => item.id === state.fixedAssetCategoryId,
          )
        )
          state.fixedAssetCategoryId = state.fixedAssetCategories[0]?.id || '';
        save();
        renderSession();
        items(
          '#fixedAssetCategoriesList',
          state.fixedAssetCategories,
          (item) =>
            `<b>${item.code} · ${item.name}</b><small>${item.defaultMethod} · ${item.defaultUsefulLifeMonths} mois · comptes ${item.assetAccount?.code || ''} / ${item.accumulatedDepreciationAccount?.code || ''} / ${item.depreciationExpenseAccount?.code || ''}</small>`,
        );
        break;
      case 'fixedAssets':
        state.fixedAssets = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets',
        );
        if (!state.fixedAssets.some((item) => item.id === state.fixedAssetId))
          state.fixedAssetId = state.fixedAssets[0]?.id || '';
        save();
        renderSession();
        items(
          '#fixedAssetsList',
          state.fixedAssets,
          (item) =>
            `<b>${item.code} · ${item.name} · ${item.status}</b><small>${item.category?.name || ''} · coût ${item.acquisitionCost} TND · VNC ${item.netBookValue} TND · mise en service ${item.serviceDate}</small>`,
        );
        break;
      case 'fixedAssetDetail': {
        if (!state.fixedAssetId)
          return notify('Sélectionnez une immobilisation.');
        const asset = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets/${state.fixedAssetId}`,
        );
        state.fixedAssetPeriods = asset.depreciationPeriods || [];
        if (
          !state.fixedAssetPeriods.some(
            (item) => item.id === state.fixedAssetPeriodId,
          )
        )
          state.fixedAssetPeriodId =
            state.fixedAssetPeriods.find(
              (item) =>
                item.status === 'PLANIFIEE' &&
                Number(item.accountingAmount) > 0,
            )?.id ||
            state.fixedAssetPeriods[0]?.id ||
            '';
        save();
        renderSession();
        items(
          '#fixedAssetPeriodsList',
          state.fixedAssetPeriods,
          (item) =>
            `<b>${String(item.periodMonth).padStart(2, '0')}/${item.periodYear} · ${item.status}</b><small>comptable ${item.accountingAmount} · fiscal ${item.fiscalAmount} · écart ${item.temporaryDifference} · VNC ${item.netBookValue} TND</small>`,
        );
        break;
      }
      case 'fixedAssetSchedule':
        if (!state.fixedAssetId)
          return notify('Sélectionnez une immobilisation.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets/${state.fixedAssetId}/generate-schedule`,
          { method: 'POST' },
        );
        await action('fixedAssetDetail');
        break;
      case 'fixedAssetPostDepreciation':
        if (!state.fixedAssetPeriodId)
          return notify('Sélectionnez une dotation.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets/depreciation-periods/${state.fixedAssetPeriodId}/post`,
          {
            method: 'POST',
            data: { journalId: $('#fixedAssetJournalSelect').value },
          },
        );
        state.fixedAssetPeriodId = '';
        await action('fixedAssetDetail');
        await action('fixedAssets');
        await action('entries');
        break;
      case 'fixedAssetReport': {
        const year = Number($('#fixedAssetReportYear').value);
        const report = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets/reports/depreciation?year=${year}`,
        );
        items(
          '#fixedAssetReportList',
          [
            ...report.rows,
            {
              code: 'TOTAL',
              name: `Exercice ${report.year} · ${report.status}`,
              accounting: report.totals.accounting,
              fiscal: report.totals.fiscal,
              temporaryDifference: report.totals.temporaryDifference,
              posted: report.rows.reduce((sum, row) => sum + row.posted, 0),
              periods: report.rows.reduce((sum, row) => sum + row.periods, 0),
            },
          ],
          (item) =>
            `<b>${item.code} · ${item.name}</b><small>comptable ${item.accounting} · fiscal ${item.fiscal} · écart temporaire ${item.temporaryDifference} TND · ${item.posted}/${item.periods} comptabilisées</small>`,
        );
        break;
      }
      case 'fixedAssetValidateYear': {
        const year = Number($('#fixedAssetReportYear').value);
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets/years/${year}/validate`,
          { method: 'POST' },
        );
        await action('fixedAssetReport');
        break;
      }
      case 'businessInvoices':
        state.businessInvoices = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/business-invoices',
        );
        if (
          !state.businessInvoices.some(
            (item) => item.id === state.businessInvoiceId,
          )
        )
          state.businessInvoiceId = state.businessInvoices[0]?.id || '';
        save();
        renderSession();
        items(
          '#businessInvoicesList',
          state.businessInvoices,
          (item) =>
            `<b>${item.kind} ${item.type} ${item.number} · ${item.status}</b><small>${item.thirdPartyName} · TTC ${item.grossAmount} · payé ${item.paidAmount} · avoirs ${item.creditedAmount} · solde ${item.outstandingAmount} TND · ${item.settlementStatus}</small>`,
        );
        break;
      case 'thirdParties':
        state.thirdParties = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/third-parties',
        );
        if (!state.thirdParties.some((item) => item.id === state.thirdPartyId))
          state.thirdPartyId = state.thirdParties[0]?.id || '';
        save();
        renderSession();
        items(
          '#thirdPartiesList',
          state.thirdParties,
          (item) =>
            `<b>${item.name} · ${item.type}</b><small>Clients ${item.receivableBalance} TND · Fournisseurs ${item.payableBalance} TND · ${item.taxIdentifier || 'sans matricule fiscal'}</small>`,
        );
        break;
      case 'payments':
        state.payments = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/payments',
        );
        if (!state.payments.some((item) => item.id === state.paymentId))
          state.paymentId = state.payments[0]?.id || '';
        save();
        renderSession();
        items(
          '#paymentsList',
          state.payments,
          (item) =>
            `<b>${item.direction} ${item.amount} TND · ${item.status}</b><small>${item.thirdParty.name} · ${item.paymentDate} · ${item.method} · ${item.reference || 'sans référence'}</small>`,
        );
        break;
      case 'paymentPost':
        if (!state.paymentId) return notify('Chargez un règlement.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/payments/${state.paymentId}/post`,
          { method: 'POST' },
        );
        await action('payments');
        await action('businessInvoices');
        await action('thirdParties');
        await action('entries');
        break;
      case 'bankAccounts':
        state.bankAccounts = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/accounts',
        );
        if (!state.bankAccounts.some((item) => item.id === state.bankAccountId))
          state.bankAccountId = state.bankAccounts[0]?.id || '';
        save();
        renderSession();
        items(
          '#bankAccountsList',
          state.bankAccounts,
          (item) =>
            `<b>${item.name} · ${item.bankName}</b><small>${item.iban || 'IBAN non renseigné'} · ${item.ledgerAccount?.code || ''} · ${item.currency}</small>`,
        );
        break;
      case 'bankStatements':
        state.bankStatements = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/statements',
        );
        if (
          !state.bankStatements.some(
            (item) => item.id === state.bankStatementId,
          )
        )
          state.bankStatementId = state.bankStatements[0]?.id || '';
        save();
        renderSession();
        items(
          '#bankStatementsList',
          state.bankStatements,
          (item) =>
            `<b>${item.periodStart} → ${item.periodEnd} · ${item.status}</b><small>${item.bankAccount?.name || ''} · solde final ${item.closingBalance} TND · ${item.rowCount} opération(s)</small>`,
        );
        break;
      case 'bankStatement': {
        if (!state.bankStatementId)
          return notify('Chargez un relevé bancaire.');
        const statement = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/statements/${state.bankStatementId}`,
        );
        state.bankTransactions = statement.transactions || [];
        if (
          !state.bankTransactions.some(
            (item) => item.id === state.bankTransactionId,
          )
        )
          state.bankTransactionId = state.bankTransactions[0]?.id || '';
        save();
        renderSession();
        items(
          '#bankTransactionsList',
          state.bankTransactions,
          (item) =>
            `<b>${item.transactionDate} · ${item.amount} TND · ${item.status}</b><small>${item.description} · ${item.reference || 'sans référence'} · ${item.matchType || 'non rapprochée'}</small>`,
        );
        $('#bankStatementSummary').textContent =
          `Banque ${statement.closingBalance} TND · comptabilité ${statement.currentBookClosingBalance} TND · différence ${statement.currentDifference} TND · ${statement.matchedCount}/${statement.rowCount} rapprochées`;
        break;
      }
      case 'bankAutoMatch':
        if (!state.bankStatementId)
          return notify('Chargez un relevé bancaire.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/statements/${state.bankStatementId}/auto-match`,
          { method: 'POST' },
        );
        await action('bankStatements');
        await action('bankStatement');
        break;
      case 'bankReconcile':
        if (!state.bankStatementId)
          return notify('Chargez un relevé bancaire.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/statements/${state.bankStatementId}/reconcile`,
          { method: 'POST' },
        );
        await action('bankStatements');
        await action('bankStatement');
        break;
      case 'bankMatchPayment':
        if (!state.bankTransactionId)
          return notify('Sélectionnez une opération bancaire.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/transactions/${state.bankTransactionId}/match-payment`,
          {
            method: 'POST',
            data: { paymentId: $('#bankPaymentMatchSelect').value },
          },
        );
        await action('bankStatement');
        break;
      case 'bankMatchEntry':
        if (!state.bankTransactionId)
          return notify('Sélectionnez une opération bancaire.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/transactions/${state.bankTransactionId}/match-entry`,
          {
            method: 'POST',
            data: { journalEntryId: $('#bankEntryMatchSelect').value },
          },
        );
        await action('bankStatement');
        break;
      case 'businessInvoiceValidate':
        if (!state.businessInvoiceId)
          return notify('Chargez une facture métier.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/business-invoices/${state.businessInvoiceId}/validate`,
          { method: 'POST' },
        );
        await action('businessInvoices');
        break;
      case 'businessInvoicePost':
        if (!state.businessInvoiceId)
          return notify('Chargez une facture métier.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/business-invoices/${state.businessInvoiceId}/post`,
          { method: 'POST' },
        );
        await action('businessInvoices');
        await action('entries');
        break;
      case 'documents':
        state.documents = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/documents',
        );
        items(
          '#documentsList',
          state.documents,
          (x) =>
            `<b>${x.originalName} · v${x.version}</b><small>${x.category} · ${x.processingStatus} · ${x.periodMonth || '—'}/${x.periodYear || '—'}</small>`,
        );
        break;
      case 'notifications':
        items(
          '#notificationsList',
          await request(
            '/api/organizations/{organizationId}/notifications?unreadOnly=false',
          ),
          (x) =>
            `<b>${x.title}${x.readAtUtc ? '' : ' · NOUVEAU'}</b><small>${x.body}</small>`,
        );
        break;
      case 'scanNotifications':
        await request(
          '/api/organizations/{organizationId}/notifications/scan',
          { method: 'POST' },
        );
        await action('notifications');
        break;
      case 'declarations':
        state.declarations = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/monthly-declarations',
        );
        if (!state.declarations.some((item) => item.id === state.declarationId))
          state.declarationId = state.declarations[0]?.id || '';
        save();
        items(
          '#declarationsList',
          state.declarations,
          (x) =>
            `<b>${x.periodMonth}/${x.periodYear} · ${x.status}</b><small>TVA ${x.vatDue} · total à payer ${x.totalDue} TND</small>`,
        );
        break;
      case 'declarationReview':
        if (!state.declarationId)
          return notify('Chargez et sélectionnez une déclaration.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/monthly-declarations/${state.declarationId}/review`,
          { method: 'POST' },
        );
        await action('declarations');
        break;
      case 'declarationValidate':
        if (!state.declarationId)
          return notify('Chargez et sélectionnez une déclaration.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/monthly-declarations/${state.declarationId}/validate`,
          { method: 'POST' },
        );
        await action('declarations');
        break;
      case 'journals':
        state.journals = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/journals',
        );
        state.journalId = state.journals[0]?.id || '';
        save();
        renderSession();
        items(
          '#journalsList',
          state.journals,
          (x) => `<b>${x.code} · ${x.name}</b><small>${x.type}</small>`,
        );
        break;
      case 'entries':
        state.entries = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/entries',
        );
        if (!state.entries.some((item) => item.id === state.entryId))
          state.entryId = state.entries[0]?.id || '';
        save();
        renderSession();
        items(
          '#entriesList',
          state.entries,
          (x) =>
            `<b>${x.pieceReference} · ${x.status}</b><small>${x.entryDate} · débit ${x.totalDebit} · crédit ${x.totalCredit}</small>`,
        );
        break;
      case 'entryPost':
        if (!state.entryId) return notify('Chargez une écriture.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/entries/${state.entryId}/post`,
          { method: 'POST' },
        );
        await action('entries');
        break;
      case 'closingPeriods': {
        const year = Number($('#closingPeriodYear').value);
        const periods = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/period-closing/periods?year=${year}`,
        );
        items(
          '#closingPeriodsList',
          periods,
          (period) =>
            `<b>${String(period.periodMonth).padStart(2, '0')}/${period.periodYear} · ${period.status}</b><small>${period.startsOn} → ${period.endsOn} · brouillons ${period.readiness.draftEntries} · amortissements ${period.readiness.unpostedDepreciation} · relevés non rapprochés ${period.readiness.unreconciledStatements}${period.note ? ` · ${period.note}` : ''}</small>`,
        );
        break;
      }
      case 'closingPeriodLock': {
        const year = Number($('#closingPeriodYear').value);
        const month = Number($('#closingPeriodMonth').value);
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/period-closing/periods/${year}/${month}/lock`,
          {
            method: 'POST',
            data: { note: $('#closingPeriodNote').value },
          },
        );
        await action('closingPeriods');
        break;
      }
      case 'closingPeriodReopen': {
        const year = Number($('#closingPeriodYear').value);
        const month = Number($('#closingPeriodMonth').value);
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/period-closing/periods/${year}/${month}/reopen`,
          {
            method: 'POST',
            data: { reason: $('#closingPeriodNote').value },
          },
        );
        await action('closingPeriods');
        break;
      }
      case 'closingAdjustments':
        items(
          '#closingAdjustmentsList',
          await request(
            '/api/organizations/{organizationId}/dossiers/{dossierId}/period-closing/adjustments',
          ),
          (adjustment) =>
            `<b>${adjustment.type} · ${adjustment.entryDate}</b><small>${adjustment.description} · écriture ${adjustment.journalEntry?.pieceReference || ''}${adjustment.reversalDate ? ` · extourne ${adjustment.reversalDate}` : ''}</small>`,
        );
        break;
      case 'closingYearReadiness': {
        const year = Number($('#closingYear').value);
        const readiness = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/period-closing/years/${year}/readiness`,
        );
        items(
          '#closingYearReadinessList',
          [readiness],
          (item) =>
            `<b>Exercice ${item.periodYear} · ${item.ready ? 'PRÊT À CLÔTURER' : 'CONTRÔLES REQUIS'}</b><small>${item.startsOn} → ${item.endsOn} · périodes ouvertes ${item.unlockedPeriods.length} · brouillons ${item.draftEntries} · amortissements ${item.unpostedDepreciation} · relevés non rapprochés ${item.unreconciledStatements}</small>`,
        );
        break;
      }
      case 'closingYearClose': {
        const year = Number($('#closingYear').value);
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/period-closing/years/${year}/close`,
          {
            method: 'POST',
            data: {
              closingJournalId: $('#closingJournalSelect').value,
              openingJournalId: $('#openingJournalSelect').value,
              resultAccountId: $('#closingResultAccountSelect').value,
            },
          },
        );
        await action('closingYearReadiness');
        await action('closingYears');
        await action('entries');
        break;
      }
      case 'closingYears':
        items(
          '#closingYearsList',
          await request(
            '/api/organizations/{organizationId}/dossiers/{dossierId}/period-closing/years',
          ),
          (closing) =>
            `<b>${closing.periodYear} · ${closing.status} · résultat ${closing.netResult} TND</b><small>${closing.startsOn} → ${closing.endsOn} · clôture ${closing.closingJournalEntry?.pieceReference || 'sans écriture'} · ouverture ${closing.openingJournalEntry?.pieceReference || 'sans écriture'}</small>`,
        );
        break;
      case 'financialNotesGenerate': {
        const year = Number($('#financialStatementYear').value);
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}/generate`,
          { method: 'POST' },
        );
        if (!state.documents.length) await action('documents');
        renderFinancialNotes();
        break;
      }
      case 'financialNotesLoad': {
        const year = Number($('#financialStatementYear').value);
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}`,
        );
        if (!state.documents.length) await action('documents');
        renderFinancialNotes();
        break;
      }
      case 'financialNotesSubmit': {
        const year = Number($('#financialStatementYear').value);
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}/submit`,
          { method: 'POST' },
        );
        renderFinancialNotes();
        break;
      }
      case 'financialNotesReject': {
        const year = Number($('#financialStatementYear').value);
        const comment = $('#financialNotesReviewComment').value.trim();
        if (!comment) return notify('Saisissez le motif du rejet.');
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}/reject`,
          { method: 'POST', data: { comment } },
        );
        renderFinancialNotes();
        break;
      }
      case 'financialNotesValidate': {
        const year = Number($('#financialStatementYear').value);
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}/validate`,
          { method: 'POST' },
        );
        renderFinancialNotes();
        await action('financialStatement');
        break;
      }
      case 'financialNotesReopen': {
        const year = Number($('#financialStatementYear').value);
        const comment = $('#financialNotesReviewComment').value.trim();
        if (!comment) return notify('Saisissez le motif de réouverture.');
        state.financialNotes = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/notes/${year}/reopen`,
          { method: 'POST', data: { comment } },
        );
        renderFinancialNotes();
        break;
      }
      case 'financialMappings':
        state.financialMappings = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/mappings',
        );
        if (
          !state.financialMappings.some(
            (item) => item.accountId === state.financialMappingAccountId,
          )
        )
          state.financialMappingAccountId =
            state.financialMappings[0]?.accountId || '';
        save();
        renderSession();
        renderFinancialMappingSelection();
        items(
          '#financialMappingsList',
          state.financialMappings,
          (item) =>
            `<b>${item.accountCode} · ${item.accountName}</b><small>${item.statementSectionLabel || 'Rubrique non classée'} · ${item.cashFlowCategoryLabel || 'Flux non classé'} · ${item.source}</small>`,
        );
        break;
      case 'financialMappingDefaults':
        await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/mappings/apply-defaults',
          { method: 'POST' },
        );
        await action('financialMappings');
        break;
      case 'financialMappingSave':
        if (!state.financialMappingAccountId)
          return notify('Choisissez un compte comptable.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/mappings/${state.financialMappingAccountId}`,
          {
            method: 'PUT',
            data: {
              statementSection: $('#financialStatementSection').value || null,
              cashFlowCategory: $('#financialCashFlowCategory').value || null,
            },
          },
        );
        await action('financialMappings');
        break;
      case 'financialStatement': {
        const year = Number($('#financialStatementYear').value);
        const report = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/statements/${year}`,
        );
        const rows = [
          {
            title: `Bilan ${report.period.year} · ${report.source}`,
            detail: `Actifs ${report.balanceSheet.totalAssets.current} · Capitaux propres et passifs ${report.balanceSheet.totalEquityAndLiabilities.current} · écart ${report.balanceSheet.balanceDifference.current} ${report.currencyCode}`,
          },
          {
            title: 'État de résultat',
            detail: `Résultat d’exploitation ${report.incomeStatement.operatingResult.current} · résultat net ${report.incomeStatement.netResult.current} ${report.currencyCode}`,
          },
          {
            title: 'Flux de trésorerie',
            detail: `Variation ${report.cashFlowStatement.cashVariation.current} · trésorerie finale ${report.cashFlowStatement.closingCash.current} · non classé ${report.cashFlowStatement.unclassifiedCashFlow.current}`,
          },
          ...report.controls.map((control) => ({
            title: `${control.status} · ${control.label}`,
            detail: control.message,
          })),
        ];
        items(
          '#financialStatementsList',
          rows,
          (item) => `<b>${item.title}</b><small>${item.detail}</small>`,
        );
        break;
      }
      case 'financialStatementFinalize': {
        const year = Number($('#financialStatementYear').value);
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/statements/${year}/finalize`,
          { method: 'POST' },
        );
        await action('financialStatement');
        await action('financialSnapshots');
        break;
      }
      case 'financialSnapshots':
        items(
          '#financialSnapshotsList',
          await request(
            '/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/snapshots',
          ),
          (snapshot) =>
            `<b>${snapshot.periodYear} · v${snapshot.version} · ${snapshot.status}</b><small>${snapshot.startsOn} → ${snapshot.endsOn} · empreinte ${snapshot.sourceHash.slice(0, 16)}…</small>`,
        );
        break;
      case 'financialStatementPdf': {
        const year = Number($('#financialStatementYear').value);
        await download(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/statements/${year}/export?format=pdf`,
          `etats-financiers-${year}.pdf`,
        );
        break;
      }
      case 'financialStatementXlsx': {
        const year = Number($('#financialStatementYear').value);
        await download(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/financial-statements/statements/${year}/export?format=xlsx`,
          `etats-financiers-${year}.xlsx`,
        );
        break;
      }
      case 'trialBalance':
        items(
          '#reportsList',
          await request(
            '/api/organizations/{organizationId}/dossiers/{dossierId}/reports/trial-balance?from=2026-01-01&to=2026-12-31',
          ),
          (x) =>
            `<b>${x.code} · ${x.name}</b><small>Débit ${x.totalDebit} · Crédit ${x.totalCredit} · Solde ${x.balance}</small>`,
        );
        break;
      case 'generalLedger':
        items(
          '#reportsList',
          await request(
            '/api/organizations/{organizationId}/dossiers/{dossierId}/reports/general-ledger?from=2026-01-01&to=2026-12-31',
          ),
          (x) =>
            `<b>${x.entryDate} · ${x.accountCode}</b><small>${x.label} · D ${x.debit} · C ${x.credit}</small>`,
        );
        break;
      case 'financialSummary': {
        const summary = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/reports/financial-summary?from=2026-01-01&to=2026-12-31',
        );
        items(
          '#reportsList',
          Object.entries(summary).map(([name, value]) => ({ name, value })),
          (x) => `<b>${x.name}</b><small>${x.value} TND</small>`,
        );
        break;
      }
      case 'invoices':
        state.invoices = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/invoices',
        );
        if (!state.invoices.some((item) => item.id === state.invoiceId))
          state.invoiceId = state.invoices[0]?.id || '';
        save();
        items(
          '#invoicesList',
          state.invoices,
          (x) =>
            `<b>${x.number} · ${x.status}</b><small>Total ${x.totalAmount} · payé ${x.paidAmount} TND</small>`,
        );
        break;
      case 'invoiceSend':
        if (!state.invoiceId) return notify('Chargez une facture.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/invoices/${state.invoiceId}/send`,
          { method: 'POST' },
        );
        await action('invoices');
        break;
      case 'invoicePay': {
        const invoice = state.invoices.find((x) => x.id === state.invoiceId);
        if (!invoice) return notify('Chargez une facture.');
        const amount = (
          Number(invoice.totalAmount) - Number(invoice.paidAmount)
        ).toFixed(3);
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/invoices/${state.invoiceId}/payments`,
          {
            method: 'POST',
            data: {
              paymentDate: new Date().toISOString().slice(0, 10),
              amount,
              reference: 'Règlement interface',
            },
          },
        );
        await action('invoices');
        break;
      }
      case 'assignments':
        state.assignments = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/assignments',
        );
        save();
        items(
          '#assignmentsList',
          state.assignments,
          (x) =>
            `<b>${escapeHtml(x.fullName)} · ${x.assignmentRole}</b><small>${x.isActive ? 'Active' : 'Inactive'} · budget ${((x.monthlyTimeBudgetMinutes || 0) / 60).toFixed(2)} h/mois</small>`,
        );
        break;
      case 'costRates':
        state.costRates = await request(
          '/api/organizations/{organizationId}/team-cost-rates',
        );
        save();
        items(
          '#costRatesList',
          state.costRates,
          (x) =>
            `<b>${escapeHtml(x.fullName)} · ${x.compensationType}</b><small>Versé ${x.payRateAmount} · coût employeur ${x.employerCostRateAmount} TND · depuis ${x.effectiveFrom}</small>`,
        );
        break;
      case 'timeEntries': {
        const range = body($('#profitabilityForm'));
        state.timeEntries = await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/time-entries?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
        );
        if (!state.timeEntries.some((item) => item.id === state.timeEntryId))
          state.timeEntryId =
            state.timeEntries.find((item) => item.status === 'SOUMIS')?.id ||
            state.timeEntries[0]?.id ||
            '';
        save();
        items(
          '#timeEntriesList',
          state.timeEntries,
          (x) =>
            `<b>${escapeHtml(x.fullName || 'Moi')} · ${x.workDate} · ${x.durationHours} h</b><small>${escapeHtml(x.description)} · ${x.billable ? 'Facturable' : 'Non facturable'} · ${x.status}${x.reviewComment ? ` · ${escapeHtml(x.reviewComment)}` : ''}</small>`,
        );
        break;
      }
      case 'timeEntrySubmit':
        if (!state.timeEntryId) return notify('Chargez un temps de travail.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/time-entries/${state.timeEntryId}/submit`,
          { method: 'POST' },
        );
        await action('timeEntries');
        break;
      case 'timeEntryApprove':
        if (!state.timeEntryId) return notify('Chargez un temps soumis.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/time-entries/${state.timeEntryId}/review`,
          { method: 'POST', data: { decision: 'APPROUVER' } },
        );
        await action('timeEntries');
        break;
      case 'timeEntryReject': {
        if (!state.timeEntryId) return notify('Chargez un temps soumis.');
        const comment = prompt('Motif du rejet :');
        if (!comment) return;
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/time-entries/${state.timeEntryId}/review`,
          { method: 'POST', data: { decision: 'REJETER', comment } },
        );
        await action('timeEntries');
        break;
      }
      case 'profitability': {
        const range = body($('#profitabilityForm'));
        const report = await request(
          `/api/organizations/{organizationId}/profitability?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
        );
        items(
          '#profitabilityTotals',
          [report.totals],
          (x) =>
            `<b>Marge facturée ${x.marginOnBilled} TND</b><small>Honoraires HT ${x.billedRevenueNet} · encaissés HT ${x.collectedRevenueNet} · coût affecté ${x.allocatedEmployerCost} · ${x.approvedHours} h</small>`,
        );
        items(
          '#profitabilityDossiers',
          report.dossiers,
          (x) =>
            `<b>${escapeHtml(x.dossierName)} · marge ${x.marginOnBilled} TND (${x.marginRateOnBilled} %)</b><small>${x.approvedHours} h / budget ${x.budgetHours} h · honoraires HT ${x.billedRevenueNet} · coût ${x.allocatedEmployerCost}${x.missingCostRateCount ? ` · ${x.missingCostRateCount} coût(s) manquant(s)` : ''}</small>`,
        );
        items(
          '#profitabilityMembers',
          report.members,
          (x) =>
            `<b>${escapeHtml(x.fullName)} · contribution ${x.contributionMarginBilled} TND</b><small>${x.approvedHours} h dont ${x.billableHours} h facturables · versé ${x.payAmount} · coût employeur ${x.employerCost} · revenu affecté ${x.allocatedBilledRevenue}${x.missingCostRate ? ' · coût manquant' : ''}</small>`,
        );
        break;
      }
      case 'employees':
        state.employees = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/employees',
        );
        items(
          '#employeesList',
          state.employees,
          (x) =>
            `<b>${x.fullName}</b><small>${x.contractType} · brut ${x.grossSalary} TND · CNSS ${x.cnssNumber || '—'}</small>`,
        );
        break;
      case 'payroll':
        state.payrollRuns = await request(
          '/api/organizations/{organizationId}/dossiers/{dossierId}/payroll-runs',
        );
        if (!state.payrollRuns.some((item) => item.id === state.payrollRunId))
          state.payrollRunId = state.payrollRuns[0]?.id || '';
        save();
        items(
          '#payrollList',
          state.payrollRuns,
          (x) =>
            `<b>${x.periodMonth}/${x.periodYear} · ${x.status}</b><small>Brut ${x.totalGross} · net ${x.totalNet} · coût employeur ${x.totalEmployerCost}</small>`,
        );
        break;
      case 'payrollValidate':
        if (!state.payrollRunId)
          return notify('Chargez un traitement de paie.');
        await request(
          `/api/organizations/{organizationId}/dossiers/{dossierId}/payroll-runs/${state.payrollRunId}/validate`,
          { method: 'POST' },
        );
        await action('payroll');
        break;
      case 'members':
        state.members = await request(
          '/api/organizations/{organizationId}/members',
        );
        save();
        renderSession();
        items(
          '#members',
          state.members,
          (x) =>
            `<b>${x.fullName}</b><small>${x.email} · ${x.role} · ${x.isActive ? 'Actif' : 'Inactif'}</small>`,
        );
        break;
      case 'roles': {
        const d = await request('/api/organizations/{organizationId}/roles');
        items(
          '#roles',
          d,
          (x) =>
            `<b>${x.name}</b><small>${x.permissions.length} permission(s) · ${x.isSystem ? 'Système' : 'Personnalisé'}</small>`,
        );
        $('#roleSelect').innerHTML = d
          .map((x) => `<option value="${x.id}">${x.name}</option>`)
          .join('');
        break;
      }
      case 'permissions':
        items(
          '#roles',
          await request('/api/organizations/{organizationId}/permissions'),
          (x) => `<b>${x.description}</b><small>${x.name}</small>`,
        );
        break;
      case 'company': {
        const d = await request(
            '/api/organizations/{organizationId}/company-profile',
          ),
          f = $('#companyForm');
        Object.entries(d).forEach(([k, v]) => {
          if (f.elements[k] && v != null) f.elements[k].value = v;
        });
        break;
      }
      case 'years':
        items(
          '#years',
          await request('/api/organizations/{organizationId}/fiscal-years'),
          (x) =>
            `<b>${x.name} · ${x.status}</b><small>${x.startsOn} → ${x.endsOn}</small>`,
        );
        break;
      case 'accounts':
        state.accounts = await request(
          '/api/organizations/{organizationId}/ledger-accounts?includeInactive=true',
        );
        save();
        renderSession();
        items(
          '#accounts',
          state.accounts,
          (x) =>
            `<b>${x.code} · ${x.name}</b><small>${x.type} · ${x.normalBalance}</small>`,
        );
        break;
    }
  }
  $$('nav button').forEach(
    (b) =>
      (b.onclick = () => {
        $$('.page').forEach((p) =>
          p.classList.toggle('active', p.id === b.dataset.page),
        );
        $$('nav button').forEach((n) => n.classList.toggle('active', n === b));
        if (b.dataset.page === 'operations' && state.dossierId) {
          action('documents').catch(console.error);
          action('accounts').catch(console.error);
          action('journals').catch(console.error);
          action('thirdParties').catch(console.error);
          action('businessInvoices').catch(console.error);
          action('payments').catch(console.error);
          action('entries').catch(console.error);
          action('bankAccounts').catch(console.error);
          action('bankStatements').catch(console.error);
          action('fixedAssetCategories').catch(console.error);
          action('fixedAssets').catch(console.error);
          action('closingAdjustments').catch(console.error);
          action('closingYears').catch(console.error);
          action('financialMappings').catch(console.error);
          action('financialSnapshots').catch(console.error);
        }
      }),
  );
  $$('.action').forEach(
    (b) => (b.onclick = () => action(b.dataset.action).catch(console.error)),
  );
  $('#bankStatementSelect').onchange = (e) => {
    state.bankStatementId = e.target.value;
    state.bankTransactions = [];
    state.bankTransactionId = '';
    save();
    action('bankStatement').catch(console.error);
  };
  $('#bankTransactionSelect').onchange = (e) => {
    state.bankTransactionId = e.target.value;
    save();
  };
  $('#fixedAssetSelect').onchange = (e) => {
    state.fixedAssetId = e.target.value;
    state.fixedAssetPeriods = [];
    state.fixedAssetPeriodId = '';
    save();
    renderSession();
  };
  $('#fixedAssetPeriodSelect').onchange = (e) => {
    state.fixedAssetPeriodId = e.target.value;
    save();
  };
  $('#financialMappingAccountSelect').onchange = (e) => {
    state.financialMappingAccountId = e.target.value;
    save();
    renderFinancialMappingSelection();
  };
  $('#fixedAssetCategorySelect').onchange = (e) => {
    state.fixedAssetCategoryId = e.target.value;
    save();
  };
  $('#organizationSelect').onchange = (e) => {
    state.organizationId = e.target.value;
    state.dossiers = [];
    state.dossierId = '';
    state.obligations = [];
    state.obligationId = '';
    state.tasks = [];
    state.taskId = '';
    resetBusinessState();
    save();
    renderSession();
  };
  $('#dossierSelect').onchange = (e) => {
    state.dossierId = e.target.value;
    state.obligations = [];
    state.obligationId = '';
    state.tasks = [];
    state.taskId = '';
    resetBusinessState();
    save();
    renderSession();
  };
  $('#obligationSelect').onchange = (e) => {
    state.obligationId = e.target.value;
    save();
    renderSession();
  };
  $('#taskSelect').onchange = (e) => {
    state.taskId = e.target.value;
    save();
    renderSession();
  };
  $('#close').onclick = () => $('#response').classList.remove('open');
  $('#logout').onclick = () => {
    sessionStorage.removeItem(key);
    state = {
      organizations: [],
      organizationId: '',
      dossiers: [],
      dossierId: '',
      obligations: [],
      obligationId: '',
      obligationYear: 2026,
      tasks: [],
      taskId: '',
    };
    resetBusinessState();
    renderSession();
    notify('Session effacée.');
  };
  $('#registerForm').onsubmit = (e) => {
    e.preventDefault();
    request('/api/auth/register', {
      method: 'POST',
      auth: false,
      data: body(e.target),
    })
      .then(auth)
      .catch(console.error);
  };
  $('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    request('/api/auth/login', {
      method: 'POST',
      auth: false,
      data: body(e.target),
    })
      .then(auth)
      .catch(console.error);
  };
  $('#invitationAcceptForm').onsubmit = (e) => {
    e.preventDefault();
    request('/api/auth/accept-invitation', {
      method: 'POST',
      auth: false,
      data: body(e.target),
    })
      .then(auth)
      .catch(console.error);
  };
  $('#inviteForm').onsubmit = (e) => {
    e.preventDefault();
    request('/api/organizations/{organizationId}/invitations', {
      method: 'POST',
      data: body(e.target),
    }).catch(console.error);
  };
  $('#roleForm').onsubmit = (e) => {
    e.preventDefault();
    const d = body(e.target);
    d.permissions = d.permissions
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    request('/api/organizations/{organizationId}/roles', {
      method: 'POST',
      data: d,
    })
      .then(() => action('roles'))
      .catch(console.error);
  };
  $('#dossierForm').onsubmit = (e) => {
    e.preventDefault();
    const data = body(e.target);
    data.employeeCount = Number(data.employeeCount || 0);
    data.fiscalYearStartMonth = 1;
    data.fiscalYearStartDay = 1;
    data.isVatSubject = e.target.elements.isVatSubject.checked;
    data.hasVatSuspension = e.target.elements.hasVatSuspension.checked;
    data.isTotallyExporting = e.target.elements.isTotallyExporting.checked;
    data.monthlyFee = data.monthlyFee || null;
    data.annualFee = null;
    data.customsCode = null;
    data.billingFrequency = 'MENSUELLE';
    data.tags = data.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    request('/api/organizations/{organizationId}/dossiers', {
      method: 'POST',
      data,
    })
      .then((created) => {
        state.dossierId = created.id;
        return action('dossiers');
      })
      .catch(console.error);
  };
  $('#contactForm').onsubmit = (e) => {
    e.preventDefault();
    const data = body(e.target);
    data.isPrimary = e.target.elements.isPrimary.checked;
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/contacts',
      { method: 'POST', data },
    )
      .then(() => action('contacts'))
      .catch(console.error);
  };
  $('#obligationGenerateForm').onsubmit = (e) => {
    e.preventDefault();
    state.obligationYear = Number(e.target.elements.year.value);
    save();
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/obligations/generate',
      {
        method: 'POST',
        data: { year: state.obligationYear },
      },
    )
      .then(() => action('obligations'))
      .catch(console.error);
  };
  $('#taskForm').onsubmit = (e) => {
    e.preventDefault();
    const data = body(e.target);
    data.checklist = data.checklist
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    request('/api/organizations/{organizationId}/dossiers/{dossierId}/tasks', {
      method: 'POST',
      data,
    })
      .then((created) => {
        state.taskId = created.id;
        return action('tasks');
      })
      .catch(console.error);
  };
  $('#taskCommentForm').onsubmit = (e) => {
    e.preventDefault();
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/tasks/{taskId}/comments',
      { method: 'POST', data: body(e.target) },
    )
      .then(() => action('taskComments'))
      .catch(console.error);
  };
  $('#documentForm').onsubmit = (e) => {
    e.preventDefault();
    upload(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/documents',
      new FormData(e.target),
    )
      .then(() => action('documents'))
      .catch(console.error);
  };
  $('#fiscalParameterForm').onsubmit = (e) => {
    e.preventDefault();
    request('/api/organizations/{organizationId}/fiscal-settings/parameters', {
      method: 'POST',
      data: compact(body(e.target)),
    })
      .then(() => action('fiscalSettings'))
      .catch(console.error);
  };
  $('#withholdingRateForm').onsubmit = (e) => {
    e.preventDefault();
    request(
      '/api/organizations/{organizationId}/fiscal-settings/withholding-rates',
      {
        method: 'POST',
        data: compact(body(e.target)),
      },
    )
      .then(() => action('fiscalSettings'))
      .catch(console.error);
  };
  $('#fixedAssetCategoryForm').onsubmit = (e) => {
    e.preventDefault();
    const data = compact(body(e.target));
    data.defaultUsefulLifeMonths = Number(data.defaultUsefulLifeMonths);
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets/categories',
      { method: 'POST', data },
    )
      .then((created) => {
        state.fixedAssetCategoryId = created.id;
        return action('fixedAssetCategories');
      })
      .catch(console.error);
  };
  $('#fixedAssetForm').onsubmit = (e) => {
    e.preventDefault();
    const data = compact(body(e.target));
    data.usefulLifeMonths = Number(data.usefulLifeMonths);
    data.fiscalUsefulLifeMonths = Number(data.fiscalUsefulLifeMonths);
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets',
      { method: 'POST', data },
    )
      .then(async (created) => {
        state.fixedAssetId = created.id;
        await action('fixedAssets');
        return action('fixedAssetDetail');
      })
      .catch(console.error);
  };
  $('#fixedAssetDisposalForm').onsubmit = (e) => {
    e.preventDefault();
    if (!state.fixedAssetId) return notify('Sélectionnez une immobilisation.');
    request(
      `/api/organizations/{organizationId}/dossiers/{dossierId}/fixed-assets/${state.fixedAssetId}/dispose`,
      { method: 'POST', data: compact(body(e.target)) },
    )
      .then(async () => {
        await action('fixedAssets');
        await action('fixedAssetDetail');
        return action('entries');
      })
      .catch(console.error);
  };
  $('#bankAccountForm').onsubmit = (e) => {
    e.preventDefault();
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/accounts',
      { method: 'POST', data: compact(body(e.target)) },
    )
      .then((created) => {
        state.bankAccountId = created.id;
        return action('bankAccounts');
      })
      .catch(console.error);
  };
  $('#bankStatementImportForm').onsubmit = (e) => {
    e.preventDefault();
    upload(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/statements/import',
      new FormData(e.target),
    )
      .then(async (created) => {
        state.bankStatementId = created.id;
        state.bankTransactions = created.transactions || [];
        state.bankTransactionId = state.bankTransactions[0]?.id || '';
        await action('bankStatements');
        return action('bankStatement');
      })
      .catch(console.error);
  };
  $('#bankGenerateEntryForm').onsubmit = (e) => {
    e.preventDefault();
    if (!state.bankTransactionId)
      return notify('Sélectionnez une opération bancaire.');
    request(
      `/api/organizations/{organizationId}/dossiers/{dossierId}/bank-reconciliation/transactions/${state.bankTransactionId}/generate-entry`,
      { method: 'POST', data: compact(body(e.target)) },
    )
      .then(async (entry) => {
        state.entryId = entry.id;
        await action('entries');
        return action('bankStatement');
      })
      .catch(console.error);
  };
  $('#thirdPartyForm').onsubmit = (e) => {
    e.preventDefault();
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/third-parties',
      { method: 'POST', data: compact(body(e.target)) },
    )
      .then((created) => {
        state.thirdPartyId = created.id;
        return action('thirdParties');
      })
      .catch(console.error);
  };
  $('#paymentForm').onsubmit = (e) => {
    e.preventDefault();
    const form = compact(body(e.target));
    const data = {
      thirdPartyId: form.thirdPartyId,
      direction: form.direction,
      paymentDate: form.paymentDate,
      amount: form.amount,
      method: form.method,
      reference: form.reference,
      journalId: form.journalId,
      cashAccountId: form.cashAccountId,
      thirdPartyAccountId: form.thirdPartyAccountId,
      allocations: [{ invoiceId: form.invoiceId, amount: form.amount }],
    };
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/payments',
      { method: 'POST', data: compact(data) },
    )
      .then((created) => {
        state.paymentId = created.id;
        return action('payments');
      })
      .catch(console.error);
  };
  $('#businessInvoiceForm').onsubmit = (e) => {
    e.preventDefault();
    const form = compact(body(e.target));
    const data = {
      type: form.type,
      kind: form.kind,
      number: form.number,
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      thirdPartyId: form.thirdPartyId,
      thirdPartyName: form.thirdPartyName,
      originalInvoiceId: form.originalInvoiceId,
      journalId: form.journalId,
      thirdPartyAccountId: form.thirdPartyAccountId,
      vatAccountId: form.vatAccountId,
      stampAccountId: form.stampAccountId,
      withholdingNature: form.withholdingNature,
      withholdingAccountId: form.withholdingAccountId,
      lines: [
        {
          accountId: form.lineAccountId,
          description: form.lineDescription,
          quantity: form.quantity,
          unitPrice: form.unitPrice,
          discountRate: form.discountRate,
          vatCode: form.vatCode,
        },
      ],
    };
    Object.keys(data).forEach((key) => {
      if (data[key] === undefined) delete data[key];
    });
    Object.keys(data.lines[0]).forEach((key) => {
      if (data.lines[0][key] === undefined) delete data.lines[0][key];
    });
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/business-invoices',
      { method: 'POST', data },
    )
      .then((created) => {
        state.businessInvoiceId = created.id;
        return action('businessInvoices');
      })
      .catch(console.error);
  };
  $('#declarationForm').onsubmit = (e) => {
    e.preventDefault();
    const data = compact(body(e.target));
    data.periodYear = Number(data.periodYear);
    data.periodMonth = Number(data.periodMonth);
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/monthly-declarations',
      { method: 'PUT', data },
    )
      .then((created) => {
        state.declarationId = created.id;
        return action('declarations');
      })
      .catch(console.error);
  };
  $('#closingAdjustmentForm').onsubmit = (e) => {
    e.preventDefault();
    const form = compact(body(e.target));
    const data = {
      type: form.type,
      entryDate: form.entryDate,
      reversalDate: form.reversalDate,
      description: form.description,
      journalId: form.journalId,
      lines: [
        {
          accountId: form.debitAccountId,
          label: form.description,
          debit: form.amount,
          credit: '0.000',
        },
        {
          accountId: form.creditAccountId,
          label: form.description,
          debit: '0.000',
          credit: form.amount,
        },
      ],
    };
    if (!data.reversalDate) delete data.reversalDate;
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/period-closing/adjustments',
      { method: 'POST', data },
    )
      .then(async () => {
        await action('closingAdjustments');
        return action('entries');
      })
      .catch(console.error);
  };
  $('#journalForm').onsubmit = (e) => {
    e.preventDefault();
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/journals',
      { method: 'POST', data: body(e.target) },
    )
      .then((created) => {
        state.journalId = created.id;
        return action('journals');
      })
      .catch(console.error);
  };
  $('#entryForm').onsubmit = (e) => {
    e.preventDefault();
    const data = body(e.target);
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/entries',
      {
        method: 'POST',
        data: {
          journalId: data.journalId,
          entryDate: data.entryDate,
          pieceReference: data.pieceReference,
          description: data.description,
          lines: [
            {
              accountId: data.debitAccountId,
              label: data.description,
              debit: data.amount,
              credit: '0.000',
            },
            {
              accountId: data.creditAccountId,
              label: data.description,
              debit: '0.000',
              credit: data.amount,
            },
          ],
        },
      },
    )
      .then((created) => {
        state.entryId = created.id;
        return action('entries');
      })
      .catch(console.error);
  };
  $('#invoiceForm').onsubmit = (e) => {
    e.preventDefault();
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/invoices',
      { method: 'POST', data: body(e.target) },
    )
      .then((created) => {
        state.invoiceId = created.id;
        return action('invoices');
      })
      .catch(console.error);
  };
  $('#assignmentEconomicsForm').onsubmit = (e) => {
    e.preventDefault();
    const data = body(e.target);
    const membershipId = data.membershipId;
    if (!membershipId) return notify('Chargez et choisissez un membre.');
    request(
      `/api/organizations/{organizationId}/dossiers/{dossierId}/assignments/${membershipId}`,
      {
        method: 'PUT',
        data: {
          assignmentRole: data.assignmentRole,
          isActive: e.target.elements.isActive.checked,
          monthlyTimeBudgetMinutes: Number(data.monthlyTimeBudgetMinutes),
        },
      },
    )
      .then(() => action('assignments'))
      .catch(console.error);
  };
  $('#teamCostForm').onsubmit = (e) => {
    e.preventDefault();
    const data = compact(body(e.target));
    if (!data.membershipId) return notify('Chargez et choisissez un membre.');
    data.monthlyTargetMinutes = Number(data.monthlyTargetMinutes);
    request('/api/organizations/{organizationId}/team-cost-rates', {
      method: 'POST',
      data,
    })
      .then(() => action('costRates'))
      .catch(console.error);
  };
  $('#timeEntryForm').onsubmit = (e) => {
    e.preventDefault();
    const data = body(e.target);
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/time-entries',
      {
        method: 'POST',
        data: {
          workDate: data.workDate,
          durationMinutes: Number(data.durationMinutes),
          billable: e.target.elements.billable.checked,
          description: data.description,
          taskId: data.taskId || null,
        },
      },
    )
      .then((created) => {
        state.timeEntryId = created.id;
        return action('timeEntries');
      })
      .catch(console.error);
  };
  $('#profitabilityForm').onsubmit = (e) => {
    e.preventDefault();
    action('profitability').catch(console.error);
  };
  $('#employeeForm').onsubmit = (e) => {
    e.preventDefault();
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/employees',
      { method: 'POST', data: body(e.target) },
    )
      .then(() => action('employees'))
      .catch(console.error);
  };
  $('#payrollForm').onsubmit = (e) => {
    e.preventDefault();
    const data = compact(body(e.target));
    data.periodYear = Number(data.periodYear);
    data.periodMonth = Number(data.periodMonth);
    request(
      '/api/organizations/{organizationId}/dossiers/{dossierId}/payroll-runs',
      { method: 'POST', data },
    )
      .then((created) => {
        state.payrollRunId = created.id;
        return action('payroll');
      })
      .catch(console.error);
  };
  $('#companyForm').onsubmit = (e) => {
    e.preventDefault();
    request('/api/organizations/{organizationId}/company-profile', {
      method: 'PUT',
      data: { ...body(e.target), addressLine2: null, phone: null },
    }).catch(console.error);
  };
  $('#yearForm').onsubmit = (e) => {
    e.preventDefault();
    request('/api/organizations/{organizationId}/fiscal-years', {
      method: 'POST',
      data: body(e.target),
    })
      .then(() => action('years'))
      .catch(console.error);
  };
  $('#accountForm').onsubmit = (e) => {
    e.preventDefault();
    request('/api/organizations/{organizationId}/ledger-accounts', {
      method: 'POST',
      data: {
        ...body(e.target),
        parentAccountId: null,
        allowsPosting: e.target.elements.allowsPosting.checked,
      },
    })
      .then(() => action('accounts'))
      .catch(console.error);
  };
  const presets = [
    ['Santé', 'GET', '/health', '', false],
    ['Profil', 'GET', '/api/auth/me', '', true],
    ['Organisations', 'GET', '/api/organizations', '', true],
    ['Membres', 'GET', '/api/organizations/{organizationId}/members', '', true],
    [
      'Dossiers clients',
      'GET',
      '/api/organizations/{organizationId}/dossiers',
      '',
      true,
    ],
    [
      'Contacts du dossier',
      'GET',
      '/api/organizations/{organizationId}/dossiers/{dossierId}/contacts',
      '',
      true,
    ],
    [
      'Modèles obligations',
      'GET',
      '/api/organizations/{organizationId}/obligation-templates',
      '',
      true,
    ],
    [
      'Calendrier obligations',
      'GET',
      '/api/organizations/{organizationId}/dossiers/{dossierId}/obligations?year=2026',
      '',
      true,
    ],
    [
      'Tâches du dossier',
      'GET',
      '/api/organizations/{organizationId}/dossiers/{dossierId}/tasks',
      '',
      true,
    ],
    [
      'Tâches du cabinet',
      'GET',
      '/api/organizations/{organizationId}/tasks?overdue=true',
      '',
      true,
    ],
    [
      'Audit',
      'GET',
      '/api/organizations/{organizationId}/audit-logs?take=100',
      '',
      true,
    ],
    [
      'Modifier membre',
      'PATCH',
      '/api/organizations/{organizationId}/members/MEMBERSHIP_ID',
      '{\n  "roleId": "ROLE_ID",\n  "isActive": true\n}',
      true,
    ],
    [
      'Clôturer exercice',
      'POST',
      '/api/organizations/{organizationId}/fiscal-years/FISCAL_YEAR_ID/close',
      '',
      true,
    ],
  ];
  $('#preset').innerHTML = presets
    .map((x, i) => `<option value="${i}">${x[0]}</option>`)
    .join('');
  $('#preset').onchange = (e) => {
    const p = presets[e.target.value];
    $('#method').value = p[1];
    $('#path').value = p[2];
    $('#body').value = p[3];
    $('#authenticated').checked = p[4];
  };
  $('#consoleForm').onsubmit = (e) => {
    e.preventDefault();
    let data;
    try {
      data = $('#body').value.trim() ? JSON.parse($('#body').value) : undefined;
    } catch {
      return notify('JSON invalide.');
    }
    request($('#path').value, {
      method: $('#method').value,
      data,
      auth: $('#authenticated').checked,
    }).catch(console.error);
  };
  renderSession();
  request('/health', { auth: false })
    .then((d) => {
      $('#dot').className = 'dot ok';
      $('#healthText').textContent = d.message;
      $('#metricApi').textContent = 'Opérationnelle';
      $('#response').classList.remove('open');
    })
    .catch(() => {
      $('#dot').className = 'dot error';
      $('#healthText').textContent = 'API indisponible';
      $('#metricApi').textContent = 'Indisponible';
    });
})();
