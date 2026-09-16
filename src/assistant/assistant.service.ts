import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { DossiersService } from '../dossiers/dossiers.service';
import { VertexAiClient } from './vertex-ai.client';

interface ApprovedExtractionRow {
  document_id: string;
  original_name: string;
  category: string;
  period_year: number | null;
  period_month: number | null;
  normalized_data: Record<string, unknown>;
}

interface KnowledgeChunkRow {
  id: string;
  source_id: string;
  source_name: string;
  page_number: number | null;
  content: string;
  metadata: Record<string, unknown>;
  distance: number;
}

export interface Citation {
  label: string;
  chunkId: string;
  sourceId: string;
  sourceName: string;
  pageNumber: number | null;
}

@Injectable()
export class AssistantService {
  private readonly embeddingDimensions: number;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly dossiers: DossiersService,
    private readonly vertex: VertexAiClient,
  ) {
    this.embeddingDimensions = Number(
      this.config.get<string>('VERTEX_AI_EMBEDDING_DIMENSIONS') ?? '768',
    );
  }

  async reindex(organizationId: string, dossierId: string, userId: string) {
    this.ensureEnabled();
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const approved = await this.dataSource.query<ApprovedExtractionRow[]>(
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
    const prepared: Array<{
      row: ApprovedExtractionRow;
      index: number;
      content: string;
      embedding: number[];
    }> = [];
    for (const row of approved) {
      for (const [index, content] of this.chunk(
        this.extractionText(row),
      ).entries()) {
        const embedding = await this.vertex.embed(
          content,
          'RETRIEVAL_DOCUMENT',
        );
        prepared.push({ row, index, content, embedding });
      }
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `DELETE FROM accounting.ai_knowledge_chunks
         WHERE organization_id = $1 AND dossier_id = $2
           AND source_type = 'REVIEWED_EXTRACTION'`,
        [organizationId, dossierId],
      );
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
      chunksIndexed: prepared.length,
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
    const embedding = await this.vertex.embed(question, 'RETRIEVAL_QUERY');
    const chunks = await this.dataSource.query<KnowledgeChunkRow[]>(
      `
        SELECT id, source_id, source_name, page_number, content, metadata,
          embedding <=> $4::vector AS distance
        FROM accounting.ai_knowledge_chunks
        WHERE organization_id = $1 AND dossier_id = $2
        ORDER BY (embedding <=> $4::vector)
          - (0.05 * ts_rank(search_vector, plainto_tsquery('simple', $3))) ASC
        LIMIT 6
      `,
      [organizationId, dossierId, question, this.vector(embedding)],
    );
    if (!chunks.length) {
      throw new BadRequestException(
        'Aucune source validée n’est indexée pour ce dossier.',
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
        result.text,
        JSON.stringify(citations),
        result.model,
        result.usage ? JSON.stringify(result.usage) : null,
      ],
    );
    return {
      id: inserted[0].id,
      answer: result.text,
      citations,
      model: result.model,
    };
  }

  private async insertChunk(
    queryRunner: QueryRunner,
    organizationId: string,
    dossierId: string,
    item: {
      row: ApprovedExtractionRow;
      index: number;
      content: string;
      embedding: number[];
    },
  ) {
    const metadata = {
      category: item.row.category,
      periodYear: item.row.period_year,
      periodMonth: item.row.period_month,
    };
    await queryRunner.query(
      `
        INSERT INTO accounting.ai_knowledge_chunks (
          organization_id, dossier_id, source_type, source_id, source_name,
          chunk_index, content, content_hash, metadata, embedding
        ) VALUES ($1, $2, 'REVIEWED_EXTRACTION', $3, $4, $5, $6, $7,
          $8::jsonb, $9::vector)
      `,
      [
        organizationId,
        dossierId,
        item.row.document_id,
        item.row.original_name,
        item.index,
        item.content,
        createHash('sha256').update(item.content).digest('hex'),
        JSON.stringify(metadata),
        this.vector(item.embedding),
      ],
    );
  }

  private extractionText(row: ApprovedExtractionRow) {
    const period =
      row.period_year === null
        ? 'non renseignée'
        : `${row.period_year}-${String(row.period_month ?? 0).padStart(2, '0')}`;
    return [
      `Document: ${row.original_name}`,
      `Catégorie: ${row.category}`,
      `Période: ${period}`,
      'Données extraites et validées humainement:',
      JSON.stringify(row.normalized_data, null, 2),
    ].join('\n');
  }

  private chunk(content: string) {
    const size = 6000;
    const overlap = 500;
    if (content.length <= size) return [content];
    const chunks: string[] = [];
    let start = 0;
    while (start < content.length) {
      chunks.push(content.slice(start, start + size));
      if (start + size >= content.length) break;
      start += size - overlap;
    }
    return chunks;
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
