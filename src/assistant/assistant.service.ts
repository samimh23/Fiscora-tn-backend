import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { OrganizationMembership } from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import {
  type AccountingKnowledgeChunk,
  type ApprovedExtractionForIndex,
  buildAccountingChunks,
} from './accounting-rag';
import {
  aggregateFinancialQuestion,
  detectFinancialQuestion,
} from './financial-question';
import { VertexAiClient } from './vertex-ai.client';
import {
  buildProductHelpContext,
  findProductHelp,
  isProductHelpQuestion,
  type ProductHelpMatch,
} from './product-help';

interface KnowledgeChunkRow {
  id: string;
  source_id: string;
  source_name: string;
  page_number: number | null;
  content: string;
  metadata: Record<string, unknown>;
  distance: number;
  text_score: number;
  relevance_score: number;
}

interface ExistingChunkRow {
  source_id: string;
  chunk_index: number;
  content_hash: string;
}

export interface Citation {
  label: string;
  chunkId: string;
  sourceId: string;
  sourceName: string;
  pageNumber: number | null;
  kind?: 'DOCUMENT' | 'PRODUCT_HELP';
  path?: string;
}

export interface AssistantAction {
  label: string;
  path: string;
}

@Injectable()
export class AssistantService {
  private readonly embeddingDimensions: number;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly dossiers: DossiersService,
    private readonly vertex: VertexAiClient,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
  ) {
    this.embeddingDimensions = Number(
      this.config.get<string>('VERTEX_AI_EMBEDDING_DIMENSIONS') ?? '768',
    );
  }

  async askContextual(
    organizationId: string,
    userId: string,
    question: string,
    currentPath?: string,
    dossierId?: string,
  ) {
    this.ensureEnabled();
    const membership = await this.memberships.findOne({
      where: { organizationId, userId, isActive: true },
      relations: { organization: true, role: { rolePermissions: true } },
    });
    if (!membership?.organization.isActive) {
      throw new BadRequestException(
        'Votre accès à cette organisation n’est pas actif.',
      );
    }
    const permissions = new Set(
      membership.role.rolePermissions.map((item) => item.permissionName),
    );
    const helpMatches = findProductHelp(question, currentPath, permissions);
    if (isProductHelpQuestion(question, helpMatches)) {
      return this.answerProductHelp(
        question,
        currentPath,
        dossierId,
        helpMatches,
      );
    }
    if (dossierId) {
      return this.ask(organizationId, dossierId, userId, question);
    }
    if (helpMatches.length) {
      return this.answerProductHelp(
        question,
        currentPath,
        dossierId,
        helpMatches,
      );
    }
    throw new BadRequestException(
      'Je n’ai pas trouvé de guide correspondant. Précisez la page ou choisissez un dossier pour interroger ses données validées.',
    );
  }

  async reindex(organizationId: string, dossierId: string, userId: string) {
    this.ensureEnabled();
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const approved = await this.approvedExtractions(organizationId, dossierId);
    const prepared: Array<{
      row: ApprovedExtractionForIndex;
      index: number;
      chunk: AccountingKnowledgeChunk;
      content: string;
      contentHash: string;
      embedding: number[];
    }> = [];

    const existing = await this.dataSource.query<ExistingChunkRow[]>(
      `SELECT source_id, chunk_index, content_hash
       FROM accounting.ai_knowledge_chunks
       WHERE organization_id = $1 AND dossier_id = $2
         AND source_type = 'REVIEWED_EXTRACTION'`,
      [organizationId, dossierId],
    );
    const existingHashes = new Map(
      existing.map((item) => [
        `${item.source_id}:${item.chunk_index}`,
        item.content_hash.trim(),
      ]),
    );
    const candidates: Array<{
      row: ApprovedExtractionForIndex;
      index: number;
      chunk: AccountingKnowledgeChunk;
      content: string;
      contentHash: string;
    }> = [];
    let reusedChunks = 0;
    for (const row of approved) {
      for (const [index, chunk] of buildAccountingChunks(row).entries()) {
        const contentHash = createHash('sha256')
          .update(chunk.content)
          .digest('hex');
        if (existingHashes.get(`${row.document_id}:${index}`) === contentHash) {
          reusedChunks += 1;
          continue;
        }
        candidates.push({
          row,
          index,
          chunk,
          content: chunk.content,
          contentHash,
        });
      }
    }
    for (let offset = 0; offset < candidates.length; offset += 8) {
      const batch = candidates.slice(offset, offset + 8);
      const embeddings = await Promise.all(
        batch.map((item) =>
          this.vertex.embed(item.content, 'RETRIEVAL_DOCUMENT'),
        ),
      );
      batch.forEach((item, index) =>
        prepared.push({ ...item, embedding: embeddings[index] }),
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const sourceIds = approved.map((row) => row.document_id);
      if (sourceIds.length) {
        await queryRunner.query(
          `DELETE FROM accounting.ai_knowledge_chunks
           WHERE organization_id = $1 AND dossier_id = $2
             AND source_type = 'REVIEWED_EXTRACTION'
             AND NOT (source_id = ANY($3::text[]))`,
          [organizationId, dossierId, sourceIds],
        );
      } else {
        await queryRunner.query(
          `DELETE FROM accounting.ai_knowledge_chunks
           WHERE organization_id = $1 AND dossier_id = $2
             AND source_type = 'REVIEWED_EXTRACTION'`,
          [organizationId, dossierId],
        );
      }
      for (const row of approved) {
        const chunkCount = buildAccountingChunks(row).length;
        await queryRunner.query(
          `DELETE FROM accounting.ai_knowledge_chunks
           WHERE organization_id = $1 AND dossier_id = $2
             AND source_type = 'REVIEWED_EXTRACTION'
             AND source_id = $3 AND chunk_index >= $4`,
          [organizationId, dossierId, row.document_id, chunkCount],
        );
      }
      for (const item of prepared) {
        await this.insertChunk(queryRunner, organizationId, dossierId, item);
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
    return {
      documentsIndexed: approved.length,
      chunksIndexed: reusedChunks + prepared.length,
      chunksEmbedded: prepared.length,
      chunksReused: reusedChunks,
    };
  }

  async ask(
    organizationId: string,
    dossierId: string,
    userId: string,
    question: string,
  ) {
    this.ensureEnabled();
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const intent = detectFinancialQuestion(question);
    if (intent) {
      const approved = await this.approvedExtractions(
        organizationId,
        dossierId,
      );
      const aggregation = aggregateFinancialQuestion(approved, intent);
      if (aggregation) {
        const citations: Citation[] = aggregation.rows.map((row, index) => ({
          label: `S${index + 1}`,
          chunkId: `deterministic:${row.document_id}`,
          sourceId: row.document_id,
          sourceName: row.original_name,
          pageNumber: null,
        }));
        const labels = citations.map((item) => `[${item.label}]`).join(' ');
        const answer = `${aggregation.answer} ${labels}`.trim();
        const id = await this.recordTurn(
          organizationId,
          dossierId,
          userId,
          question,
          answer,
          citations,
          'deterministic-accounting-v1',
          null,
        );
        return {
          id,
          answer,
          citations,
          model: 'deterministic-accounting-v1',
        };
      }
    }
    const embedding = await this.vertex.embed(question, 'RETRIEVAL_QUERY');
    const chunks = await this.dataSource.query<KnowledgeChunkRow[]>(
      `
        WITH scored AS (
          SELECT id, source_id, source_name, page_number, content, metadata,
            embedding <=> $4::vector AS distance,
            ts_rank(search_vector, plainto_tsquery('simple', $3)) AS text_score
          FROM accounting.ai_knowledge_chunks
          WHERE organization_id = $1 AND dossier_id = $2
        ),
        vector_ranked AS (
          SELECT id, row_number() OVER (ORDER BY distance ASC) AS rank
          FROM scored ORDER BY distance ASC LIMIT 20
        ),
        text_ranked AS (
          SELECT id, row_number() OVER (ORDER BY text_score DESC) AS rank
          FROM scored WHERE text_score > 0 ORDER BY text_score DESC LIMIT 20
        ),
        fused AS (
          SELECT id, SUM(score) AS relevance_score
          FROM (
            SELECT id, 1.0 / (60 + rank) AS score FROM vector_ranked
            UNION ALL
            SELECT id, 1.0 / (60 + rank) AS score FROM text_ranked
          ) ranked
          GROUP BY id
        )
        SELECT scored.*, fused.relevance_score
        FROM fused INNER JOIN scored ON scored.id = fused.id
        ORDER BY fused.relevance_score DESC, scored.distance ASC
        LIMIT 8
      `,
      [organizationId, dossierId, question, this.vector(embedding)],
    );
    if (!chunks.length) {
      throw new BadRequestException(
        'Aucune source validée n’est indexée pour ce dossier.',
      );
    }
    const maxDistance = Number(
      this.config.get<string>('AI_ASSISTANT_MAX_VECTOR_DISTANCE') ?? '0.8',
    );
    if (
      chunks[0].distance > maxDistance &&
      chunks.every((chunk) => chunk.text_score === 0)
    ) {
      throw new BadRequestException(
        'Les sources validées ne permettent pas de répondre avec suffisamment de confiance.',
      );
    }
    const citations: Citation[] = chunks.map((chunk, index) => ({
      label: `S${index + 1}`,
      chunkId: chunk.id,
      sourceId: chunk.source_id,
      sourceName: chunk.source_name,
      pageNumber: chunk.page_number,
    }));
    const context = chunks
      .map(
        (chunk, index) =>
          `[S${index + 1}] ${chunk.source_name}\n${chunk.content}`,
      )
      .join('\n\n');
    const result = await this.vertex.answer(question, context);
    const id = await this.recordTurn(
      organizationId,
      dossierId,
      userId,
      question,
      result.text,
      citations,
      result.model,
      result.usage,
    );
    return {
      id,
      answer: result.text,
      citations,
      model: result.model,
    };
  }

  private async answerProductHelp(
    question: string,
    currentPath: string | undefined,
    dossierId: string | undefined,
    matches: ProductHelpMatch[],
  ) {
    const citations: Citation[] = matches.map(({ entry }, index) => ({
      label: `S${index + 1}`,
      chunkId: `product-help:${entry.id}`,
      sourceId: entry.id,
      sourceName: entry.title,
      pageNumber: null,
      kind: 'PRODUCT_HELP',
      path: this.resolveHelpPath(entry.path, currentPath, dossierId),
    }));
    const actions: AssistantAction[] = citations
      .slice(0, 2)
      .map((citation) => ({
        label: `Ouvrir « ${citation.sourceName} »`,
        path: citation.path!,
      }));
    const result = await this.vertex.answerProductHelp(
      question,
      buildProductHelpContext(matches),
      currentPath,
    );
    return {
      id: `product-help:${randomUUID()}`,
      answer: result.text,
      citations,
      actions,
      model: result.model,
      scope: 'PRODUCT_HELP',
    };
  }

  private resolveHelpPath(
    path: string,
    currentPath?: string,
    dossierId?: string,
  ) {
    if (!path.includes(':dossierId')) return path;
    const pathDossierId = currentPath?.match(
      /^\/(?:portail\/)?dossiers\/([^/?]+)/,
    )?.[1];
    const resolvedId = pathDossierId ?? dossierId;
    if (resolvedId) return path.replace(':dossierId', resolvedId);
    return path.startsWith('/portail/') ? '/portail/dossiers' : '/dossiers';
  }

  private async recordTurn(
    organizationId: string,
    dossierId: string,
    userId: string,
    question: string,
    answer: string,
    citations: Citation[],
    model: string,
    usage: Record<string, unknown> | null,
  ) {
    const inserted = await this.dataSource.query<Array<{ id: string }>>(
      `
        INSERT INTO accounting.ai_chat_turns (
          organization_id, dossier_id, user_id, question, answer,
          citations, model_name, usage
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
        RETURNING id
      `,
      [
        organizationId,
        dossierId,
        userId,
        question,
        answer,
        JSON.stringify(citations),
        model,
        usage ? JSON.stringify(usage) : null,
      ],
    );
    return inserted[0].id;
  }

  private async insertChunk(
    queryRunner: QueryRunner,
    organizationId: string,
    dossierId: string,
    item: {
      row: ApprovedExtractionForIndex;
      index: number;
      chunk: AccountingKnowledgeChunk;
      content: string;
      contentHash: string;
      embedding: number[];
    },
  ) {
    const metadata = item.chunk.metadata;
    await queryRunner.query(
      `
        INSERT INTO accounting.ai_knowledge_chunks (
          organization_id, dossier_id, source_type, source_id, source_name,
          chunk_index, content, content_hash, metadata, embedding
        ) VALUES ($1, $2, 'REVIEWED_EXTRACTION', $3, $4, $5, $6, $7,
          $8::jsonb, $9::vector)
        ON CONFLICT (organization_id, dossier_id, source_type, source_id, chunk_index)
        DO UPDATE SET content = EXCLUDED.content,
          content_hash = EXCLUDED.content_hash,
          metadata = EXCLUDED.metadata,
          embedding = EXCLUDED.embedding,
          updated_at_utc = now()
      `,
      [
        organizationId,
        dossierId,
        item.row.document_id,
        item.row.original_name,
        item.index,
        item.content,
        item.contentHash,
        JSON.stringify(metadata),
        this.vector(item.embedding),
      ],
    );
  }

  private approvedExtractions(organizationId: string, dossierId: string) {
    return this.dataSource.query<ApprovedExtractionForIndex[]>(
      `
        SELECT job.document_id, document.original_name, document.category,
          document.period_year, document.period_month, job.normalized_data
        FROM accounting.document_extraction_jobs job
        INNER JOIN accounting.accounting_documents document
          ON document.id = job.document_id
        WHERE job.organization_id = $1
          AND job.dossier_id = $2
          AND job.status = 'VALIDEE'
          AND job.normalized_data IS NOT NULL
          AND document.deleted_at_utc IS NULL
        ORDER BY job.reviewed_at_utc DESC NULLS LAST, job.created_at_utc DESC
      `,
      [organizationId, dossierId],
    );
  }

  private vector(values: number[]) {
    if (values.length !== this.embeddingDimensions) {
      throw new ServiceUnavailableException(
        `Dimension d’embedding invalide: ${values.length}, attendu ${this.embeddingDimensions}.`,
      );
    }
    if (!values.every(Number.isFinite)) {
      throw new ServiceUnavailableException(
        'Vertex AI a retourné un vecteur invalide.',
      );
    }
    return `[${values.join(',')}]`;
  }

  private ensureEnabled() {
    if (
      (this.config.get<string>('AI_ASSISTANT_ENABLED') ?? 'false') !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'L’assistant Fiscora n’est pas activé.',
      );
    }
  }
}
