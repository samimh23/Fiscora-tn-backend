import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrganizationMembership } from '../database/entities';
import { PermissionNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import { FinancialStatementsService } from '../financial-statements/financial-statements.service';
import type { Citation } from './assistant.service';
import type { LiveFinancialIntent } from './live-financial-intent';

interface PartyMatch {
  id: string | null;
  name: string;
  tax_identifier: string | null;
  type: string;
}
interface InvoiceRow {
  id: string;
  number: string;
  type: string;
  kind: string;
  status: string;
  invoice_date: string;
  third_party_name: string;
  net_amount: string;
  vat_amount: string;
  gross_amount: string;
  net_payable: string;
  paid_amount: string;
  credited_amount: string;
  outstanding_amount: string;
  currency_code: string;
  due_date: string | null;
}
interface BalanceRow extends InvoiceRow {
  supplier_due: string;
  supplier_refund: string;
  customer_due: string;
  customer_refund: string;
  record_count: string;
}
interface PaymentRow {
  id: string;
  reference: string | null;
  payment_date: string;
  status: string;
  direction: string;
  amount: string;
  allocated_amount?: string;
  method: string;
  instrument_status: string | null;
  correction_type: string | null;
  correction_reason: string | null;
  correction_date: string | null;
}
export interface LiveFinancialAnswer {
  answer: string;
  citations: Citation[];
}

const nameKey = (text: string) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').trim().toUpperCase();
const display = (text: string) => text.replace(/[\r\n[\]]/g, ' ').slice(0, 250);

@Injectable()
export class LiveFinancialService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dossiers: DossiersService,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    private readonly statements: FinancialStatementsService,
  ) {}

  async answer(
    organizationId: string,
    dossierId: string,
    userId: string,
    intent: LiveFinancialIntent,
  ): Promise<LiveFinancialAnswer> {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const membership = await this.memberships.findOne({
      where: { organizationId, userId, isActive: true },
      relations: { organization: true, role: { rolePermissions: true } },
    });
    const permissions = new Set(
      membership?.role.rolePermissions.map(
        (permission) => permission.permissionName,
      ),
    );
    const required =
      intent.operation === 'FINANCIAL_SUMMARY'
        ? [PermissionNames.FinancialStatementsView]
        : intent.operation === 'BALANCES'
          ? [
              PermissionNames.BusinessInvoicesView,
              PermissionNames.ThirdPartiesView,
            ]
          : [
              PermissionNames.BusinessInvoicesView,
              PermissionNames.PaymentsView,
            ];
    if (
      !membership?.organization.isActive ||
      required.some((permission) => !permissions.has(permission))
    ) {
      throw new ForbiddenException(
        'Vous n’avez pas les permissions nécessaires pour consulter ces données financières.',
      );
    }
    if (
      intent.unsupportedPeriod ||
      (intent.operation === 'BALANCES' && intent.year !== null)
    ) {
      return this.clarify(
        'Les soldes et paiements sont consultés dans leur état actuel. Le résumé financier couvre un exercice annuel. Précisez un solde actuel ou une année de résumé; les soldes historiques et résumés mensuels ne sont pas disponibles ici.',
      );
    }
    if (intent.operation === 'BALANCES')
      return this.balances(organizationId, dossierId, intent);
    if (intent.operation === 'INVOICE_DETAILS')
      return this.details(organizationId, dossierId, intent);
    if (intent.operation === 'FINANCIAL_SUMMARY')
      return this.summary(organizationId, dossierId, userId, intent.year);
    return this.clarify(
      'Précisez un tiers, une facture, un règlement ou une année de résumé financier.',
    );
  }

  private clarify(answer: string): LiveFinancialAnswer {
    return { answer, citations: [] };
  }

  private cite(
    citations: Citation[],
    dossierId: string,
    id: string,
    name: string,
    kind:
      | 'BUSINESS_INVOICE'
      | 'PAYMENT'
      | 'FINANCIAL_REPORT'
      | 'PARTY_BALANCE' = 'BUSINESS_INVOICE',
    year?: number,
  ): string {
    const label = `S${citations.length + 1}`;
    citations.push({
      label,
      chunkId: `live:${kind}:${id}`,
      sourceId: id,
      sourceName: display(name),
      pageNumber: null,
      kind,
      path:
        kind === 'FINANCIAL_REPORT'
          ? `/etats-financiers?dossierId=${encodeURIComponent(dossierId)}&year=${year}`
          : `/factures?dossierId=${encodeURIComponent(dossierId)}`,
    });
    return `[${label}]`;
  }

  private async findParty(
    organizationId: string,
    dossierId: string,
    intent: LiveFinancialIntent,
  ): Promise<PartyMatch[] | null> {
    if (!intent.partyName) return null;
    const escaped = intent.partyName.replace(/[\\%_]/g, '\\$&');
    const rows = await this.dataSource.query<PartyMatch[]>(
      `WITH candidates AS (
        SELECT id, name, tax_identifier, type FROM accounting.third_parties
        WHERE organization_id=$1 AND dossier_id=$2
        UNION
        SELECT NULL::uuid AS id, third_party_name AS name, third_party_tax_identifier AS tax_identifier,
          CASE WHEN type='ACHAT' THEN 'FOURNISSEUR' ELSE 'CLIENT' END AS type
        FROM accounting.business_invoices
        WHERE organization_id=$1 AND dossier_id=$2 AND third_party_id IS NULL
          AND kind='FACTURE' AND status='COMPTABILISEE'
      ) SELECT * FROM candidates WHERE name ILIKE $3
        AND ($4='ANY' OR type='CLIENT_ET_FOURNISSEUR'
          OR type=CASE WHEN $4='SUPPLIER' THEN 'FOURNISSEUR' ELSE 'CLIENT' END)
      ORDER BY CASE WHEN UPPER(name)=UPPER($5) THEN 0 ELSE 1 END, name, id LIMIT 21`,
      [
        organizationId,
        dossierId,
        `%${escaped}%`,
        intent.partyType,
        intent.partyName,
      ],
    );
    const exact = rows.filter(
      (row) => nameKey(row.name) === nameKey(intent.partyName!),
    );
    return exact.length ? exact : rows;
  }

  private async balances(
    organizationId: string,
    dossierId: string,
    intent: LiveFinancialIntent,
  ): Promise<LiveFinancialAnswer> {
    const candidates = await this.findParty(organizationId, dossierId, intent);
    if (candidates && candidates.length !== 1) {
      return this.clarify(
        candidates.length
          ? `Plusieurs tiers correspondent. Précisez le nom complet et le type client/fournisseur : ${candidates
              .slice(0, 20)
              .map(
                (row) =>
                  `${display(row.name)} (${row.type}, MF ${display(row.tax_identifier ?? 'non renseigné')})`,
              )
              .join('; ')}.`
          : `Aucun tiers ou nom de facture comptabilisée ne correspond à « ${display(intent.partyName!)} » dans ce dossier. Vérifiez le nom; cela ne signifie pas que le solde est nul.`,
      );
    }
    const party = candidates?.[0];
    const rows = await this.dataSource.query<BalanceRow[]>(
      `SELECT i.*, i.invoice_date::text AS invoice_date, i.due_date::text AS due_date,
        SUM(CASE WHEN type='ACHAT' THEN GREATEST(outstanding_amount,0) ELSE 0 END) OVER()::text AS supplier_due,
        SUM(CASE WHEN type='ACHAT' THEN GREATEST(-outstanding_amount,0) ELSE 0 END) OVER()::text AS supplier_refund,
        SUM(CASE WHEN type='VENTE' THEN GREATEST(outstanding_amount,0) ELSE 0 END) OVER()::text AS customer_due,
        SUM(CASE WHEN type='VENTE' THEN GREATEST(-outstanding_amount,0) ELSE 0 END) OVER()::text AS customer_refund,
        COUNT(*) OVER()::text AS record_count
       FROM accounting.business_invoices i
       WHERE organization_id=$1 AND dossier_id=$2 AND kind='FACTURE' AND status='COMPTABILISEE'
         AND ($3::boolean=false OR third_party_id=$4::uuid OR
           ($4::uuid IS NULL AND third_party_id IS NULL AND third_party_name=$5
            AND COALESCE(third_party_tax_identifier,'')=$6))
         AND ($7='ANY' OR type=CASE WHEN $7='SUPPLIER' THEN 'ACHAT' ELSE 'VENTE' END)
         AND outstanding_amount<>0
       ORDER BY due_date ASC NULLS LAST, invoice_date ASC, id LIMIT 31`,
      [
        organizationId,
        dossierId,
        Boolean(party),
        party?.id ?? null,
        party?.name ?? '',
        party?.tax_identifier ?? '',
        intent.partyType,
      ],
    );
    const citations: Citation[] = [];
    const source = this.cite(
      citations,
      dossierId,
      party?.id ?? dossierId,
      party ? `Soldes de ${party.name}` : 'Soldes clients et fournisseurs',
      'PARTY_BALANCE',
    );
    // Balances use canonical outstanding_amount. Never subtract payments or credit notes again.
    const totals = rows[0];
    const lines = [
      `Soldes actuels${party ? ` de « ${display(party.name)} »` : ' du dossier'}, au ${new Date().toISOString()}. Factures comptabilisées uniquement; montants comptables en TND. ${source}`,
    ];
    if (intent.partyType !== 'CUSTOMER')
      lines.push(
        `À payer aux fournisseurs : ${totals?.supplier_due ?? '0.000'} TND; à récupérer des fournisseurs : ${totals?.supplier_refund ?? '0.000'} TND. ${source}`,
      );
    if (intent.partyType !== 'SUPPLIER')
      lines.push(
        `À recevoir des clients : ${totals?.customer_due ?? '0.000'} TND; à rembourser aux clients : ${totals?.customer_refund ?? '0.000'} TND. ${source}`,
      );
    lines.push(
      'Les règlements comptabilisés, avoirs et corrections sont déjà reflétés dans ces soldes. Les chèques enregistrés ne prouvent pas leur encaissement bancaire.',
    );
    if (party?.id)
      lines.push(
        'Périmètre : factures rattachées à ce tiers. Les factures saisies sans tiers lié ne sont pas automatiquement assimilées à ce compte.',
      );
    for (const row of rows.slice(0, 30)) {
      const citation = this.cite(
        citations,
        dossierId,
        row.id,
        `Facture ${row.number}`,
      );
      lines.push(
        `${display(row.number)} — ${display(row.third_party_name)} — ${row.type} — solde signé ${row.outstanding_amount} TND — échéance ${row.due_date ?? 'non renseignée'}. ${citation}`,
      );
    }
    if (Number(totals?.record_count ?? 0) > 30)
      lines.push(
        `30 factures affichées sur ${totals.record_count}; les totaux couvrent toutes les factures correspondantes. ${source}`,
      );
    return { answer: lines.join('\n'), citations };
  }

  private async details(
    organizationId: string,
    dossierId: string,
    intent: LiveFinancialIntent,
  ): Promise<LiveFinancialAnswer> {
    if (!intent.invoiceNumber && !intent.paymentReference)
      return this.clarify(
        'Quel numéro de facture ou quelle référence de règlement voulez-vous consulter ?',
      );
    if (intent.invoiceNumber && intent.paymentReference)
      return this.clarify(
        'Précisez soit le numéro de facture, soit la référence du règlement à consulter.',
      );
    if (intent.paymentReference)
      return this.paymentDetails(
        organizationId,
        dossierId,
        intent.paymentReference,
      );
    const invoices = await this.dataSource.query<InvoiceRow[]>(
      `SELECT i.*, i.invoice_date::text AS invoice_date, i.due_date::text AS due_date FROM accounting.business_invoices i WHERE organization_id=$1 AND dossier_id=$2
        AND UPPER(number)=UPPER($3) AND ($4='ANY' OR type=CASE WHEN $4='SUPPLIER' THEN 'ACHAT' ELSE 'VENTE' END)
      ORDER BY id LIMIT 3`,
      [organizationId, dossierId, intent.invoiceNumber, intent.partyType],
    );
    if (invoices.length !== 1)
      return this.clarify(
        invoices.length
          ? 'Ce numéro correspond à plusieurs factures/avoirs. Précisez achat ou vente, ou utilisez une référence unique.'
          : 'Aucune facture métier ne correspond à ce numéro dans ce dossier. Un fichier seul n’est pas nécessairement une facture métier.',
      );
    const invoice = invoices[0];
    const [payments, credits] = await Promise.all([
      this.dataSource.query<PaymentRow[]>(
        `SELECT p.*, p.payment_date::text AS payment_date, p.correction_date::text AS correction_date, a.amount::text AS allocated_amount FROM accounting.payment_allocations a
         JOIN accounting.third_party_payments p ON p.id=a.payment_id AND p.organization_id=a.organization_id
         WHERE p.organization_id=$1 AND p.dossier_id=$2 AND a.invoice_id=$3
         ORDER BY p.payment_date, p.id LIMIT 51`,
        [organizationId, dossierId, invoice.id],
      ),
      this.dataSource.query<InvoiceRow[]>(
        `SELECT i.*, i.invoice_date::text AS invoice_date FROM accounting.business_invoices i WHERE organization_id=$1 AND dossier_id=$2
          AND original_invoice_id=$3 ORDER BY invoice_date, id LIMIT 51`,
        [organizationId, dossierId, invoice.id],
      ),
    ]);
    const citations: Citation[] = [];
    const source = this.cite(
      citations,
      dossierId,
      invoice.id,
      `Facture ${invoice.number}`,
    );
    const lines = [
      `${display(invoice.number)} — ${invoice.type} / ${invoice.kind} — ${invoice.status} — ${display(invoice.third_party_name)}. ${source}`,
      `Date ${invoice.invoice_date}; échéance ${invoice.due_date ?? 'non renseignée'}. HT ${invoice.net_amount}; TVA ${invoice.vat_amount}; TTC ${invoice.gross_amount}; net à payer ${invoice.net_payable} TND. ${source}`,
      `Règlements nets pris en compte ${invoice.paid_amount}; avoirs comptabilisés ${invoice.credited_amount}; solde signé ${invoice.outstanding_amount} TND (négatif = remboursement attendu). ${source}`,
      'Montants comptables en TND après conversion éventuelle. Seuls les mouvements effectivement comptabilisés affectent le solde; un règlement annulé/brouillon est affiché comme historique, pas comme paiement effectif.',
    ];
    if (invoice.status !== 'COMPTABILISEE')
      lines.push(
        'Cette facture n’est pas comptabilisée : ses montants ne constituent pas une dette/créance comptable publiée.',
      );
    for (const payment of payments.slice(0, 50))
      lines.push(
        this.paymentLine(
          payment,
          this.cite(
            citations,
            dossierId,
            payment.id,
            `Règlement ${payment.reference ?? payment.id}`,
            'PAYMENT',
          ),
        ),
      );
    for (const credit of credits.slice(0, 50))
      lines.push(
        `Avoir ${display(credit.number)} : ${credit.net_payable} TND — ${credit.status}. ${this.cite(citations, dossierId, credit.id, `Avoir ${credit.number}`)}`,
      );
    if (!payments.length)
      lines.push(`Aucun règlement affecté à cette facture. ${source}`);
    if (payments.length > 50 || credits.length > 50)
      lines.push(
        'Historique limité aux 50 premiers règlements et 50 premiers avoirs; le solde ci-dessus reste le solde complet enregistré.',
      );
    return { answer: lines.join('\n'), citations };
  }

  private paymentLine(payment: PaymentRow, citation: string): string {
    return `Règlement ${display(payment.reference ?? payment.id)} — ${payment.payment_date} — ${payment.direction} — ${payment.method} — ${payment.status} : ${payment.amount} TND${payment.allocated_amount ? `; affectation à cette facture ${payment.allocated_amount} TND` : ''}${payment.instrument_status ? `; instrument ${payment.instrument_status}` : ''}${payment.correction_type ? `; correction ${payment.correction_type} le ${payment.correction_date ?? '?'} (${display(payment.correction_reason ?? '')})` : ''}. ${citation}`;
  }

  private async paymentDetails(
    organizationId: string,
    dossierId: string,
    reference: string,
  ): Promise<LiveFinancialAnswer> {
    const payments = await this.dataSource.query<PaymentRow[]>(
      `SELECT p.*, p.payment_date::text AS payment_date, p.correction_date::text AS correction_date FROM accounting.third_party_payments p WHERE organization_id=$1 AND dossier_id=$2
       AND UPPER(reference)=UPPER($3) ORDER BY id LIMIT 3`,
      [organizationId, dossierId, reference],
    );
    if (payments.length !== 1)
      return this.clarify(
        payments.length
          ? 'Plusieurs règlements portent cette référence. Consultez les règlements pour identifier la facture concernée.'
          : 'Aucun règlement ne correspond à cette référence dans ce dossier.',
      );
    const payment = payments[0];
    const allocations = await this.dataSource.query<
      Array<InvoiceRow & { allocated_amount: string }>
    >(
      `SELECT i.*, a.amount::text AS allocated_amount FROM accounting.payment_allocations a
       JOIN accounting.business_invoices i ON i.id=a.invoice_id AND i.organization_id=a.organization_id
       WHERE a.organization_id=$1 AND i.dossier_id=$2 AND a.payment_id=$3 ORDER BY i.number LIMIT 51`,
      [organizationId, dossierId, payment.id],
    );
    const citations: Citation[] = [];
    const source = this.cite(
      citations,
      dossierId,
      payment.id,
      `Règlement ${reference}`,
      'PAYMENT',
    );
    const lines = [
      this.paymentLine(payment, source),
      'Ce règlement est un enregistrement comptable; il ne prouve pas à lui seul un transfert bancaire ou l’encaissement d’un chèque.',
    ];
    for (const invoice of allocations.slice(0, 50))
      lines.push(
        `Facture ${display(invoice.number)} : affectation ${invoice.allocated_amount} TND; solde actuel ${invoice.outstanding_amount} TND. ${this.cite(citations, dossierId, invoice.id, `Facture ${invoice.number}`)}`,
      );
    if (allocations.length > 50)
      lines.push('Affichage limité à 50 affectations.');
    return { answer: lines.join('\n'), citations };
  }

  private async summary(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number | null,
  ): Promise<LiveFinancialAnswer> {
    if (!year)
      return this.clarify(
        'Pour quel exercice annuel souhaitez-vous le résumé financier ? Par exemple : « Résumé financier pour 2026 ».',
      );
    const report = await this.statements.getReport(
      organizationId,
      dossierId,
      year,
      userId,
    );
    const citations: Citation[] = [];
    const source = this.cite(
      citations,
      dossierId,
      report.snapshot?.id ?? `${dossierId}:${year}`,
      `États financiers ${year}`,
      'FINANCIAL_REPORT',
      year,
    );
    const currency = report.currencyCode;
    const lines = [
      `Résumé comptable de « ${display(report.dossier.legalName)} » pour l’exercice ${year} (${report.period.startsOn} au ${report.period.endsOn}). ${source}`,
      `Source : ${report.source === 'SNAPSHOT_DEFINITIF' ? `états finalisés, version ${report.snapshot?.version ?? '?'}, le ${report.snapshot?.finalizedAtUtc ?? '?'}` : `états en temps réel générés le ${report.generatedAtUtc}, à partir des écritures comptabilisées`}. ${source}`,
      `Résultat d’exploitation : ${report.incomeStatement.operatingResult.current} ${currency}; résultat avant impôt : ${report.incomeStatement.ordinaryResultBeforeTax.current} ${currency}; résultat net : ${report.incomeStatement.netResult.current} ${currency}. ${source}`,
      `Total actif : ${report.balanceSheet.totalAssets.current} ${currency}; capitaux propres et passifs : ${report.balanceSheet.totalEquityAndLiabilities.current} ${currency}. ${source}`,
      `Trésorerie comptable de clôture : ${report.cashFlowStatement.closingCash.current} ${currency}; variation : ${report.cashFlowStatement.cashVariation.current} ${currency}. Ce n’est pas un solde bancaire vérifié en direct. ${source}`,
      'Produits/charges du compte de résultat :',
      ...report.incomeStatement.lines
        .filter((line) => line.current !== '0.000')
        .map(
          (line) => `${line.label} : ${line.current} ${currency}. ${source}`,
        ),
    ];
    const anomalies = report.controls.filter(
      (control) => control.status === 'ANOMALIE',
    );
    for (const anomaly of anomalies)
      lines.push(
        `Contrôle à vérifier : ${display(anomaly.label)} — ${display(anomaly.message)}. ${source}`,
      );
    if (report.mappingWarnings.length)
      lines.push(
        `${report.mappingWarnings.length} compte(s) avec correspondance manquante : le résumé peut être incomplet. Vérifiez les mappings dans les états financiers. ${source}`,
      );
    lines.push(
      'Ces chiffres représentent les données enregistrées/finalisées, pas une certification de complétude ni un conseil fiscal. Un exercice vide peut afficher zéro.',
    );
    return { answer: lines.join('\n'), citations };
  }
}
