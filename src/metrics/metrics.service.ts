import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService {
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
    this.active.inc({ method, route });
  }

  finishRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ) {
    const status_code = String(statusCode);
    this.active.dec({ method, route });
    this.requests.inc({ method, route, status_code });
    this.duration.observe({ method, route, status_code }, durationSeconds);
  }

  async render() {
    await this.probeDatabase();
    return this.registry.metrics();
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
