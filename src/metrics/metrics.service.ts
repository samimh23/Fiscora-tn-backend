import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

interface MinuteMetrics {
  requests: number;
  errors5xx: number;
  durationTotalMs: number;
  durationsMs: number[];
}

@Injectable()
export class MetricsService {
  private readonly startedAt = new Date();
  private readonly minuteHistory = new Map<number, MinuteMetrics>();
  private activeRequestCount = 0;
  private readonly registry = new Registry();
  private readonly requests = new Counter({
    name: 'fiscora_http_requests_total',
    help: 'Nombre total de requêtes HTTP traitées par l’API Fiscora.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });
  private readonly duration = new Histogram({
    name: 'fiscora_http_request_duration_seconds',
    help: 'Durée des requêtes HTTP Fiscora en secondes.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly active = new Gauge({
    name: 'fiscora_http_active_requests',
    help: 'Nombre de requêtes HTTP Fiscora actuellement en cours.',
    labelNames: ['method', 'route'] as const,
    registers: [this.registry],
  });
  private readonly databaseUp = new Gauge({
    name: 'fiscora_database_up',
    help: 'Disponibilité de PostgreSQL vue depuis l’API (1 disponible, 0 indisponible).',
    registers: [this.registry],
  });
  private readonly databaseProbeDuration = new Histogram({
    name: 'fiscora_database_probe_duration_seconds',
    help: 'Durée du contrôle de disponibilité PostgreSQL.',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [this.registry],
  });

  constructor(private readonly dataSource: DataSource) {
    this.registry.setDefaultLabels({
      application: 'fiscora-api',
      environment: process.env.NODE_ENV ?? 'development',
    });
    collectDefaultMetrics({
      prefix: 'fiscora_',
      register: this.registry,
    });
  }

  get contentType() {
    return this.registry.contentType;
  }

  startRequest(method: string, route: string) {
    this.activeRequestCount += 1;
    this.active.inc({ method, route });
  }

  finishRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ) {
    const status_code = String(statusCode);
    this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
    this.active.dec({ method, route });
    this.requests.inc({ method, route, status_code });
    this.duration.observe({ method, route, status_code }, durationSeconds);
    this.recordOperationalRequest(statusCode, durationSeconds * 1000);
  }

  async render() {
    await this.probeDatabase();
    return this.registry.metrics();
  }

  async operationalSnapshot() {
    const databaseStartedAt = process.hrtime.bigint();
    let databaseStatus: 'OPERATIONNEL' | 'INDISPONIBLE' = 'OPERATIONNEL';
    try {
      await this.dataSource.query('SELECT 1');
      this.databaseUp.set(1);
    } catch {
      databaseStatus = 'INDISPONIBLE';
      this.databaseUp.set(0);
    }
    const databaseLatencyMs = Number(
      (process.hrtime.bigint() - databaseStartedAt) / 1_000_000n,
    );

    const now = Date.now();
    this.pruneHistory(now);
    const currentMinute = this.minuteStart(now);
    const history = Array.from({ length: 60 }, (_, index) => {
      const startedAtMs = currentMinute - (59 - index) * 60_000;
      const bucket = this.minuteHistory.get(startedAtMs);
      return {
        timestampUtc: new Date(startedAtMs).toISOString(),
        requests: bucket?.requests ?? 0,
        errors5xx: bucket?.errors5xx ?? 0,
        averageDurationMs: bucket?.requests
          ? Math.round(bucket.durationTotalMs / bucket.requests)
          : 0,
      };
    });
    const buckets = [...this.minuteHistory.values()];
    const requestsTotal = buckets.reduce(
      (total, bucket) => total + bucket.requests,
      0,
    );
    const errors5xx = buckets.reduce(
      (total, bucket) => total + bucket.errors5xx,
      0,
    );
    const durationTotalMs = buckets.reduce(
      (total, bucket) => total + bucket.durationTotalMs,
      0,
    );
    const durations = buckets
      .flatMap((bucket) => bucket.durationsMs)
      .sort((left, right) => left - right);
    const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
    const memory = process.memoryUsage();

    return {
      generatedAtUtc: new Date(now).toISOString(),
      scope: 'CURRENT_API_REPLICA' as const,
      windowMinutes: 60,
      runtime: {
        status: 'OPERATIONNEL' as const,
        environment: process.env.NODE_ENV ?? 'development',
        nodeVersion: process.version,
        startedAtUtc: this.startedAt.toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
      },
      http: {
        activeRequests: this.activeRequestCount,
        requestsTotal,
        errors5xx,
        errorRate: requestsTotal ? errors5xx / requestsTotal : 0,
        averageDurationMs: requestsTotal
          ? Math.round(durationTotalMs / requestsTotal)
          : 0,
        p95DurationMs: durations.length ? Math.round(durations[p95Index]) : 0,
      },
      database: {
        status: databaseStatus,
        latencyMs: databaseLatencyMs,
      },
      history,
    };
  }

  private recordOperationalRequest(statusCode: number, durationMs: number) {
    const now = Date.now();
    const startedAtMs = this.minuteStart(now);
    const bucket = this.minuteHistory.get(startedAtMs) ?? {
      requests: 0,
      errors5xx: 0,
      durationTotalMs: 0,
      durationsMs: [],
    };
    bucket.requests += 1;
    if (statusCode >= 500) bucket.errors5xx += 1;
    bucket.durationTotalMs += durationMs;
    if (bucket.durationsMs.length < 500) bucket.durationsMs.push(durationMs);
    this.minuteHistory.set(startedAtMs, bucket);
    this.pruneHistory(now);
  }

  private minuteStart(value: number) {
    return Math.floor(value / 60_000) * 60_000;
  }

  private pruneHistory(now: number) {
    const oldest = this.minuteStart(now) - 59 * 60_000;
    for (const key of this.minuteHistory.keys()) {
      if (key < oldest) this.minuteHistory.delete(key);
    }
  }

  private async probeDatabase() {
    const end = this.databaseProbeDuration.startTimer();
    try {
      await this.dataSource.query('SELECT 1');
      this.databaseUp.set(1);
    } catch {
      this.databaseUp.set(0);
    } finally {
      end();
    }
  }
}
