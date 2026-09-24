import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { hostname } from 'node:os';
import { DataSource } from 'typeorm';
import { AssistantService } from './assistant.service';

interface IndexingJob {
  id: string;
  organizationId: string;
  dossierId: string;
  documentId: string;
  operation: 'INDEX' | 'DELETE';
  attemptCount: number;
}

@Injectable()
export class AssistantIndexingService implements OnModuleDestroy {
  private readonly logger = new Logger(AssistantIndexingService.name);
  private readonly workerId = `${hostname()}:${process.pid}:${crypto.randomUUID()}`;
  private running = false;
  private destroyed = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly assistant: AssistantService,
  ) {}

  onModuleDestroy() {
    this.destroyed = true;
  }

  @Interval(10_000)
  async work() {
    if (this.destroyed || this.running || !this.enabled()) return;
    this.running = true;
    try {
      for (let processed = 0; processed < 3; processed += 1) {
        const job = await this.claim();
        if (!job) break;
        await this.process(job);
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'AI indexing worker failed.',
      );
    } finally {
      this.running = false;
    }
  }

  private async claim(): Promise<IndexingJob | null> {
    const leaseMinutes = Math.max(
      2,
      Number(this.config.get('AI_ASSISTANT_INDEX_LEASE_MINUTES', 10)),
    );
    const result: unknown = await this.dataSource.query(
      `WITH candidate AS (
         SELECT id FROM accounting.ai_indexing_jobs
         WHERE ((status = 'PENDING' AND available_at_utc <= now())
           OR (status = 'PROCESSING' AND lease_expires_at_utc < now()))
         ORDER BY available_at_utc, created_at_utc
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE accounting.ai_indexing_jobs job
       SET status = 'PROCESSING',
           attempt_count = job.attempt_count + 1,
           worker_id = $1,
           lease_expires_at_utc = now() + ($2 * interval '1 minute'),
           updated_at_utc = now()
       FROM candidate WHERE job.id = candidate.id
       RETURNING job.id,
         job.organization_id AS "organizationId",
         job.dossier_id AS "dossierId",
         job.document_id AS "documentId",
         job.operation,
         job.attempt_count AS "attemptCount"`,
      [this.workerId, leaseMinutes],
    );
    return this.rows<IndexingJob>(result)[0] ?? null;
  }

  private async process(job: IndexingJob) {
    try {
      if (job.operation === 'DELETE') {
        await this.assistant.removeDocumentFromIndex(
          job.organizationId,
          job.dossierId,
          job.documentId,
        );
      } else {
        await this.assistant.indexDocument(
          job.organizationId,
          job.dossierId,
          job.documentId,
        );
      }
      await this.dataSource.query(
        `UPDATE accounting.ai_indexing_jobs
         SET status = 'INDEXED', processed_at_utc = now(),
           lease_expires_at_utc = NULL, worker_id = NULL, last_error = NULL,
           updated_at_utc = now()
         WHERE id = $1 AND worker_id = $2`,
        [job.id, this.workerId],
      );
    } catch (error) {
      await this.fail(job, error);
    }
  }

  private async fail(job: IndexingJob, error: unknown) {
    const maximum = Math.max(
      1,
      Number(this.config.get('AI_ASSISTANT_INDEX_MAX_ATTEMPTS', 5)),
    );
    const exhausted = job.attemptCount >= maximum;
    const delayMinutes = Math.min(60, 2 ** Math.max(0, job.attemptCount - 1));
    const message = (
      error instanceof Error ? error.message : 'Unknown AI indexing error.'
    )
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .slice(0, 2000);
    await this.dataSource.query(
      `UPDATE accounting.ai_indexing_jobs
       SET status = $3,
         available_at_utc = now() + ($4 * interval '1 minute'),
         lease_expires_at_utc = NULL, worker_id = NULL, last_error = $5,
         updated_at_utc = now()
       WHERE id = $1 AND worker_id = $2`,
      [
        job.id,
        this.workerId,
        exhausted ? 'FAILED' : 'PENDING',
        delayMinutes,
        message,
      ],
    );
    this.logger.warn(
      `AI indexing ${exhausted ? 'failed' : 'retry scheduled'} for document ${job.documentId}: ${message}`,
    );
  }

  private enabled() {
    return (
      this.config.get('AI_ASSISTANT_ENABLED', 'false') === 'true' &&
      this.config.get('AI_ASSISTANT_AUTO_INDEX_ENABLED', 'true') === 'true'
    );
  }

  private rows<T>(result: unknown): T[] {
    if (!Array.isArray(result)) return [];
    if (
      result.length === 2 &&
      Array.isArray(result[0]) &&
      typeof result[1] === 'number'
    ) {
      return result[0] as T[];
    }
    return result as T[];
  }
}
