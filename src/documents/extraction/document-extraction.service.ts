import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { hostname } from 'node:os';
import { IsNull, Repository } from 'typeorm';
import {
  AccountingDocument,
  AuditLog,
  DocumentExtractionJob,
  DocumentExtractionJobStatus,
  DocumentCategory,
  DocumentProcessingStatus,
  ExtractionStatus,
  MalwareScanStatus,
} from '../../database/entities';
import { DossiersService } from '../../dossiers/dossiers.service';
import {
  DOCUMENT_OBJECT_STORAGE,
  type DocumentObjectStorage,
} from '../object-storage/object-storage';
import {
  ExtractionReviewDecision,
  ReviewExtractionDto,
} from './extraction.dto';
import { InvoiceExtractionValidator } from './invoice-extraction.validator';
import type {
  DocumentExtractionClient,
  FinancialDocumentKind,
} from './document-extraction-client';
import {
  DocumentExtractionProviderService,
  EXTRACTABLE_DOCUMENT_CATEGORIES,
} from './document-extraction-provider.service';
import { BankReconciliationService } from '../../bank-reconciliation/bank-reconciliation.service';
import {
  PaddleOcrClientService,
  parsePaddleOcrResponse,
} from './paddle-ocr-client.service';
import { attachOcrEvidence, type OcrDocument } from './ocr-evidence-matcher';
import { mergeExtractionBatches } from './extraction-json';

