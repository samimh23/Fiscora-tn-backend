import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import archiver from 'archiver';
import type { DocumentObjectStorage } from '../documents/object-storage/object-storage';
import { DOCUMENT_OBJECT_STORAGE } from '../documents/object-storage/object-storage';
import { DossiersService } from '../dossiers/dossiers.service';
import { PaddleOcrClientService } from '../documents/extraction/paddle-ocr-client.service';
import {
  nuextractInstructions,
  templateFor,
} from '../documents/extraction/nuextract-extraction-client.service';
import { CreateTrainingExportDto, TrainingConsentDto } from './dto';
import {
  projectTrainingAnswer,
  sha256,
  TRAINING_SCHEMA_VERSION,
} from './training-dataset-format';

export const TRAINING_OBJECT_STORAGE = Symbol('TRAINING_OBJECT_STORAGE');

type Example = {
  id: string;
  organization_id: string;
  dossier_id: string;
  document_id: string;
  consent_revision: string;
  reviewed_at_utc: Date | string;
  reviewed_by_user_id: string;
  model_name: string;
  mime_type: string;
  object_key: string;
  object_prefix: string;
  document_kind: 'invoice' | 'bank_statement';
  normalized_data: Record<string, unknown>;
  expected_json: unknown;
  template_json: Record<string, unknown>;
  instructions: string;
  source_sha256: string;
  label_sha256: string;
};
type DatasetExport = {
  id: string;
  status: string;
  example_ids: string[];
  expires_at_utc: Date;
  object_key: string | null;
};

// Every read/export is re-scoped to a live authorization and current human approval.
const LIVE_EXAMPLES = `FROM accounting.training_dataset_examples e
  JOIN accounting.training_dataset_consents c ON c.dossier_id = e.dossier_id
    AND c.organization_id = e.organization_id AND c.enabled AND c.revision = e.consent_revision
  JOIN accounting.accounting_documents d ON d.id = e.document_id
    AND d.organization_id = e.organization_id AND d.dossier_id = e.dossier_id
    AND d.deleted_at_utc IS NULL AND d.malware_scan_status = 'SAIN' AND d.extraction_status = 'VALIDEE'
  JOIN accounting.document_extraction_jobs j ON j.document_id = e.document_id
    AND j.status = 'VALIDEE' AND j.reviewed_at_utc = e.reviewed_at_utc
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j.validation_issues) issue WHERE issue->>'severity' = 'ERROR')
  JOIN accounting.organizations o ON o.id = e.organization_id AND o.is_active`;

@Injectable()
export class TrainingDatasetsService {
  private readonly logger = new Logger(TrainingDatasetsService.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
    @Inject(DOCUMENT_OBJECT_STORAGE)
    private readonly source: DocumentObjectStorage,
    @Inject(TRAINING_OBJECT_STORAGE)
    private readonly storage: DocumentObjectStorage,
    private readonly dossiers: DossiersService,
    private readonly renderer: PaddleOcrClientService,
  ) {}

  private async owner(organizationId: string, userId: string) {
    const rows = await this.db.query<{ id: string }[]>(
      `SELECT m.id FROM accounting.organization_memberships m
      JOIN accounting.roles r ON r.id = m.role_id AND r.organization_id = m.organization_id AND r.is_system JOIN accounting.organizations o ON o.id = m.organization_id
      WHERE m.organization_id = $1 AND m.user_id = $2 AND m.is_active AND o.is_active AND r.name = 'Propriétaire'`,
      [organizationId, userId],
    );
    if (!rows.length)
      throw new ForbiddenException(
        'Seul le propriétaire du cabinet peut autoriser la collecte.',
      );
  }

  async consent(organizationId: string, dossierId: string, userId: string) {
    await this.owner(organizationId, userId);
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const [row] = await this.db.query<
      { enabled: boolean; authorizationReference: string; updatedAtUtc: Date }[]
    >(
      `SELECT enabled, authorization_reference AS "authorizationReference", updated_at_utc AS "updatedAtUtc"
       FROM accounting.training_dataset_consents WHERE organization_id = $1 AND dossier_id = $2`,
      [organizationId, dossierId],
    );
    return (
      row ?? { enabled: false, authorizationReference: '', updatedAtUtc: null }
    );
  }

