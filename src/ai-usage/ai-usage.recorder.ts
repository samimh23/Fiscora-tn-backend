import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export type AiFeature =
  | 'assistant_answer'
  | 'assistant_route'
  | 'product_help'
  | 'embedding_query'
  | 'embedding_document'
  | 'rerank'
  | 'extraction'
  | 'ocr'
  | 'pdf_render';

export type AiProvider = 'vertex' | 'ranking' | 'nuextract' | 'paddleocr';

export interface AiUsageEvent {
  feature: AiFeature;
  provider: AiProvider;
  model: string;
  status: 'OK' | 'ERROR' | 'FALLBACK';
  latencyMs: number;
  httpStatus?: number | null;
  retries?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Records ranked, pages read: what the call was billed or sized on. */
  units?: number;
  error?: string | null;
}

/** USD list prices; override with AI_PRICE_<KEY> (e.g. AI_PRICE_FLASH_OUTPUT_PER_M). */
const DEFAULT_PRICES = {
  FLASH_INPUT_PER_M: 0.3,
  FLASH_OUTPUT_PER_M: 2.5,
  EMBEDDING_INPUT_PER_M: 0.15,
  RANKING_PER_1000: 1,
};
type PriceKey = keyof typeof DEFAULT_PRICES;

/**
 * Estimated cost of one call from its tokens or units. Self-hosted services
 * (NuExtract, PaddleOCR on Cloud Run) are billed by GPU/CPU time, not per
 * call, so they count 0 here and appear in the Google Cloud bill instead.
 */
export function estimateCostUsd(
  event: Pick<
    AiUsageEvent,
    'provider' | 'model' | 'inputTokens' | 'outputTokens' | 'status'
  >,
  price: (key: PriceKey) => number = (key) => DEFAULT_PRICES[key],
) {
  const input = event.inputTokens ?? 0;
  const output = event.outputTokens ?? 0;
  if (event.provider === 'ranking')
    return event.status === 'OK' ? price('RANKING_PER_1000') / 1000 : 0;
  if (event.provider !== 'vertex') return 0;
  if (event.model.includes('embedding'))
    return (input * price('EMBEDDING_INPUT_PER_M')) / 1_000_000;
  return (
    (input * price('FLASH_INPUT_PER_M') +
      output * price('FLASH_OUTPUT_PER_M')) /
    1_000_000
  );
}

/**
 * Writes one row per AI call. Recording never blocks or fails the call it
 * describes: the insert runs in the background and errors are only logged.
 */
@Injectable()
export class AiUsageRecorder {
  private readonly logger = new Logger(AiUsageRecorder.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  record(event: AiUsageEvent) {
    const cost = estimateCostUsd(event, (key) => this.price(key));
    void this.dataSource
      .query(
        `INSERT INTO "accounting"."ai_usage_events"
          ("feature", "provider", "model", "status", "http_status", "latency_ms",
           "retries", "input_tokens", "output_tokens", "units", "estimated_cost_usd", "error")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          event.feature,
          event.provider,
          event.model.slice(0, 160),
          event.status,
          event.httpStatus ?? null,
          Math.max(0, Math.round(event.latencyMs)),
          event.retries ?? 0,
          Math.max(0, Math.round(event.inputTokens ?? 0)),
          Math.max(0, Math.round(event.outputTokens ?? 0)),
          Math.max(0, Math.round(event.units ?? 0)),
          cost.toFixed(8),
          event.error ? event.error.slice(0, 300) : null,
        ],
      )
      .catch((error: unknown) =>
        this.logger.warn(
          `AI usage not recorded: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }

  private price(key: PriceKey) {
    const value = Number(this.config.get<string>(`AI_PRICE_${key}`));
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_PRICES[key];
  }
}

/** Token counts from a Gemini generateContent or embedding predict response. */
export function vertexTokens(body: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  const value = (body ?? {}) as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
    predictions?: Array<{
      embeddings?: { statistics?: { token_count?: number } };
    }>;
  };
  const usage = value.usageMetadata;
  if (usage)
    return {
      inputTokens: Number(usage.promptTokenCount ?? 0),
      // Thinking tokens are billed as output.
      outputTokens:
        Number(usage.candidatesTokenCount ?? 0) +
        Number(usage.thoughtsTokenCount ?? 0),
    };
  const embeddingTokens = (value.predictions ?? []).reduce(
    (sum, prediction) =>
      sum + Number(prediction.embeddings?.statistics?.token_count ?? 0),
    0,
  );
  return { inputTokens: embeddingTokens, outputTokens: 0 };
}