@Injectable()
export class DocumentExtractionService implements OnModuleDestroy {
  private readonly logger = new Logger(DocumentExtractionService.name);
  private readonly workerId = `${hostname()}:${process.pid}:${crypto.randomUUID()}`;
  private running = false;
  private destroyed = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(AccountingDocument)
    private readonly documents: Repository<AccountingDocument>,
    @InjectRepository(DocumentExtractionJob)
    private readonly jobs: Repository<DocumentExtractionJob>,
    @InjectRepository(AuditLog)
    private readonly audits: Repository<AuditLog>,
    @Inject(DOCUMENT_OBJECT_STORAGE)
    private readonly objectStorage: DocumentObjectStorage,
    private readonly dossiers: DossiersService,
    private readonly providers: DocumentExtractionProviderService,
    private readonly paddleOcr: PaddleOcrClientService,
    private readonly bankReconciliation: BankReconciliationService,
  ) {}

  onModuleDestroy() {
    this.destroyed = true;
  }

  async request(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
    category?: DocumentCategory,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const document = await this.findDocument(
      organizationId,
      dossierId,
      documentId,
    );
    if (
      category &&
      document.category !== DocumentCategory.Inbox &&
      category !== document.category
    )
      throw new BadRequestException(
        'Seules les pièces de la boîte de réception peuvent être classées au démarrage de la lecture IA.',
      );
    const extractionCategory = category ?? document.category;
    this.providers.select(extractionCategory);
    if (
      document.category === DocumentCategory.Bank &&
      document.extractionStatus === ExtractionStatus.Validated
    )
      throw new BadRequestException(
        'Ce relevé a déjà été importé. Consultez l’original et les résultats dans Banque.',
      );
    if (document.malwareScanStatus !== MalwareScanStatus.Clean) {
      throw new BadRequestException(
        'Le document doit être validé par l’antivirus avant extraction.',
      );
    }
    if (
      !['image/jpeg', 'image/png', 'application/pdf'].includes(
        document.mimeType,
      )
    ) {
      throw new BadRequestException(
        'L’extraction automatique accepte les documents PDF, JPEG et PNG.',
      );
    }

    const job = await this.jobs.manager.transaction(async (manager) => {
      const repository = manager.getRepository(DocumentExtractionJob);
      let item = await repository.findOne({
        where: { documentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        item = repository.create({
          organizationId,
          dossierId,
          documentId,
        });
      }
      const previousValidationIssues = Array.isArray(item.validationIssues)
        ? item.validationIssues
        : [];
      Object.assign(item, {
        status: DocumentExtractionJobStatus.Queued,
        attemptCount: 0,
        availableAtUtc: new Date(),
        leaseExpiresAtUtc: null,
        workerId: null,
        lastError: null,
        processedAtUtc: null,
        reviewedAtUtc: null,
        reviewedByUserId: null,
        reviewComment: null,
        modelName: null,
        rawResponse: null,
        normalizedData: null,
        validationIssues: previousValidationIssues,
      });
      document.extractionStatus = ExtractionStatus.Pending;
      document.category = extractionCategory;
      document.extractedData = null;
      await manager.getRepository(AccountingDocument).save(document);
      return repository.save(item);
    });
    await this.audit(
      organizationId,
      userId,
      'document.extraction.queued',
      documentId,
      { dossierId, jobId: job.id },
    );
    return this.response(job);
  }

  async get(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const document = await this.findDocument(
      organizationId,
      dossierId,
      documentId,
    );
    const job = await this.jobs.findOneBy({
      organizationId,
      dossierId,
      documentId,
    });
    if (!job)
      throw new NotFoundException(
        'Aucune extraction n’a été demandée pour ce document.',
      );
    return {
      ...this.response(job),
      document: {
        id: document.id,
        originalName: document.originalName,
        mimeType: document.mimeType,
        category: document.category,
        createdAtUtc: document.createdAtUtc,
      },
    };
  }

  async reviewQueue(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const jobs = await this.jobs.find({
      where: {
        organizationId,
        dossierId,
        status: DocumentExtractionJobStatus.ReviewRequired,
        document: {
          deletedAtUtc: IsNull(),
          extractionStatus: ExtractionStatus.ReviewRequired,
        },
      },
      relations: { document: true },
      order: { processedAtUtc: 'ASC' },
      take: 100,
    });
    return jobs.map((job) => ({
      ...this.response(job),
      document: {
        id: job.document.id,
        originalName: job.document.originalName,
        mimeType: job.document.mimeType,
        category: job.document.category,
        createdAtUtc: job.document.createdAtUtc,
      },
    }));
  }

  async review(
    organizationId: string,
    dossierId: string,
    documentId: string,
    userId: string,
    dto: ReviewExtractionDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const document = await this.findDocument(
      organizationId,
      dossierId,
      documentId,
    );
    const job = await this.jobs.findOneBy({
      organizationId,
      dossierId,
      documentId,
    });
    if (!job || job.status !== DocumentExtractionJobStatus.ReviewRequired) {
      throw new BadRequestException(
        'Cette extraction n’est pas en attente de revue.',
      );
    }
    if (dto.decision === ExtractionReviewDecision.Approve) {
      const accepted = dto.correctedData ?? job.normalizedData;
      if (!accepted)
        throw new BadRequestException(
          'Aucune donnée extraite ne peut être approuvée.',
        );
      const validation = new InvoiceExtractionValidator().validate(accepted);
      if (
        validation.issues.some((issue) =>
          ['DOCUMENT_TYPE_MISSING', 'DOCUMENT_TYPE_INVALID'].includes(
            issue.code,
          ),
        )
      ) {
        throw new BadRequestException(
          'Choisissez un seul type de document reconnu avant approbation.',
        );
      }
      const blockingIssues = validation.issues.filter(
        (issue) => issue.severity === 'ERROR',
      );
      if (blockingIssues.length && !dto.forceApprove) {
        throw new BadRequestException(
          'Corrigez les incohérences bloquantes avant approbation.',
        );
      }
      if (validation.normalizedData.document_type === 'bank_statement') {
        if (!dto.bankAccountId)
          throw new BadRequestException(
            'Sélectionnez le compte bancaire avant d’approuver le relevé.',
          );
        await this.bankReconciliation.importExtractedStatement(
          organizationId,
          dossierId,
          userId,
          dto.bankAccountId,
          document.originalName,
          validation.normalizedData,
          document.id,
        );
        document.category = DocumentCategory.Bank;
        document.processingStatus = DocumentProcessingStatus.Processed;
      }
      job.status = DocumentExtractionJobStatus.Approved;
      job.normalizedData = validation.normalizedData;
      job.validationIssues = validation.issues;
      document.extractionStatus = ExtractionStatus.Validated;
      document.extractedData = validation.normalizedData;
    } else {
      job.status = DocumentExtractionJobStatus.Rejected;
      document.extractionStatus = ExtractionStatus.Rejected;
    }
    job.reviewedAtUtc = new Date();
    job.reviewedByUserId = userId;
    job.reviewComment = dto.comment?.trim() || null;
    await this.jobs.manager.transaction(async (manager) => {
      await manager.getRepository(DocumentExtractionJob).save(job);
      await manager.getRepository(AccountingDocument).save(document);
    });
    await this.audit(
      organizationId,
      userId,
      `document.extraction.${dto.decision === ExtractionReviewDecision.Approve ? 'approved' : 'rejected'}`,
      documentId,
      {
        dossierId,
        jobId: job.id,
        corrected: Boolean(dto.correctedData),
        forcedApproval:
          dto.decision === ExtractionReviewDecision.Approve &&
          dto.forceApprove === true &&
          job.validationIssues.some((issue) => issue.severity === 'ERROR'),
        remainingErrorCount: job.validationIssues.filter(
          (issue) => issue.severity === 'ERROR',
        ).length,
      },
    );
    return this.response(job);
  }

  @Interval(10_000)
  async work() {
    if (this.destroyed || this.running || !this.enabled()) return;
    this.running = true;
    try {
      await this.autoQueueEligibleDocuments();
      const configuredConcurrency = Number(
        this.config.get('DOCUMENT_EXTRACTION_WORKER_CONCURRENCY', 4),
      );
      const concurrency = Number.isFinite(configuredConcurrency)
        ? Math.min(32, Math.max(1, Math.floor(configuredConcurrency)))
        : 4;
      const claimed: DocumentExtractionJob[] = [];
      for (let processed = 0; processed < concurrency; processed += 1) {
        const job = await this.claim();
        if (!job) break;
        claimed.push(job);
      }
      await Promise.allSettled(claimed.map((job) => this.process(job)));
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Extraction worker failed.',
      );
    } finally {
      this.running = false;
    }
  }

  private async claim(): Promise<DocumentExtractionJob | null> {
    const leaseMinutes = Math.max(
      5,
      Number(this.config.get('DOCUMENT_EXTRACTION_LEASE_MINUTES', 30)),
    );
    const result: unknown = await this.jobs.query(
      `WITH candidate AS (
         SELECT id FROM accounting.document_extraction_jobs
         WHERE ((status = $1 AND available_at_utc <= now())
           OR (status = $2 AND lease_expires_at_utc < now()))
         ORDER BY available_at_utc, created_at_utc
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE accounting.document_extraction_jobs job
       SET status = $2,
           attempt_count = job.attempt_count + 1,
           worker_id = $3,
           lease_expires_at_utc = now() + ($4 * interval '1 minute'),
           updated_at_utc = now()
       FROM candidate WHERE job.id = candidate.id
       RETURNING job.id`,
      [
        DocumentExtractionJobStatus.Queued,
        DocumentExtractionJobStatus.Processing,
        this.workerId,
        leaseMinutes,
      ],
    );
    const rows = postgresUpdateRows<{ id: string }>(result);
    return rows[0] ? this.jobs.findOneBy({ id: rows[0].id }) : null;
  }

  private async process(job: DocumentExtractionJob) {
    const document = await this.documents.findOneBy({
      id: job.documentId,
      deletedAtUtc: IsNull(),
    });
    if (!document)
      return this.fail(
        job,
        null,
        new Error('Document no longer exists.'),
        true,
      );
    try {
      // A legacy Qwen job is rerouted to NuExtract only for a supported category.
      // Completed historical results are never rewritten.
      const { client, documentKind } = this.providers.select(document.category);
      document.extractionStatus = ExtractionStatus.Processing;
      await this.documents.save(document);
      const file = await this.objectStorage.readObject(document.objectKey);
      const correctionIssues = Array.isArray(job.validationIssues)
        ? job.validationIssues
        : [];
      if (job.modelName !== client.modelName) {
        job.modelName = client.modelName;
        await this.jobs.save(job);
      }
      const [extracted, ocrDocument] =
        document.mimeType === 'application/pdf'
          ? await this.extractPdf(
              job,
              file,
              client,
              documentKind,
              correctionIssues,
            )
          : await this.extractImage(
              file,
              document.mimeType,
              document.id,
              client,
              documentKind,
              correctionIssues,
            );
      const extractionData = attachOcrEvidence(extracted.data, ocrDocument);
      const validation = new InvoiceExtractionValidator().validate(
        extractionData,
      );
      Object.assign(job, {
        status: DocumentExtractionJobStatus.ReviewRequired,
        modelName: extracted.modelName,
        rawResponse: {
          ...extracted.rawResponse,
          extractedData: structuredClone(extractionData),
          ocr: ocrDocument,
        },
        normalizedData: validation.normalizedData,
        validationIssues: validation.issues,
        lastError: null,
        leaseExpiresAtUtc: null,
        workerId: null,
        processedAtUtc: new Date(),
      });
      document.extractionStatus = ExtractionStatus.ReviewRequired;
      document.extractedData = validation.normalizedData;
      await this.jobs.manager.transaction(async (manager) => {
        await manager.getRepository(DocumentExtractionJob).save(job);
        await manager.getRepository(AccountingDocument).save(document);
      });
      await this.audit(
        job.organizationId,
        null,
        'document.extraction.review_required',
        document.id,
        {
          dossierId: job.dossierId,
          jobId: job.id,
          issueCount: validation.issues.length,
        },
      );
    } catch (error) {
      await this.fail(
        job,
        document,
        error,
        error instanceof BadRequestException,
      );
    }
  }

  private async fail(
    job: DocumentExtractionJob,
    document: AccountingDocument | null,
    error: unknown,
    permanent = false,
  ) {
    const maximum = Math.max(
      1,
      Number(this.config.get('DOCUMENT_EXTRACTION_MAX_ATTEMPTS', 4)),
    );
    const exhausted = permanent || job.attemptCount >= maximum;
    const delayMinutes = Math.min(60, 2 ** Math.max(0, job.attemptCount - 1));
    Object.assign(job, {
      status: exhausted
        ? DocumentExtractionJobStatus.Failed
        : DocumentExtractionJobStatus.Queued,
      availableAtUtc: new Date(Date.now() + delayMinutes * 60_000),
      leaseExpiresAtUtc: null,
      workerId: null,
      lastError: this.errorMessage(error),
    });
    if (document)
      document.extractionStatus = exhausted
        ? ExtractionStatus.Failed
        : ExtractionStatus.Pending;
    await this.jobs.manager.transaction(async (manager) => {
      await manager.getRepository(DocumentExtractionJob).save(job);
      if (document)
        await manager.getRepository(AccountingDocument).save(document);
    });
    await this.audit(
      job.organizationId,
      null,
      exhausted
        ? 'document.extraction.failed'
        : 'document.extraction.retry_scheduled',
      job.documentId,
      {
        dossierId: job.dossierId,
        jobId: job.id,
        attemptCount: job.attemptCount,
        nextAttemptAtUtc: exhausted ? null : job.availableAtUtc,
      },
    );
  }

  private findDocument(organizationId: string, dossierId: string, id: string) {
    return this.documents
      .findOneBy({ id, organizationId, dossierId, deletedAtUtc: IsNull() })
      .then((item) => {
        if (!item) throw new NotFoundException('Le document est introuvable.');
        return item;
      });
  }

  private response(job: DocumentExtractionJob) {
    // Present old pending enum-list responses using the current contract. Do not
    // mutate persisted data or rewrite approved/rejected extraction history on GET.
    const compatibilityValidation =
      job.status === DocumentExtractionJobStatus.ReviewRequired &&
      job.normalizedData &&
      Array.isArray(job.normalizedData.document_type)
        ? new InvoiceExtractionValidator().validate(job.normalizedData)
        : null;
    return {
      id: job.id,
      documentId: job.documentId,
      status: job.status,
      attemptCount: job.attemptCount,
      availableAtUtc: job.availableAtUtc,
      modelName: job.modelName,
      sourceData: this.sourceData(job),
      normalizedData:
        compatibilityValidation?.normalizedData ?? job.normalizedData,
      validationIssues: compatibilityValidation?.issues ?? job.validationIssues,
      lastError: job.lastError,
      processedAtUtc: job.processedAtUtc,
      reviewedAtUtc: job.reviewedAtUtc,
      reviewedByUserId: job.reviewedByUserId,
      reviewComment: job.reviewComment,
    };
  }

  private sourceData(job: DocumentExtractionJob) {
    const candidate = job.rawResponse?.extractedData;
    return candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate)
      ? candidate
      : job.normalizedData;
  }

  private enabled() {
    return this.config.get('DOCUMENT_EXTRACTION_ENABLED', 'false') === 'true';
  }

  private async autoQueueEligibleDocuments() {
    if (this.config.get('DOCUMENT_EXTRACTION_AUTO_QUEUE', 'true') !== 'true')
      return;
    const result: unknown = await this.jobs.query(
      `WITH candidates AS (
         SELECT document.id, document.organization_id, document.dossier_id
         FROM accounting.accounting_documents document
         LEFT JOIN accounting.document_extraction_jobs job
           ON job.document_id = document.id
         WHERE document.deleted_at_utc IS NULL
           AND document.malware_scan_status = $1
            AND document.extraction_status = $2
            AND document.extracted_data IS NULL
           AND document.mime_type IN ('image/jpeg', 'image/png', 'application/pdf')
           AND document.category IN ($5, $6, $7)
           AND job.id IS NULL
         ORDER BY document.created_at_utc
         LIMIT 50
       ), inserted AS (
         INSERT INTO accounting.document_extraction_jobs
           (organization_id, dossier_id, document_id, status, attempt_count, available_at_utc)
         SELECT organization_id, dossier_id, id, $3, 0, now()
         FROM candidates
         ON CONFLICT (document_id) DO NOTHING
         RETURNING document_id
       )
       UPDATE accounting.accounting_documents document
       SET extraction_status = $4, updated_at_utc = now()
       FROM inserted
       WHERE document.id = inserted.document_id
       RETURNING document.id AS "documentId"`,
      [
        MalwareScanStatus.Clean,
        ExtractionStatus.NotRequested,
        DocumentExtractionJobStatus.Queued,
        ExtractionStatus.Pending,
        ...EXTRACTABLE_DOCUMENT_CATEGORIES,
      ],
    );
    const rows = postgresUpdateRows<{ documentId: string }>(result);
    if (rows.length)
      this.logger.log(
        `${rows.length} document(s) automatiquement ajouté(s) à la file d’extraction.`,
      );
  }

  private async extractPdf(
    job: DocumentExtractionJob,
    file: Buffer,
    client: DocumentExtractionClient,
    documentKind: FinancialDocumentKind,
    correctionIssues: Array<Record<string, unknown>>,
  ) {
    return Promise.all([
      this.extractPdfImages(file, client, documentKind, correctionIssues),
      this.mappingOcr(
        file,
        'application/pdf',
        job.documentId,
        this.cachedOcrDocument(job),
      ),
    ]);
  }

  private async extractPdfImages(
    file: Buffer,
    client: DocumentExtractionClient,
    documentKind: FinancialDocumentKind,
    correctionIssues: Array<Record<string, unknown>>,
  ) {
    if (!client.extractImages)
      throw new Error(
        'The extraction provider does not support PDF page images.',
      );
    const configured = Number(
      this.config.get('DOCUMENT_EXTRACTION_IMAGE_BATCH_PAGES', 2),
    );
    const batchSize = Number.isFinite(configured)
      ? Math.min(6, Math.max(1, Math.floor(configured)))
      : 2;
    const batches = [];
    let pageCount = 1;
    for (let startPage = 1; startPage <= pageCount; startPage += batchSize) {
      const rendered = await this.paddleOcr.renderPdf(
        file,
        startPage,
        batchSize,
      );
      if (
        rendered.pageCount > 100 ||
        (startPage > 1 && rendered.pageCount !== pageCount)
      )
        throw new Error(
          'PDF page count exceeds the limit or changed during rendering.',
        );
      pageCount = rendered.pageCount;
      batches.push(
        await client.extractImages(
          rendered.images,
          correctionIssues,
          documentKind,
        ),
      );
    }
    const data = mergeExtractionBatches(batches.map((batch) => batch.data));
    return {
      data,
      modelName: client.modelName,
      provider: client.provider,
      rawResponse: {
        inputMode: 'page_images',
        pageCount,
        batches: batches.map((batch) => batch.rawResponse),
        extractedData: structuredClone(data),
      },
    };
  }

  private async mappingOcr(
    file: Buffer,
    mimeType: string,
    documentId: string,
    cached: OcrDocument | null = null,
  ) {
    if (cached) return cached;
    return this.paddleOcr.extract(file, mimeType).catch((error: unknown) => {
      this.logger.warn(
        `PaddleOCR evidence unavailable for ${documentId}: ${this.errorMessage(error)}`,
      );
      return null;
    });
  }

  private cachedOcrDocument(job: DocumentExtractionJob) {
    const candidate = job.rawResponse?.ocr;
    if (!candidate) return null;
    try {
      return parsePaddleOcrResponse(candidate);
    } catch {
      return null;
    }
  }

  private async extractImage(
    file: Buffer,
    mimeType: string,
    documentId: string,
    client: DocumentExtractionClient,
    documentKind: FinancialDocumentKind,
    correctionIssues: Array<Record<string, unknown>>,
  ) {
    const ocrPromise = this.mappingOcr(file, mimeType, documentId);
    return Promise.all([
      client
        .extract(file, mimeType, correctionIssues, documentKind)
        .then((result) => ({
          ...result,
          rawResponse: { ...result.rawResponse, inputMode: 'image' },
        })),
      ocrPromise,
    ]);
  }

  private errorMessage(error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown extraction error.';
    return message
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .slice(0, 2000);
  }

  private audit(
    organizationId: string,
    actorUserId: string | null,
    action: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    return this.audits.save(
      this.audits.create({
        organizationId,
        actorUserId,
        action,
        entityType: 'AccountingDocument',
        entityId,
        detailsJson,
      }),
    );
  }
}

export function postgresUpdateRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  if (
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  )
    return result[0] as T[];
  return result as T[];
}
