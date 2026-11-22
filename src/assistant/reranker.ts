import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleWifTokenService } from '../documents/extraction/google-wif-token.service';
import { AiUsageRecorder } from '../ai-usage/ai-usage.recorder';

export interface RerankCandidate {
  id: string;
  title: string;
  content: string;
}

export interface RerankScore {
  id: string;
  score: number;
}

interface RankingResponse {
  records?: Array<{ id?: string; score?: number }>;
}

/**
 * Re-orders retrieved chunks with the Vertex AI Ranking API, which reads the
 * question and each chunk together and is better at picking the chunk that
 * actually answers. It is optional and never blocking: when it is switched off
 * (`RAG_RERANKER=none`), slow or failing, the caller keeps its own order.
 */
@Injectable()
export class AssistantReranker {
  private readonly logger = new Logger(AssistantReranker.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: GoogleWifTokenService,
    @Optional() private readonly usage?: AiUsageRecorder,
  ) {}

  get enabled() {
    return (
      (this.config.get<string>('RAG_RERANKER') ?? 'none')
        .trim()
        .toLowerCase() === 'vertex'
    );
  }

  /** Returns scores for the candidates, best first, or null to keep the input order. */
  async rerank(
    query: string,
    candidates: RerankCandidate[],
    topN: number,
  ): Promise<RerankScore[] | null> {
    if (!this.enabled || candidates.length < 2) return null;
    const project = this.config.get<string>('GCP_PROJECT_ID')?.trim();
    if (!project) {
      this.logger.warn('RAG_RERANKER=vertex but GCP_PROJECT_ID is not set.');
      return null;
    }
    const model =
      this.config.get<string>('RAG_RERANK_MODEL')?.trim() ||
      'semantic-ranker-default@latest';
    const timeoutMs = Number(
      this.config.get<string>('RAG_RERANK_TIMEOUT_MS') ?? '2500',
    );
    const startedAt = Date.now();
    const records = Math.min(candidates.length, 200);
    const record = (
      status: 'OK' | 'FALLBACK',
      httpStatus: number | null,
      error: string | null,
    ) =>
      this.usage?.record({
        feature: 'rerank',
        provider: 'ranking',
        model,
        status,
        latencyMs: Date.now() - startedAt,
        httpStatus,
        units: records,
        error,
      });
    try {
      const token = await this.tokens.accessToken();
      const response = await fetch(
        `https://discoveryengine.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/global/rankingConfigs/default_ranking_config:rank`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-goog-user-project': project,
          },
          body: JSON.stringify({
            model,
            query: query.slice(0, 2000),
            topN: Math.min(topN, candidates.length),
            ignoreRecordDetailsInResponse: true,
            records: candidates.slice(0, 200).map((candidate) => ({
              id: candidate.id,
              title: candidate.title.slice(0, 300),
              content: candidate.content.slice(0, 4000),
            })),
          }),
          signal: AbortSignal.timeout(
            Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 2500,
          ),
        },
      );
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        record('FALLBACK', response.status, detail);
        this.logger.warn(
          `Vertex ranking returned ${response.status}; keeping hybrid order. ${detail}`,
        );
        return null;
      }
      const body = (await response.json()) as RankingResponse;
      const known = new Set(candidates.map((candidate) => candidate.id));
      const scores = (body.records ?? [])
        .filter(
          (record): record is { id: string; score?: number } =>
            typeof record.id === 'string' && known.has(record.id),
        )
        .map((record) => ({ id: record.id, score: Number(record.score ?? 0) }))
        .sort((left, right) => right.score - left.score);
      record('OK', response.status, null);
      this.logger.debug(
        `Vertex ranking scored ${scores.length} chunks in ${Date.now() - startedAt} ms.`,
      );
      return scores.length ? scores : null;
    } catch (error) {
      record(
        'FALLBACK',
        null,
        error instanceof Error ? error.message : String(error),
      );
      this.logger.warn(
        `Vertex ranking unavailable after ${Date.now() - startedAt} ms; keeping hybrid order. ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

/**
 * Keeps at most `perSource` chunks of one document in the final context, so a
 * long document cannot crowd out the others, then fills any free slots with
 * the best remaining chunks.
 */
export function diversify<T extends { source_id: string }>(
  ordered: T[],
  limit: number,
  perSource: number,
  /** The best-ranked document may keep more passages than the others. */
  firstSourceLimit = perSource,
) {
  const selected: T[] = [];
  const skipped: T[] = [];
  const counts = new Map<string, number>();
  const firstSource = ordered[0]?.source_id;
  for (const item of ordered) {
    if (selected.length >= limit) break;
    const count = counts.get(item.source_id) ?? 0;
    const cap = item.source_id === firstSource ? firstSourceLimit : perSource;
    if (count < cap) {
      selected.push(item);
      counts.set(item.source_id, count + 1);
    } else {
      skipped.push(item);
    }
  }
  for (const item of skipped) {
    if (selected.length >= limit) break;
    selected.push(item);
  }
  // Backfilled chunks join at the end; restore the ranking order.
  const position = new Map(ordered.map((item, index) => [item, index]));
  return selected.sort(
    (left, right) => position.get(left)! - position.get(right)!,
  );
}