  async updateConsent(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: TrainingConsentDto,
  ) {
    await this.owner(organizationId, userId);
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    if (dto.authorizationReference.trim().length < 8)
      throw new BadRequestException('Précisez la référence de l’autorisation.');
    await this.db.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO accounting.training_dataset_consents
        (dossier_id, organization_id, enabled, authorized_by_user_id, authorization_reference)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT(dossier_id) DO UPDATE SET enabled = EXCLUDED.enabled,
        revision = uuid_generate_v4(), authorized_by_user_id = EXCLUDED.authorized_by_user_id,
        authorization_reference = EXCLUDED.authorization_reference, updated_at_utc = now()`,
        [
          dossierId,
          organizationId,
          dto.enabled,
          userId,
          dto.authorizationReference.trim(),
        ],
      );
      await manager.query(
        `INSERT INTO accounting.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, details_json)
        VALUES ($1,$2,'training.consent.updated','ClientDossier',$3,$4)`,
        [
          organizationId,
          userId,
          dossierId,
          JSON.stringify({
            enabled: dto.enabled,
            authorizationReference: dto.authorizationReference.trim(),
          }),
        ],
      );
    });
    return this.consent(organizationId, dossierId, userId);
  }

  async overview() {
    const counts = await this.db.query<
      { kind: string; status: string; count: string }[]
    >(
      `SELECT e.document_kind AS kind, e.status, count(*)::text AS count ${LIVE_EXAMPLES} GROUP BY e.document_kind, e.status`,
    );
    const exports = await this.db.query<
      {
        id: string;
        status: string;
        sampleCount: number;
        sizeBytes: string | null;
        createdAtUtc: Date;
        expiresAtUtc: Date;
        errorCode: string | null;
      }[]
    >(`SELECT id, status, sample_count AS "sampleCount", size_bytes AS "sizeBytes",
      created_at_utc AS "createdAtUtc", expires_at_utc AS "expiresAtUtc", error_code AS "errorCode"
      FROM accounting.training_dataset_exports ORDER BY created_at_utc DESC LIMIT 20`);
    return { schemaVersion: TRAINING_SCHEMA_VERSION, counts, exports };
  }

  async createExport(userId: string, dto: CreateTrainingExportDto) {
    const examples = await this.db.query<{ id: string }[]>(
      `SELECT e.id ${LIVE_EXAMPLES}
      WHERE e.status = 'READY' AND ($1::text = 'all' OR e.document_kind = $1)
      AND ($2::uuid IS NULL OR e.organization_id = $2) ORDER BY e.created_at_utc, e.id LIMIT $3 OFFSET $4`,
      [
        dto.documentKind ?? 'all',
        dto.organizationId ?? null,
        dto.limit,
        dto.offset ?? 0,
      ],
    );
    if (!examples.length)
      throw new BadRequestException(
        'Aucun exemple autorisé et prêt à exporter.',
      );
    return this.db.transaction(async (manager) => {
      // Serialize requests so repeated clicks cannot enqueue concurrent heavyweight ZIP jobs.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('fiscora-training-export'))",
      );
      const busy = await manager.query<{ id: string }[]>(
        `SELECT id FROM accounting.training_dataset_exports WHERE status IN ('QUEUED','PROCESSING') LIMIT 1`,
      );
      if (busy.length)
        throw new ConflictException('Un export est déjà en préparation.');
      const [result] = await manager.query<{ id: string; status: string }[]>(
        `INSERT INTO accounting.training_dataset_exports
        (requested_by_user_id, example_ids, sample_count) VALUES ($1,$2,$3) RETURNING id,status`,
        [userId, examples.map((item) => item.id), examples.length],
      );
      await manager.query(
        `INSERT INTO accounting.audit_logs (actor_user_id,action,entity_type,entity_id,details_json)
        VALUES ($1,'training.dataset.export_requested','TrainingDatasetExport',$2,$3)`,
        [userId, result.id, JSON.stringify({ sampleCount: examples.length })],
      );
      return result;
    });
  }

  async download(userId: string, id: string) {
    const [item] = await this.db.query<DatasetExport[]>(
      `SELECT * FROM accounting.training_dataset_exports WHERE id = $1`,
      [id],
    );
    if (!item) throw new NotFoundException('Export introuvable.');
    if (
      item.status !== 'READY' ||
      item.expires_at_utc <= new Date() ||
      !item.object_key
    )
      throw new BadRequestException(
        'Cet export n’est pas disponible ou a expiré.',
      );
    const live = await this.liveByIds(item.example_ids);
    if (live.length !== item.example_ids.length)
      throw new ForbiddenException(
        'Une autorisation ou une validation a changé. Créez un nouvel export.',
      );
    const url = await this.storage.signedReadUrl(
      item.object_key,
      60,
      `fiscora-training-${id}.zip`,
    );
    await this.db.query(
      `INSERT INTO accounting.audit_logs (actor_user_id,action,entity_type,entity_id,details_json)
      VALUES ($1,'training.dataset.downloaded','TrainingDatasetExport',$2,$3)`,
      [userId, id, JSON.stringify({ sampleCount: live.length })],
    );
    return { url, expiresInSeconds: 60 };
  }

  private liveByIds(ids: string[]) {
    return this.db.query<Example[]>(
      `SELECT e.* ${LIVE_EXAMPLES} WHERE e.status = 'READY' AND e.id = ANY($1::uuid[]) ORDER BY e.id`,
      [ids],
    );
  }

  @Cron('*/30 * * * * *')
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.storage.ensureReady();
      await this.cleanup();
      await this.collect();
      const claimed = await this.db.query<
        DatasetExport[]
      >(`UPDATE accounting.training_dataset_exports SET status = 'PROCESSING',
        lease_expires_at_utc = now() + interval '20 minutes' WHERE id = (
        SELECT id FROM accounting.training_dataset_exports WHERE status = 'QUEUED' AND expires_at_utc > now()
        ORDER BY created_at_utc FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
      if (claimed[0]) await this.buildExport(claimed[0]);
    } catch {
      // Do not log document contents, authorization references, signed URLs or credentials.
      this.logger.warn(
        'Training dataset worker unavailable; check database/storage configuration.',
      );
    } finally {
      this.running = false;
    }
  }

  private async collect() {
    const candidates = await this.db.query<
      Example[]
    >(`SELECT j.document_id, j.organization_id, j.dossier_id, j.reviewed_at_utc::text AS reviewed_at_utc,
      j.reviewed_by_user_id, j.model_name, j.normalized_data, d.mime_type, d.object_key, c.revision AS consent_revision
      FROM accounting.document_extraction_jobs j
      JOIN accounting.accounting_documents d ON d.id = j.document_id AND d.organization_id = j.organization_id AND d.dossier_id = j.dossier_id
      JOIN accounting.training_dataset_consents c ON c.dossier_id = j.dossier_id AND c.organization_id = j.organization_id AND c.enabled
      JOIN accounting.organizations o ON o.id = j.organization_id AND o.is_active
      WHERE j.status = 'VALIDEE' AND j.reviewed_at_utc IS NOT NULL AND j.reviewed_by_user_id IS NOT NULL
      AND j.model_name ILIKE '%nuextract%' AND d.deleted_at_utc IS NULL AND d.malware_scan_status = 'SAIN'
      AND d.extraction_status = 'VALIDEE' AND d.mime_type IN ('application/pdf','image/jpeg','image/png')
      AND j.normalized_data->>'document_type' IN ('invoice','credit_note','receipt','bank_statement')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j.validation_issues) issue WHERE issue->>'severity' = 'ERROR')
      AND NOT EXISTS (SELECT 1 FROM accounting.training_dataset_examples e WHERE e.document_id = j.document_id
        AND e.reviewed_at_utc = j.reviewed_at_utc AND e.consent_revision = c.revision)
      ORDER BY j.reviewed_at_utc LIMIT 20`);
    for (const candidate of candidates) {
      const id = randomUUID();
      const kind =
        candidate.normalized_data.document_type === 'bank_statement'
          ? 'bank_statement'
          : 'invoice';
      const template = templateFor(kind);
      const answer = projectTrainingAnswer(candidate.normalized_data, template);
      const prefix = `examples/${id}`;
      const inserted = await this.db.query<{ id: string }[]>(
        `INSERT INTO accounting.training_dataset_examples
        (id,organization_id,dossier_id,document_id,consent_revision,reviewed_at_utc,reviewed_by_user_id,document_kind,
        model_name,mime_type,object_prefix,expected_json,template_json,instructions)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING RETURNING id`,
        [
          id,
          candidate.organization_id,
          candidate.dossier_id,
          candidate.document_id,
          candidate.consent_revision,
          candidate.reviewed_at_utc,
          candidate.reviewed_by_user_id,
          kind,
          candidate.model_name,
          candidate.mime_type,
          prefix,
          JSON.stringify(answer),
          JSON.stringify(template),
          nuextractInstructions(kind, []),
        ],
      );
      if (!inserted.length) continue;
      try {
        const content = await this.source.readObject(candidate.object_key);
        if (!content.length || content.length > 20 * 1024 * 1024)
          throw new Error('Source size invalid');
        const sourceHash = sha256(content);
        const labelHash = sha256(JSON.stringify(answer));
        const duplicate = await this.db.query<{ id: string }[]>(
          `SELECT id FROM accounting.training_dataset_examples
          WHERE organization_id = $1 AND source_sha256 = $2 AND label_sha256 = $3 AND status = 'READY' LIMIT 1`,
          [candidate.organization_id, sourceHash, labelHash],
        );
        if (duplicate.length) {
          await this.db.query(
            "UPDATE accounting.training_dataset_examples SET status = 'DUPLICATE' WHERE id = $1",
            [id],
          );
          continue;
        }
        await this.storage.putObject(
          `${prefix}/source`,
          content,
          candidate.mime_type,
        );
        await this.storage.putObject(
          `${prefix}/expected.json`,
          Buffer.from(JSON.stringify(answer)),
          'application/json',
        );
        await this.db.query(
          `UPDATE accounting.training_dataset_examples SET status = 'READY',source_sha256 = $2,label_sha256 = $3 WHERE id = $1`,
          [id, sourceHash, labelHash],
        );
      } catch {
        await this.db.query(
          "UPDATE accounting.training_dataset_examples SET status = 'FAILED',error_code = 'COLLECTION_FAILED' WHERE id = $1",
          [id],
        );
      }
    }
  }

  private async cleanup() {
    await this.db
      .query(`UPDATE accounting.training_dataset_exports SET status = 'FAILED',error_code = 'WORKER_INTERRUPTED'
      WHERE status = 'PROCESSING' AND lease_expires_at_utc < now()`);
    await this.db
      .query(`UPDATE accounting.training_dataset_examples SET status = 'FAILED',error_code = 'WORKER_INTERRUPTED'
      WHERE status = 'COLLECTING' AND created_at_utc < now() - interval '20 minutes'`);
    const stale = await this.db.query<
      { id: string; object_prefix: string }[]
    >(`SELECT e.id,e.object_prefix FROM accounting.training_dataset_examples e
      WHERE (NOT EXISTS (SELECT 1 FROM accounting.training_dataset_consents c WHERE c.dossier_id = e.dossier_id AND c.organization_id = e.organization_id AND c.enabled AND c.revision = e.consent_revision)
      OR NOT EXISTS (SELECT 1 FROM accounting.accounting_documents d JOIN accounting.document_extraction_jobs j ON j.document_id = d.id
        JOIN accounting.organizations o ON o.id = d.organization_id AND o.is_active
        WHERE d.id = e.document_id AND d.organization_id = e.organization_id AND d.dossier_id = e.dossier_id
        AND d.deleted_at_utc IS NULL AND d.malware_scan_status = 'SAIN' AND d.extraction_status = 'VALIDEE'
        AND j.status = 'VALIDEE' AND j.reviewed_at_utc = e.reviewed_at_utc
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j.validation_issues) issue WHERE issue->>'severity' = 'ERROR')))
      AND (e.status <> 'COLLECTING' OR e.created_at_utc < now() - interval '20 minutes')
      LIMIT 20`);
    for (const item of stale) {
      await this.storage.removeObject(`${item.object_prefix}/source`);
      await this.storage.removeObject(`${item.object_prefix}/expected.json`);
      await this.db.query(
        'DELETE FROM accounting.training_dataset_examples WHERE id = $1',
        [item.id],
      );
    }
    const expired = await this.db.query<
      { id: string; object_key: string | null }[]
    >(`SELECT id,object_key FROM accounting.training_dataset_exports
      WHERE status <> 'EXPIRED' AND (expires_at_utc < now() OR EXISTS (
        SELECT 1 FROM unnest(example_ids) eid WHERE NOT EXISTS (SELECT 1 FROM accounting.training_dataset_examples e
          JOIN accounting.training_dataset_consents c ON c.dossier_id = e.dossier_id AND c.enabled AND c.revision = e.consent_revision WHERE e.id = eid))) LIMIT 20`);
    for (const item of expired) {
      if (item.object_key) await this.storage.removeObject(item.object_key);
      await this.db.query(
        "UPDATE accounting.training_dataset_exports SET status = 'EXPIRED' WHERE id = $1",
        [item.id],
      );
    }
  }

  private async buildExport(item: DatasetExport) {
    const directory = await mkdtemp(join(tmpdir(), 'fiscora-training-'));
    const filePath = join(directory, 'dataset.zip');
    const output = createWriteStream(filePath, { mode: 0o600 });
    const archive = archiver('zip', { zlib: { level: 1 } });
    const closed = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });
    // Register rejection handling immediately, including failures before finalization.
    void closed.catch(() => undefined);
    archive.pipe(output);
    const samples: Record<string, unknown>[] = [];
    const maxBytes = 512 * 1024 * 1024;
    let bytes = 0;
    try {
      const examples = await this.liveByIds(item.example_ids);
      if (examples.length !== item.example_ids.length)
        throw new Error('Authorization changed');
      for (const example of examples) {
        const content = await this.storage.readObject(
          `${example.object_prefix}/source`,
        );
        if (sha256(content) !== example.source_sha256)
          throw new Error('Snapshot integrity failed');
        const paths: string[] = [];
        const append = async (image: Buffer, mime: string, page: number) => {
          bytes += image.length;
          if (bytes > maxBytes) throw new Error('EXPORT_TOO_LARGE');
          const path = `examples/${example.id}/page-${String(page).padStart(3, '0')}.${mime === 'image/png' ? 'png' : 'jpg'}`;
          paths.push(path);
          // Wait for each image entry to be consumed; do not queue a dataset's worth of Buffers.
          await new Promise<void>((resolve, reject) => {
            const done = (entry: { name: string }) => {
              if (entry.name !== path) return;
              archive.off('entry', done);
              archive.off('error', failed);
              output.off('error', failed);
              resolve();
            };
            const failed = (error: Error) => {
              archive.off('entry', done);
              archive.off('error', failed);
              output.off('error', failed);
              reject(error);
            };
            archive.on('entry', done);
            archive.once('error', failed);
            output.once('error', failed);
            archive.append(image, { name: path });
          });
        };
        if (example.mime_type === 'application/pdf') {
          let pages = 1;
          for (let start = 1; start <= pages; start += 2) {
            const rendered = await this.renderer.renderPdf(content, start, 2);
            if (
              rendered.pageCount > 100 ||
              (start > 1 && rendered.pageCount !== pages)
            )
              throw new Error('PDF page limit');
            pages = rendered.pageCount;
            for (const image of rendered.images)
              await append(image.content, image.mimeType, image.page);
          }
        } else await append(content, example.mime_type, 1);
        archive.append(JSON.stringify(example.expected_json, null, 2), {
          name: `examples/${example.id}/expected.json`,
        });
        archive.append(JSON.stringify(example.template_json, null, 2), {
          name: `examples/${example.id}/template.json`,
        });
        const sample = {
          id: example.id,
          documentKind: example.document_kind,
          images: paths,
          expected: `examples/${example.id}/expected.json`,
          template: `examples/${example.id}/template.json`,
          instructions: example.instructions,
          baseModel: example.model_name,
          sourceSha256: example.source_sha256,
          labelSha256: example.label_sha256,
          // Use this group to keep duplicate source documents in a single evaluation split.
          splitGroup: example.source_sha256,
          reviewedAtUtc: example.reviewed_at_utc,
          schemaVersion: TRAINING_SCHEMA_VERSION,
        };
        samples.push(sample);
        archive.append(JSON.stringify(sample, null, 2), {
          name: `examples/${example.id}/metadata.json`,
        });
        await this.db.query(
          `UPDATE accounting.training_dataset_exports SET lease_expires_at_utc = now() + interval '20 minutes' WHERE id = $1 AND status = 'PROCESSING'`,
          [item.id],
        );
      }
      archive.append(
        samples.map((sample) => JSON.stringify(sample)).join('\n') + '\n',
        { name: 'samples.jsonl' },
      );
      archive.append(
        JSON.stringify(
          {
            datasetId: item.id,
            schemaVersion: TRAINING_SCHEMA_VERSION,
            sampleCount: samples.length,
            createdAtUtc: new Date().toISOString(),
            containsSensitiveClientData: true,
            automaticallySplit: false,
          },
          null,
          2,
        ),
        { name: 'manifest.json' },
      );
      archive.append(
        'Private accountant-reviewed dataset. No training or deployment is automatic.\nKeep whole documents together. Split by supplier/bank/layout/source group before training; never use the test set for fitting.\nLabels are normalized review snapshots, not necessarily verbatim model targets. Audit monetary/date formatting and missing values before LoRA training.\nDo not publish these documents. Remove local copies when no longer needed.\n',
        { name: 'README.txt' },
      );
      await archive.finalize();
      await closed;
      const info = await stat(filePath);
      if (info.size > maxBytes) throw new Error('EXPORT_TOO_LARGE');
      if (
        (await this.liveByIds(item.example_ids)).length !==
        item.example_ids.length
      )
        throw new Error('Authorization changed');
      if (!this.storage.putFile)
        throw new Error('Storage file upload unavailable');
      const key = `exports/${item.id}.zip`;
      await this.storage.putFile(key, filePath, 'application/zip');
      const published = await this.db.query<{ id: string }[]>(
        `UPDATE accounting.training_dataset_exports SET status = 'READY',object_key = $2,size_bytes = $3,
        lease_expires_at_utc = NULL WHERE id = $1 AND status = 'PROCESSING' AND expires_at_utc > now() RETURNING id`,
        [item.id, key, info.size],
      );
      if (!published.length) await this.storage.removeObject(key);
    } catch (error) {
      archive.abort();
      output.destroy();
      await this.db.query(
        `UPDATE accounting.training_dataset_exports SET status = 'FAILED',error_code = $2,
        lease_expires_at_utc = NULL WHERE id = $1 AND status = 'PROCESSING'`,
        [
          item.id,
          error instanceof Error && error.message === 'EXPORT_TOO_LARGE'
            ? 'EXPORT_TOO_LARGE'
            : 'EXPORT_FAILED',
        ],
      );
    } finally {
      await closed.catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  }
}
