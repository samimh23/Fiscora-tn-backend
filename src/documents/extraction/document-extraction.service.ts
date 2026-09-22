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
import { QwenExtractionClientService } from './qwen-extraction-client.service';
import { BankReconciliationService } from '../../bank-reconciliation/bank-reconciliation.service';
import { PaddleOcrClientService } from './paddle-ocr-client.service';
import { attachOcrEvidence } from './ocr-evidence-matcher';

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
    private readonly client: QwenExtractionClientService,
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
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const document = await this.findDocument(
      organizationId,
      dossierId,
      documentId,
    );
    if (document.malwareScanStatus !== MalwareScanStatus.Clean) {
      throw new BadRequestException(
        'Le document doit être validé par l’antivirus avant extraction.',
      );
    }
    if (!['image/jpeg', 'image/png'].includes(document.mimeType)) {
      throw new BadRequestException(
        'L’extraction automatique accepte actuellement les images JPEG et PNG. Convertissez chaque page PDF en image avant de la soumettre.',
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
    await this.findDocument(organizationId, dossierId, documentId);
    const job = await this.jobs.findOneBy({
      organizationId,
      dossierId,
      documentId,
    });
    if (!job)
      throw new NotFoundException(
        'Aucune extraction n’a été demandée pour ce document.',
      );
    return this.response(job);
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
        );
        document.category = DocumentCategory.Bank;
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
      for (let processed = 0; processed < 2; processed += 1) {
        const job = await this.claim();
        if (!job) break;
        await this.process(job);
      }
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
      Number(this.config.get('DOCUMENT_EXTRACTION_LEASE_MINUTES', 15)),
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
      document.extractionStatus = ExtractionStatus.Processing;
      await this.documents.save(document);
      const file = await this.objectStorage.readObject(document.objectKey);
      const ocrPromise = this.paddleOcr
        .extract(file, document.mimeType)
        .catch((error: unknown) => {
          this.logger.warn(
            `PaddleOCR evidence unavailable for ${document.id}: ${this.errorMessage(error)}`,
          );
          return null;
        });
      const [extracted, ocrDocument] = await Promise.all([
        this.client.extract(
          file,
          document.mimeType,
          Array.isArray(job.validationIssues) ? job.validationIssues : [],
        ),
        ocrPromise,
      ]);
      const extractionData = attachOcrEvidence(extracted.data, ocrDocument);
      const validation = new InvoiceExtractionValidator().validate(
        extractionData,
      );
      Object.assign(job, {
        status: DocumentExtractionJobStatus.ReviewRequired,
        modelName: this.client.modelName,
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
      await this.fail(job, document, error);
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
    return {
      id: job.id,
      documentId: job.documentId,
      status: job.status,
      attemptCount: job.attemptCount,
      availableAtUtc: job.availableAtUtc,
      modelName: job.modelName,
      sourceData: this.sourceData(job),
      normalizedData: job.normalizedData,
      validationIssues: job.validationIssues,
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
           AND document.mime_type IN ('image/jpeg', 'image/png')
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
      ],
    );
    const rows = postgresUpdateRows<{ documentId: string }>(result);
    if (rows.length)
      this.logger.log(
        `${rows.length} document(s) automatiquement ajouté(s) à la file d’extraction.`,
      );
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
