import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  AccountingDocument,
  AuditLog,
  ClientDossier,
  FinancialStatementNoteDocument,
  FinancialStatementNoteSection,
  FinancialStatementNoteSet,
  FinancialStatementNotesStatus,
  FinancialStatementSnapshot,
  FinancialStatementSnapshotStatus,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  AttachFinancialStatementNoteDocumentDto,
  FinancialStatementNoteReviewDto,
  UpdateFinancialStatementNoteSectionDto,
} from './dto';
import {
  ALLOWED_FINANCIAL_STATEMENT_LINE_CODES,
  DEFAULT_FINANCIAL_NOTE_DEFINITIONS,
  FINANCIAL_NOTE_DEFINITION_BY_CODE,
  type FinancialNoteGenerator,
  type FinancialNoteTable,
  type FinancialStatementNotesReport,
} from './financial-statement-note-definitions';

@Injectable()
export class FinancialStatementNotesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FinancialStatementNoteSet)
    private readonly noteSets: Repository<FinancialStatementNoteSet>,
    @InjectRepository(FinancialStatementNoteSection)
    private readonly sections: Repository<FinancialStatementNoteSection>,
    @InjectRepository(FinancialStatementNoteDocument)
    private readonly noteDocuments: Repository<FinancialStatementNoteDocument>,
    @InjectRepository(AccountingDocument)
    private readonly documents: Repository<AccountingDocument>,
    @InjectRepository(FinancialStatementSnapshot)
    private readonly snapshots: Repository<FinancialStatementSnapshot>,
    @InjectRepository(AuditLog)
    private readonly audits: Repository<AuditLog>,
    private readonly dossiers: DossiersService,
  ) {}

  async generate(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
  ) {
    this.assertYear(periodYear);
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    await this.assertStatementsNotFinal(organizationId, dossierId, periodYear);
    let noteSet = await this.noteSets.findOneBy({
      organizationId,
      dossierId,
      periodYear,
    });
    if (noteSet?.status === FinancialStatementNotesStatus.Validated) {
      throw new ConflictException(
        'Les annexes validées doivent être rouvertes avant une nouvelle génération.',
      );
    }
    noteSet ??= await this.noteSets.save(
      this.noteSets.create({
        organizationId,
        dossierId,
        periodYear,
        status: FinancialStatementNotesStatus.Draft,
        reviewComment: null,
        createdByUserId: userId,
        submittedByUserId: null,
        submittedAtUtc: null,
        validatedByUserId: null,
        validatedAtUtc: null,
      }),
    );

    const range = this.fiscalRange(dossier, periodYear);
    const existing = await this.sections.findBy({ noteSetId: noteSet.id });
    const byCode = new Map(existing.map((section) => [section.code, section]));
    const automaticData = await Promise.all(
      DEFAULT_FINANCIAL_NOTE_DEFINITIONS.map((definition) =>
        this.generateTables(
          definition.generator,
          organizationId,
          dossierId,
          periodYear,
          range,
        ),
      ),
    );

    const savedSections: FinancialStatementNoteSection[] = [];
    for (
      let index = 0;
      index < DEFAULT_FINANCIAL_NOTE_DEFINITIONS.length;
      index += 1
    ) {
      const definition = DEFAULT_FINANCIAL_NOTE_DEFINITIONS[index];
      let section = byCode.get(definition.code);
      section ??= this.sections.create({
        organizationId,
        dossierId,
        noteSetId: noteSet.id,
        code: definition.code,
        noteNumber: definition.noteNumber,
        title: definition.title,
        source: definition.source,
        content: definition.defaultContent,
        statementLineCodes: definition.statementLineCodes,
        isRequired: definition.isRequired,
        displayOrder: definition.displayOrder,
        updatedByUserId: userId,
      });
      section.autoDataJson = automaticData[index] as unknown as Record<
        string,
        unknown
      >[];
      section.updatedByUserId = userId;
      savedSections.push(await this.sections.save(section));
    }
    noteSet.status = FinancialStatementNotesStatus.Draft;
    noteSet.reviewComment = null;
    await this.noteSets.save(noteSet);
    await this.audit(
      organizationId,
      userId,
      'financial_statement_notes.generated',
      noteSet.id,
      { dossierId, periodYear, sectionCount: savedSections.length },
    );
    return this.get(organizationId, dossierId, periodYear, userId);
  }

  async get(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
  ) {
    this.assertYear(periodYear);
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const noteSet = await this.findSet(organizationId, dossierId, periodYear);
    if (!noteSet) {
      throw new NotFoundException(
        'Les annexes de cet exercice ne sont pas encore générées.',
      );
    }
    return this.toReport(noteSet);
  }

  async getForReport(
    organizationId: string,
    dossierId: string,
    periodYear: number,
  ): Promise<FinancialStatementNotesReport | null> {
    const noteSet = await this.findSet(organizationId, dossierId, periodYear);
    return noteSet ? this.toReport(noteSet) : null;
  }

  async requireValidatedForFinalization(
    organizationId: string,
    dossierId: string,
    periodYear: number,
  ) {
    const noteSet = await this.findSet(organizationId, dossierId, periodYear);
    if (!noteSet) {
      throw new ConflictException(
        'Générez et validez les notes aux états financiers avant de figer les états.',
      );
    }
    if (noteSet.status !== FinancialStatementNotesStatus.Validated) {
      throw new ConflictException(
        'Les notes aux états financiers doivent être validées avant la validation définitive.',
      );
    }
    return this.toReport(noteSet);
  }

  async updateSection(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    sectionId: string,
    userId: string,
    dto: UpdateFinancialStatementNoteSectionDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.assertStatementsNotFinal(organizationId, dossierId, periodYear);
    const { noteSet, section } = await this.editableSection(
      organizationId,
      dossierId,
      periodYear,
      sectionId,
    );
    if (dto.statementLineCodes) {
      const uniqueCodes = [...new Set(dto.statementLineCodes)];
      const invalid = uniqueCodes.filter(
        (code) => !ALLOWED_FINANCIAL_STATEMENT_LINE_CODES.has(code),
      );
      if (invalid.length) {
        throw new BadRequestException(
          `Rubrique(s) d’état financier invalide(s) : ${invalid.join(', ')}.`,
        );
      }
      section.statementLineCodes = uniqueCodes;
    }
    if (dto.content !== undefined) section.content = dto.content.trim();
    section.updatedByUserId = userId;
    await this.sections.save(section);
    await this.resetToDraft(noteSet);
    await this.audit(
      organizationId,
      userId,
      'financial_statement_note.updated',
      section.id,
      { dossierId, periodYear, code: section.code },
    );
    return this.get(organizationId, dossierId, periodYear, userId);
  }

  async submit(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.assertStatementsNotFinal(organizationId, dossierId, periodYear);
    const noteSet = await this.requiredSet(
      organizationId,
      dossierId,
      periodYear,
    );
    if (noteSet.status === FinancialStatementNotesStatus.Validated) {
      throw new ConflictException('Ces annexes sont déjà validées.');
    }
    this.assertRequiredSections(noteSet.sections);
    noteSet.status = FinancialStatementNotesStatus.ReadyForReview;
    noteSet.reviewComment = null;
    noteSet.submittedByUserId = userId;
    noteSet.submittedAtUtc = new Date();
    await this.noteSets.save(noteSet);
    await this.audit(
      organizationId,
      userId,
      'financial_statement_notes.submitted',
      noteSet.id,
      { dossierId, periodYear },
    );
    return this.get(organizationId, dossierId, periodYear, userId);
  }

  async reject(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
    dto: FinancialStatementNoteReviewDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.assertStatementsNotFinal(organizationId, dossierId, periodYear);
    const noteSet = await this.requiredSet(
      organizationId,
      dossierId,
      periodYear,
    );
    if (noteSet.status !== FinancialStatementNotesStatus.ReadyForReview) {
      throw new ConflictException(
        'Seules des annexes envoyées en révision peuvent être rejetées.',
      );
    }
    noteSet.status = FinancialStatementNotesStatus.Draft;
    noteSet.reviewComment = dto.comment.trim();
    noteSet.validatedByUserId = null;
    noteSet.validatedAtUtc = null;
    await this.noteSets.save(noteSet);
    await this.audit(
      organizationId,
      userId,
      'financial_statement_notes.rejected',
      noteSet.id,
      { dossierId, periodYear, comment: noteSet.reviewComment },
    );
    return this.get(organizationId, dossierId, periodYear, userId);
  }

  async validate(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.assertStatementsNotFinal(organizationId, dossierId, periodYear);
    const noteSet = await this.requiredSet(
      organizationId,
      dossierId,
      periodYear,
    );
    if (noteSet.status !== FinancialStatementNotesStatus.ReadyForReview) {
      throw new ConflictException(
        'Envoyez d’abord les annexes en révision avant de les valider.',
      );
    }
    this.assertRequiredSections(noteSet.sections);
    noteSet.status = FinancialStatementNotesStatus.Validated;
    noteSet.reviewComment = null;
    noteSet.validatedByUserId = userId;
    noteSet.validatedAtUtc = new Date();
    await this.noteSets.save(noteSet);
    await this.audit(
      organizationId,
      userId,
      'financial_statement_notes.validated',
      noteSet.id,
      { dossierId, periodYear },
    );
    return this.get(organizationId, dossierId, periodYear, userId);
  }

  async reopen(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    userId: string,
    dto: FinancialStatementNoteReviewDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.assertStatementsNotFinal(organizationId, dossierId, periodYear);
    const noteSet = await this.requiredSet(
      organizationId,
      dossierId,
      periodYear,
    );
    if (noteSet.status !== FinancialStatementNotesStatus.Validated) {
      throw new ConflictException(
        'Seules des annexes validées peuvent être rouvertes.',
      );
    }
    noteSet.status = FinancialStatementNotesStatus.Draft;
    noteSet.reviewComment = dto.comment.trim();
    noteSet.validatedByUserId = null;
    noteSet.validatedAtUtc = null;
    await this.noteSets.save(noteSet);
    await this.audit(
      organizationId,
      userId,
      'financial_statement_notes.reopened',
      noteSet.id,
      { dossierId, periodYear, comment: noteSet.reviewComment },
    );
    return this.get(organizationId, dossierId, periodYear, userId);
  }

  async attachDocument(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    sectionId: string,
    userId: string,
    dto: AttachFinancialStatementNoteDocumentDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.assertStatementsNotFinal(organizationId, dossierId, periodYear);
    const { noteSet, section } = await this.editableSection(
      organizationId,
      dossierId,
      periodYear,
      sectionId,
    );
    const document = await this.documents.findOneBy({
      id: dto.documentId,
      organizationId,
      dossierId,
      deletedAtUtc: IsNull(),
    });
    if (!document) {
      throw new NotFoundException('Le document justificatif est introuvable.');
    }
    if (
      !(await this.noteDocuments.existsBy({
        sectionId,
        documentId: dto.documentId,
      }))
    ) {
      await this.noteDocuments.save(
        this.noteDocuments.create({
          organizationId,
          dossierId,
          sectionId,
          documentId: dto.documentId,
          attachedByUserId: userId,
        }),
      );
    }
    await this.resetToDraft(noteSet);
    await this.audit(
      organizationId,
      userId,
      'financial_statement_note.document_attached',
      section.id,
      { dossierId, periodYear, documentId: dto.documentId },
    );
    return this.get(organizationId, dossierId, periodYear, userId);
  }

  async detachDocument(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    sectionId: string,
    documentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    await this.assertStatementsNotFinal(organizationId, dossierId, periodYear);
    const { noteSet } = await this.editableSection(
      organizationId,
      dossierId,
      periodYear,
      sectionId,
    );
    const result = await this.noteDocuments.delete({ sectionId, documentId });
    if (!result.affected) {
      throw new NotFoundException('Ce document n’est pas lié à cette note.');
    }
    await this.resetToDraft(noteSet);
    await this.audit(
      organizationId,
      userId,
      'financial_statement_note.document_detached',
      sectionId,
      { dossierId, periodYear, documentId },
    );
    return this.get(organizationId, dossierId, periodYear, userId);
  }

  private async generateTables(
    generator: FinancialNoteGenerator,
    organizationId: string,
    dossierId: string,
    periodYear: number,
    range: { startsOn: string; endsOn: string },
  ): Promise<FinancialNoteTable[]> {
    if (!generator) return [];
    switch (generator) {
      case 'FIXED_ASSETS':
        return this.fixedAssetTables(organizationId, dossierId, range.endsOn);
      case 'CUSTOMERS':
        return this.thirdPartyTables(
          organizationId,
          dossierId,
          range.endsOn,
          'VENTE',
          'Créances clients à la clôture',
        );
      case 'SUPPLIERS':
        return this.thirdPartyTables(
          organizationId,
          dossierId,
          range.endsOn,
          'ACHAT',
          'Dettes fournisseurs à la clôture',
        );
      case 'TAXES':
        return this.taxTables(organizationId, dossierId, periodYear);
      case 'PAYROLL':
        return this.payrollTables(organizationId, dossierId, periodYear);
      case 'PROVISIONS':
        return this.provisionTables(organizationId, dossierId, range.endsOn);
    }
  }

  private async fixedAssetTables(
    organizationId: string,
    dossierId: string,
    endsOn: string,
  ): Promise<FinancialNoteTable[]> {
    const rows = await this.dataSource.query<
      Array<{
        category: string;
        asset_count: string;
        acquisition_cost: string;
        accumulated_depreciation: string;
        net_book_value: string;
      }>
    >(
      `SELECT c.name AS category,
              COUNT(a.id)::text AS asset_count,
              COALESCE(SUM(a.acquisition_cost),0)::text AS acquisition_cost,
              COALESCE(SUM(COALESCE(p.accumulated_accounting,a.opening_accounting_depreciation)),0)::text AS accumulated_depreciation,
              COALESCE(SUM(COALESCE(p.net_book_value,a.acquisition_cost-a.opening_accounting_depreciation)),0)::text AS net_book_value
       FROM accounting.fixed_assets a
       JOIN accounting.fixed_asset_categories c ON c.id=a.category_id
       LEFT JOIN LATERAL (
         SELECT d.accumulated_accounting,d.net_book_value
         FROM accounting.asset_depreciation_periods d
         WHERE d.asset_id=a.id AND d.period_end <= $3 AND d.status='COMPTABILISEE'
         ORDER BY d.period_end DESC LIMIT 1
       ) p ON true
       WHERE a.organization_id=$1 AND a.dossier_id=$2
         AND a.acquisition_date <= $3
         AND (a.disposal_date IS NULL OR a.disposal_date > $3)
       GROUP BY c.code,c.name ORDER BY c.code`,
      [organizationId, dossierId, endsOn],
    );
    return [
      {
        title: 'Situation des immobilisations à la clôture',
        columns: [
          { key: 'category', label: 'Catégorie', type: 'TEXT' },
          { key: 'assetCount', label: 'Nombre', type: 'NUMBER' },
          { key: 'acquisitionCost', label: 'Coût brut', type: 'MONEY' },
          {
            key: 'accumulatedDepreciation',
            label: 'Amortissements cumulés',
            type: 'MONEY',
          },
          { key: 'netBookValue', label: 'Valeur nette', type: 'MONEY' },
        ],
        rows: rows.map((row) => ({
          category: row.category,
          assetCount: Number(row.asset_count),
          acquisitionCost: Number(row.acquisition_cost),
          accumulatedDepreciation: Number(row.accumulated_depreciation),
          netBookValue: Number(row.net_book_value),
        })),
        emptyMessage: 'Aucune immobilisation enregistrée pour cet exercice.',
      },
    ];
  }

  private async thirdPartyTables(
    organizationId: string,
    dossierId: string,
    endsOn: string,
    invoiceType: 'VENTE' | 'ACHAT',
    title: string,
  ): Promise<FinancialNoteTable[]> {
    const rows = await this.dataSource.query<
      Array<{
        third_party_name: string;
        balance: string;
        not_due: string;
        overdue_30: string;
        overdue_90: string;
        overdue_more: string;
      }>
    >(
      `SELECT i.third_party_name,
              COALESCE(SUM(CASE WHEN i.kind='AVOIR' THEN -i.outstanding_amount ELSE i.outstanding_amount END),0)::text AS balance,
              COALESCE(SUM(CASE WHEN COALESCE(i.due_date,i.invoice_date) > $3 THEN i.outstanding_amount ELSE 0 END),0)::text AS not_due,
              COALESCE(SUM(CASE WHEN $3::date-COALESCE(i.due_date,i.invoice_date) BETWEEN 0 AND 30 THEN i.outstanding_amount ELSE 0 END),0)::text AS overdue_30,
              COALESCE(SUM(CASE WHEN $3::date-COALESCE(i.due_date,i.invoice_date) BETWEEN 31 AND 90 THEN i.outstanding_amount ELSE 0 END),0)::text AS overdue_90,
              COALESCE(SUM(CASE WHEN $3::date-COALESCE(i.due_date,i.invoice_date) > 90 THEN i.outstanding_amount ELSE 0 END),0)::text AS overdue_more
       FROM accounting.business_invoices i
       WHERE i.organization_id=$1 AND i.dossier_id=$2 AND i.type=$4
         AND i.invoice_date <= $3 AND i.status IN ('VALIDEE','COMPTABILISEE')
         AND i.outstanding_amount <> 0
       GROUP BY i.third_party_name
       ORDER BY ABS(SUM(CASE WHEN i.kind='AVOIR' THEN -i.outstanding_amount ELSE i.outstanding_amount END)) DESC
       LIMIT 25`,
      [organizationId, dossierId, endsOn, invoiceType],
    );
    return [
      {
        title,
        columns: [
          { key: 'thirdPartyName', label: 'Tiers', type: 'TEXT' },
          { key: 'balance', label: 'Solde', type: 'MONEY' },
          { key: 'notDue', label: 'Non échu', type: 'MONEY' },
          { key: 'overdue30', label: 'Échu 0-30 j', type: 'MONEY' },
          { key: 'overdue90', label: 'Échu 31-90 j', type: 'MONEY' },
          { key: 'overdueMore', label: 'Échu > 90 j', type: 'MONEY' },
        ],
        rows: rows.map((row) => ({
          thirdPartyName: row.third_party_name,
          balance: Number(row.balance),
          notDue: Number(row.not_due),
          overdue30: Number(row.overdue_30),
          overdue90: Number(row.overdue_90),
          overdueMore: Number(row.overdue_more),
        })),
        emptyMessage: 'Aucun solde de tiers significatif à la clôture.',
      },
    ];
  }

  private async taxTables(
    organizationId: string,
    dossierId: string,
    periodYear: number,
  ): Promise<FinancialNoteTable[]> {
    const rows = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT period_month::text,
              vat_collected::text,vat_deductible::text,vat_due::text,
              withholding_tax::text,tfp_due::text,foprolos_due::text,
              tcl_due::text,total_due::text
       FROM accounting.monthly_tax_declarations
       WHERE organization_id=$1 AND dossier_id=$2 AND period_year=$3
       ORDER BY period_month`,
      [organizationId, dossierId, periodYear],
    );
    return [
      {
        title: 'Déclarations fiscales mensuelles',
        columns: [
          { key: 'month', label: 'Mois', type: 'NUMBER' },
          { key: 'vatCollected', label: 'TVA collectée', type: 'MONEY' },
          { key: 'vatDeductible', label: 'TVA déductible', type: 'MONEY' },
          { key: 'vatDue', label: 'TVA due', type: 'MONEY' },
          { key: 'withholdingTax', label: 'Retenues', type: 'MONEY' },
          { key: 'otherTaxes', label: 'TFP/FOPROLOS/TCL', type: 'MONEY' },
          { key: 'totalDue', label: 'Total dû', type: 'MONEY' },
        ],
        rows: rows.map((row) => ({
          month: Number(row.period_month),
          vatCollected: Number(row.vat_collected),
          vatDeductible: Number(row.vat_deductible),
          vatDue: Number(row.vat_due),
          withholdingTax: Number(row.withholding_tax),
          otherTaxes:
            Number(row.tfp_due) +
            Number(row.foprolos_due) +
            Number(row.tcl_due),
          totalDue: Number(row.total_due),
        })),
        emptyMessage: 'Aucune déclaration mensuelle enregistrée.',
      },
    ];
  }

  private async payrollTables(
    organizationId: string,
    dossierId: string,
    periodYear: number,
  ): Promise<FinancialNoteTable[]> {
    const rows = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT period_month::text,total_gross::text,total_net::text,total_employer_cost::text,status
       FROM accounting.payroll_runs
       WHERE organization_id=$1 AND dossier_id=$2 AND period_year=$3
       ORDER BY period_month`,
      [organizationId, dossierId, periodYear],
    );
    return [
      {
        title: 'Synthèse annuelle de la paie',
        columns: [
          { key: 'month', label: 'Mois', type: 'NUMBER' },
          { key: 'gross', label: 'Brut', type: 'MONEY' },
          { key: 'net', label: 'Net', type: 'MONEY' },
          { key: 'employerCost', label: 'Coût employeur', type: 'MONEY' },
          { key: 'status', label: 'Statut', type: 'TEXT' },
        ],
        rows: rows.map((row) => ({
          month: Number(row.period_month),
          gross: Number(row.total_gross),
          net: Number(row.total_net),
          employerCost: Number(row.total_employer_cost),
          status: row.status,
        })),
        emptyMessage: 'Aucun traitement de paie enregistré.',
      },
    ];
  }

  private async provisionTables(
    organizationId: string,
    dossierId: string,
    endsOn: string,
  ): Promise<FinancialNoteTable[]> {
    const rows = await this.dataSource.query<
      Array<{ code: string; name: string; balance: string }>
    >(
      `SELECT a.code,a.name,COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.credit-l.debit ELSE 0 END),0)::text AS balance
       FROM accounting.financial_statement_mappings m
       JOIN accounting.ledger_accounts a ON a.id=m.account_id
       LEFT JOIN accounting.journal_entry_lines l ON l.account_id=a.id
       LEFT JOIN accounting.journal_entries e ON e.id=l.entry_id
         AND e.dossier_id=$2 AND e.entry_date <= $3 AND e.status='COMPTABILISEE'
       WHERE m.organization_id=$1 AND m.dossier_id=$2
         AND m.statement_section='BILAN_PROVISIONS'
       GROUP BY a.code,a.name ORDER BY a.code`,
      [organizationId, dossierId, endsOn],
    );
    return [
      {
        title: 'Solde des comptes de provisions',
        columns: [
          { key: 'code', label: 'Compte', type: 'TEXT' },
          { key: 'name', label: 'Intitulé', type: 'TEXT' },
          { key: 'balance', label: 'Solde à la clôture', type: 'MONEY' },
        ],
        rows: rows.map((row) => ({
          code: row.code,
          name: row.name,
          balance: Number(row.balance),
        })),
        emptyMessage: 'Aucun compte de provisions mappé.',
      },
    ];
  }

  private async editableSection(
    organizationId: string,
    dossierId: string,
    periodYear: number,
    sectionId: string,
  ) {
    const noteSet = await this.requiredSet(
      organizationId,
      dossierId,
      periodYear,
    );
    if (noteSet.status === FinancialStatementNotesStatus.Validated) {
      throw new ConflictException(
        'Rouvrez les annexes validées avant de les modifier.',
      );
    }
    const section = noteSet.sections.find((item) => item.id === sectionId);
    if (!section) {
      throw new NotFoundException(
        'La note aux états financiers est introuvable.',
      );
    }
    return { noteSet, section };
  }

  private async requiredSet(
    organizationId: string,
    dossierId: string,
    periodYear: number,
  ) {
    const noteSet = await this.findSet(organizationId, dossierId, periodYear);
    if (!noteSet) {
      throw new NotFoundException(
        'Générez d’abord les notes aux états financiers.',
      );
    }
    return noteSet;
  }

  private async findSet(
    organizationId: string,
    dossierId: string,
    periodYear: number,
  ) {
    return this.noteSets.findOne({
      where: { organizationId, dossierId, periodYear },
      relations: {
        sections: { documents: { document: true } },
      },
    });
  }

  private toReport(
    noteSet: FinancialStatementNoteSet,
  ): FinancialStatementNotesReport {
    const sections = [...(noteSet.sections ?? [])]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((section) => ({
        id: section.id,
        code: section.code,
        noteNumber: section.noteNumber,
        title: section.title,
        source: section.source,
        content: section.content,
        autoData: section.autoDataJson as unknown as FinancialNoteTable[],
        statementLineCodes: section.statementLineCodes,
        isRequired: section.isRequired,
        displayOrder: section.displayOrder,
        documents: (section.documents ?? []).map((link) => ({
          id: link.id,
          documentId: link.documentId,
          originalName: link.document.originalName,
          mimeType: link.document.mimeType,
          version: link.document.version,
        })),
      }));
    return {
      id: noteSet.id,
      periodYear: noteSet.periodYear,
      status: noteSet.status,
      reviewComment: noteSet.reviewComment,
      submittedAtUtc: noteSet.submittedAtUtc?.toISOString() ?? null,
      validatedAtUtc: noteSet.validatedAtUtc?.toISOString() ?? null,
      sections,
    };
  }

  private assertRequiredSections(sections: FinancialStatementNoteSection[]) {
    const missing = sections.filter((section) => {
      if (!section.isRequired) return false;
      const definition = FINANCIAL_NOTE_DEFINITION_BY_CODE.get(section.code);
      const content = section.content.trim();
      return !content || content === definition?.defaultContent;
    });
    if (missing.length) {
      throw new ConflictException(
        `Complétez les notes obligatoires : ${missing.map((section) => `Note ${section.noteNumber} - ${section.title}`).join(', ')}.`,
      );
    }
  }

  private async resetToDraft(noteSet: FinancialStatementNoteSet) {
    noteSet.status = FinancialStatementNotesStatus.Draft;
    noteSet.submittedByUserId = null;
    noteSet.submittedAtUtc = null;
    noteSet.validatedByUserId = null;
    noteSet.validatedAtUtc = null;
    await this.noteSets.save(noteSet);
  }

  private async assertStatementsNotFinal(
    organizationId: string,
    dossierId: string,
    periodYear: number,
  ) {
    if (
      await this.snapshots.existsBy({
        organizationId,
        dossierId,
        periodYear,
        status: FinancialStatementSnapshotStatus.Final,
      })
    ) {
      throw new ConflictException(
        'Les états financiers définitifs sont déjà figés pour cet exercice.',
      );
    }
  }

  private fiscalRange(dossier: ClientDossier, periodYear: number) {
    const monthIndex = dossier.fiscalYearStartMonth - 1;
    const startDay = Math.min(
      dossier.fiscalYearStartDay,
      new Date(Date.UTC(periodYear, monthIndex + 1, 0)).getUTCDate(),
    );
    const start = new Date(Date.UTC(periodYear, monthIndex, startDay));
    const next = new Date(Date.UTC(periodYear + 1, monthIndex, startDay));
    next.setUTCDate(next.getUTCDate() - 1);
    return {
      startsOn: start.toISOString().slice(0, 10),
      endsOn: next.toISOString().slice(0, 10),
    };
  }

  private assertYear(year: number) {
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      throw new BadRequestException('L’année est invalide.');
    }
  }

  private audit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    return this.audits.save(
      this.audits.create({
        organizationId,
        actorUserId,
        action,
        entityType: 'FinancialStatementNotes',
        entityId,
        detailsJson,
      }),
    );
  }
}
