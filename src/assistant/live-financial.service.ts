import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrganizationMembership } from '../database/entities';
import { PermissionNames } from '../database/permissions';
import { DossiersService } from '../dossiers/dossiers.service';
import { FinancialStatementsService } from '../financial-statements/financial-statements.service';
import type { Citation } from './assistant.service';
import type { AnswerLanguage } from './assistant-language';
import type { LiveFinancialIntent } from './live-financial-intent';
import {
  LIVE_FINANCIAL_TEXT,
  type LiveFinancialText,
} from './live-financial-text';

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
  /**
   * The invoice number exists in no business invoice: the caller should
   * search the validated documents instead (an uploaded invoice that was
   * read and approved but never recorded as a business invoice).
   */
  searchDocuments?: boolean;
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
    language: AnswerLanguage = 'fr',
  ): Promise<LiveFinancialAnswer> {
    const t = LIVE_FINANCIAL_TEXT[language];
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
      throw new ForbiddenException(t.forbidden);
    }
    if (
      intent.unsupportedPeriod ||
      (intent.operation === 'BALANCES' && intent.year !== null)
    ) {
      return this.clarify(t.unsupportedPeriod);
    }
    if (intent.operation === 'BALANCES')
      return this.balances(organizationId, dossierId, intent, t);
    if (intent.operation === 'INVOICE_DETAILS')
      return this.details(organizationId, dossierId, intent, t);
    if (intent.operation === 'FINANCIAL_SUMMARY')
      return this.summary(organizationId, dossierId, userId, intent.year, t);
    return this.clarify(t.unknownRequest);
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
    t: LiveFinancialText,
  ): Promise<LiveFinancialAnswer> {
    const candidates = await this.findParty(organizationId, dossierId, intent);
    if (candidates && candidates.length !== 1) {
      return this.clarify(
        candidates.length
          ? t.severalParties(
              candidates
                .slice(0, 20)
                .map(
                  (row) =>
                    `${display(row.name)} (${row.type}, ${t.taxId} ${display(row.tax_identifier ?? t.notProvided)})`,
                )
                .join('; '),
            )
          : t.noParty(display(intent.partyName!)),
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
       ORDER BY i.due_date ASC NULLS LAST, i.invoice_date ASC, i.id LIMIT 31`,
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
      party ? t.partyBalances(party.name) : t.allBalances,
      'PARTY_BALANCE',
    );
    // Balances use canonical outstanding_amount. Never subtract payments or credit notes again.
    const totals = rows[0];
    const lines = [
      t.balancesHeader(
        party ? display(party.name) : null,
        new Date().toISOString(),
        source,
      ),
    ];
    if (intent.partyType !== 'CUSTOMER')
      lines.push(
        t.supplierLine(
          totals?.supplier_due ?? '0.000',
          totals?.supplier_refund ?? '0.000',
          source,
        ),
      );
    if (intent.partyType !== 'SUPPLIER')
      lines.push(
        t.customerLine(
          totals?.customer_due ?? '0.000',
          totals?.customer_refund ?? '0.000',
          source,
        ),
      );
    lines.push(t.balancesNote);
    if (party?.id) lines.push(t.partyScope);
    for (const row of rows.slice(0, 30)) {
      const citation = this.cite(
        citations,
        dossierId,
        row.id,
        t.invoice(row.number),
      );
      lines.push(
        t.balanceRow(
          display(row.number),
          display(row.third_party_name),
          row.type,
          row.outstanding_amount,
          row.due_date ?? t.notProvided,
          citation,
        ),
      );
    }
    if (Number(totals?.record_count ?? 0) > 30)
      lines.push(t.moreInvoices(totals.record_count, source));
    return { answer: lines.join('\n'), citations };
  }

  private async details(
    organizationId: string,
    dossierId: string,
    intent: LiveFinancialIntent,
    t: LiveFinancialText,
  ): Promise<LiveFinancialAnswer> {
    if (!intent.invoiceNumber && !intent.paymentReference)
      return this.clarify(t.askReference);
    if (intent.invoiceNumber && intent.paymentReference)
      return this.clarify(t.oneReference);
    if (intent.paymentReference)
      return this.paymentDetails(
        organizationId,
        dossierId,
        intent.paymentReference,
        t,
      );
    const invoices = await this.dataSource.query<InvoiceRow[]>(
      `SELECT i.*, i.invoice_date::text AS invoice_date, i.due_date::text AS due_date FROM accounting.business_invoices i WHERE organization_id=$1 AND dossier_id=$2
        AND UPPER(number)=UPPER($3) AND ($4='ANY' OR type=CASE WHEN $4='SUPPLIER' THEN 'ACHAT' ELSE 'VENTE' END)
      ORDER BY i.id LIMIT 3`,
      [organizationId, dossierId, intent.invoiceNumber, intent.partyType],
    );
    if (!invoices.length)
      return {
        ...this.clarify(t.noInvoice),
        searchDocuments: true,
      };
    if (invoices.length !== 1) return this.clarify(t.severalInvoices);
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
          AND original_invoice_id=$3 ORDER BY i.invoice_date, i.id LIMIT 51`,
        [organizationId, dossierId, invoice.id],
      ),
    ]);
    const citations: Citation[] = [];
    const source = this.cite(
      citations,
      dossierId,
      invoice.id,
      t.invoice(invoice.number),
    );
    const lines = [
      `${display(invoice.number)} — ${invoice.type} / ${invoice.kind} — ${invoice.status} — ${display(invoice.third_party_name)}. ${source}`,
      t.invoiceDates(
        invoice.invoice_date,
        invoice.due_date ?? t.notProvided,
        invoice.net_amount,
        invoice.vat_amount,
        invoice.gross_amount,
        invoice.net_payable,
        source,
      ),
      t.invoiceSettlement(
        invoice.paid_amount,
        invoice.credited_amount,
        invoice.outstanding_amount,
        source,
      ),
      t.invoiceNote,
    ];
    if (invoice.status !== 'COMPTABILISEE') lines.push(t.notPosted);
    for (const payment of payments.slice(0, 50))
      lines.push(
        this.paymentLine(
          payment,
          this.cite(
            citations,
            dossierId,
            payment.id,
            t.payment(payment.reference ?? payment.id),
            'PAYMENT',
          ),
          t,
        ),
      );
    for (const credit of credits.slice(0, 50))
      lines.push(
        t.creditLine(
          display(credit.number),
          credit.net_payable,
          credit.status,
          this.cite(
            citations,
            dossierId,
            credit.id,
            t.creditNote(credit.number),
          ),
        ),
      );
    if (!payments.length) lines.push(t.noPayment(source));
    if (payments.length > 50 || credits.length > 50)
      lines.push(t.historyLimited);
    return { answer: lines.join('\n'), citations };
  }

  private paymentLine(
    payment: PaymentRow,
    citation: string,
    t: LiveFinancialText,
  ): string {
    return t.paymentLine(
      display(payment.reference ?? payment.id),
      payment.payment_date,
      payment.direction,
      payment.method,
      payment.status,
      payment.amount,
      payment.allocated_amount,
      payment.instrument_status,
      payment.correction_type
        ? {
            type: payment.correction_type,
            date: payment.correction_date ?? '?',
            reason: display(payment.correction_reason ?? ''),
          }
        : null,
      citation,
    );
  }

  private async paymentDetails(
    organizationId: string,
    dossierId: string,
    reference: string,
    t: LiveFinancialText,
  ): Promise<LiveFinancialAnswer> {
    const payments = await this.dataSource.query<PaymentRow[]>(
      `SELECT p.*, p.payment_date::text AS payment_date, p.correction_date::text AS correction_date FROM accounting.third_party_payments p WHERE organization_id=$1 AND dossier_id=$2
       AND UPPER(reference)=UPPER($3) ORDER BY id LIMIT 3`,
      [organizationId, dossierId, reference],
    );
    if (payments.length !== 1)
      return this.clarify(
        payments.length ? t.severalPayments : t.noPaymentReference,
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
      t.payment(reference),
      'PAYMENT',
    );
    const lines = [this.paymentLine(payment, source, t), t.paymentNote];
    for (const invoice of allocations.slice(0, 50))
      lines.push(
        t.allocationLine(
          display(invoice.number),
          invoice.allocated_amount,
          invoice.outstanding_amount,
          this.cite(
            citations,
            dossierId,
            invoice.id,
            t.invoice(invoice.number),
          ),
        ),
      );
    if (allocations.length > 50) lines.push(t.allocationsLimited);
    return { answer: lines.join('\n'), citations };
  }

  private async summary(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number | null,
    t: LiveFinancialText,
  ): Promise<LiveFinancialAnswer> {
    if (!year) return this.clarify(t.askYear);
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
      t.statements(year),
      'FINANCIAL_REPORT',
      year,
    );
    const currency = report.currencyCode;
    const lines = [
      t.summaryHeader(
        display(report.dossier.legalName),
        year,
        report.period.startsOn,
        report.period.endsOn,
        source,
      ),
      t.summarySource(
        report.source === 'SNAPSHOT_DEFINITIF'
          ? t.summaryFinal(
              String(report.snapshot?.version ?? '?'),
              String(report.snapshot?.finalizedAtUtc ?? '?'),
            )
          : t.summaryLive(String(report.generatedAtUtc)),
        source,
      ),
      t.results(
        report.incomeStatement.operatingResult.current,
        report.incomeStatement.ordinaryResultBeforeTax.current,
        report.incomeStatement.netResult.current,
        currency,
        source,
      ),
      t.balanceSheet(
        report.balanceSheet.totalAssets.current,
        report.balanceSheet.totalEquityAndLiabilities.current,
        currency,
        source,
      ),
      t.cash(
        report.cashFlowStatement.closingCash.current,
        report.cashFlowStatement.cashVariation.current,
        currency,
        source,
      ),
      t.incomeLines,
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
        t.control(display(anomaly.label), display(anomaly.message), source),
      );
    if (report.mappingWarnings.length)
      lines.push(t.mappings(report.mappingWarnings.length, source));
    lines.push(t.summaryNote);
    return { answer: lines.join('\n'), citations };
  }
}
