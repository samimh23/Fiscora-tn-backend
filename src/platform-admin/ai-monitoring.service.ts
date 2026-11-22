import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type Row = Record<string, string | number | null>;

const num = (value: unknown) => Number(value ?? 0);

/**
 * Platform-wide view of the AI features: calls, errors, latency, tokens and
 * estimated cost per feature (from ai_usage_events), and answer quality from
 * the assistant turns and their 👍 / 👎 ratings.
 */
@Injectable()
export class AiMonitoringService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async usage(days: number) {
    const window = Math.min(Math.max(Math.trunc(days) || 30, 1), 90);
    const [features, daily, answers, weeklyFeedback, organizations] =
      await Promise.all([
        this.dataSource.query<Row[]>(
          `SELECT "feature", "provider",
             MAX("model") AS "model",
             COUNT(*) AS "calls",
             COUNT(*) FILTER (WHERE "status" = 'ERROR') AS "errors",
             COUNT(*) FILTER (WHERE "status" = 'FALLBACK') AS "fallbacks",
             COUNT(*) FILTER (WHERE "retries" > 0) AS "retried",
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latency_ms") AS "p50Ms",
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latency_ms") AS "p95Ms",
             SUM("input_tokens") AS "inputTokens",
             SUM("output_tokens") AS "outputTokens",
             SUM("units") AS "units",
             SUM("estimated_cost_usd") AS "costUsd",
             MAX("created_at_utc") AS "lastCallAtUtc",
             MAX("created_at_utc") FILTER (WHERE "status" <> 'OK') AS "lastProblemAtUtc"
           FROM "accounting"."ai_usage_events"
           WHERE "created_at_utc" >= now() - make_interval(days => $1)
           GROUP BY "feature", "provider"
           ORDER BY COUNT(*) DESC`,
          [window],
        ),
        this.dataSource.query<Row[]>(
          `SELECT TO_CHAR(("created_at_utc" AT TIME ZONE 'Africa/Tunis')::date, 'YYYY-MM-DD') AS "date",
             COUNT(*) AS "calls",
             COUNT(*) FILTER (WHERE "status" <> 'OK') AS "problems",
             SUM("estimated_cost_usd") AS "costUsd"
           FROM "accounting"."ai_usage_events"
           WHERE "created_at_utc" >= now() - make_interval(days => $1)
           GROUP BY 1 ORDER BY 1`,
          [window],
        ),
        this.dataSource.query<Row[]>(
          `SELECT COUNT(*) AS "answers",
             COUNT(*) FILTER (WHERE "feedback_rating" = 1) AS "likes",
             COUNT(*) FILTER (WHERE "feedback_rating" = -1) AS "dislikes",
             COUNT(*) FILTER (WHERE "feedback_comment" IS NOT NULL) AS "comments",
             COUNT(*) FILTER (WHERE jsonb_array_length("citations") = 0) AS "withoutSource"
           FROM "accounting"."ai_chat_turns"
           WHERE "created_at_utc" >= now() - make_interval(days => $1)`,
          [window],
        ),
        this.dataSource.query<Row[]>(
          `SELECT TO_CHAR(date_trunc('week', "feedback_at_utc" AT TIME ZONE 'Africa/Tunis'), 'YYYY-MM-DD') AS "week",
             COUNT(*) FILTER (WHERE "feedback_rating" = 1) AS "likes",
             COUNT(*) FILTER (WHERE "feedback_rating" = -1) AS "dislikes"
           FROM "accounting"."ai_chat_turns"
           WHERE "feedback_rating" IS NOT NULL
             AND "feedback_at_utc" >= now() - interval '12 weeks'
           GROUP BY 1 ORDER BY 1`,
        ),
        this.dataSource.query<Row[]>(
          `SELECT o."name" AS "organizationName",
             COUNT(*) AS "answers",
             COUNT(*) FILTER (WHERE t."feedback_rating" = -1) AS "dislikes"
           FROM "accounting"."ai_chat_turns" t
           JOIN "accounting"."organizations" o ON o."id" = t."organization_id"
           WHERE t."created_at_utc" >= now() - make_interval(days => $1)
           GROUP BY o."name" ORDER BY COUNT(*) DESC LIMIT 10`,
          [window],
        ),
      ]);
    const totals = features.reduce<{
      calls: number;
      problems: number;
      costUsd: number;
    }>(
      (sum, row) => ({
        calls: sum.calls + num(row.calls),
        problems: sum.problems + num(row.errors) + num(row.fallbacks),
        costUsd: sum.costUsd + num(row.costUsd),
      }),
      { calls: 0, problems: 0, costUsd: 0 },
    );
    const quality = answers[0] ?? {};
    return {
      days: window,
      totals: { ...totals, costUsd: round(totals.costUsd, 4) },
      features: features.map((row) => ({
        feature: String(row.feature),
        provider: String(row.provider),
        model: String(row.model),
        calls: num(row.calls),
        errors: num(row.errors),
        fallbacks: num(row.fallbacks),
        retried: num(row.retried),
        p50Ms: Math.round(num(row.p50Ms)),
        p95Ms: Math.round(num(row.p95Ms)),
        inputTokens: num(row.inputTokens),
        outputTokens: num(row.outputTokens),
        units: num(row.units),
        costUsd: round(num(row.costUsd), 4),
        lastCallAtUtc: iso(row.lastCallAtUtc),
        lastProblemAtUtc: iso(row.lastProblemAtUtc),
      })),
      daily: daily.map((row) => ({
        date: String(row.date),
        calls: num(row.calls),
        problems: num(row.problems),
        costUsd: round(num(row.costUsd), 4),
      })),
      assistant: {
        answers: num(quality.answers),
        likes: num(quality.likes),
        dislikes: num(quality.dislikes),
        comments: num(quality.comments),
        withoutSource: num(quality.withoutSource),
        weekly: weeklyFeedback.map((row) => ({
          week: String(row.week),
          likes: num(row.likes),
          dislikes: num(row.dislikes),
        })),
        organizations: organizations.map((row) => ({
          organizationName: String(row.organizationName),
          answers: num(row.answers),
          dislikes: num(row.dislikes),
        })),
      },
    };
  }

  /** Rated answers, newest first; only answers a user chose to rate. */
  async feedback(rating: 'up' | 'down' | 'all', limit: number) {
    const filter =
      rating === 'up'
        ? 't."feedback_rating" = 1'
        : rating === 'down'
          ? 't."feedback_rating" = -1'
          : 't."feedback_rating" IS NOT NULL';
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        createdAtUtc: Date;
        feedbackAtUtc: Date;
        rating: number;
        comment: string | null;
        question: string;
        answer: string;
        citations: Array<{ label?: string; sourceName?: string }> | null;
        modelName: string;
        organizationName: string;
        dossierName: string | null;
      }>
    >(
      `SELECT t."id", t."created_at_utc" AS "createdAtUtc",
         t."feedback_at_utc" AS "feedbackAtUtc", t."feedback_rating" AS "rating",
         t."feedback_comment" AS "comment", t."question", t."answer", t."citations",
         t."model_name" AS "modelName", o."name" AS "organizationName",
         d."legal_name" AS "dossierName"
       FROM "accounting"."ai_chat_turns" t
       JOIN "accounting"."organizations" o ON o."id" = t."organization_id"
       LEFT JOIN "accounting"."client_dossiers" d ON d."id" = t."dossier_id"
       WHERE ${filter}
       ORDER BY t."feedback_at_utc" DESC
       LIMIT $1`,
      [Math.min(Math.max(Math.trunc(limit) || 50, 1), 200)],
    );
    return rows.map((row) => ({
      id: row.id,
      createdAtUtc: iso(row.createdAtUtc),
      feedbackAtUtc: iso(row.feedbackAtUtc),
      rating: Number(row.rating),
      comment: row.comment,
      question: row.question,
      answer: row.answer.slice(0, 4000),
      sources: (row.citations ?? []).map((citation) =>
        [citation.label, citation.sourceName].filter(Boolean).join(' '),
      ),
      modelName: row.modelName,
      organizationName: row.organizationName,
      dossierName: row.dossierName,
    }));
  }
}

function iso(value: unknown) {
  if (!value) return null;
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : new Date(NaN);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
