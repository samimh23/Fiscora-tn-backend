import type { DataSource } from 'typeorm';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('exposes HTTP and database metrics', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ result: 1 }]),
    } as unknown as DataSource;
    const service = new MetricsService(dataSource);

    service.startRequest('GET', '/health');
    service.finishRequest('GET', '/health', 200, 0.015);

    const output = await service.render();

    expect(output).toContain('fiscora_http_requests_total');
    expect(output).toContain('route="/health"');
    expect(output).toContain('fiscora_database_up');
    expect(output).toContain('fiscora_database_up{application="fiscora-api"');
  });

  it('marks PostgreSQL unavailable when the probe fails', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as DataSource;
    const service = new MetricsService(dataSource);

    const output = await service.render();

    expect(output).toContain('fiscora_database_up');
    expect(output).toMatch(/fiscora_database_up\{[^}]*\} 0/);
  });

  it('builds an operational snapshot for the platform administrator', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ result: 1 }]),
    } as unknown as DataSource;
    const service = new MetricsService(dataSource);

    service.startRequest('GET', '/api/example');
    service.finishRequest('GET', '/api/example', 200, 0.02);
    service.startRequest('POST', '/api/example');
    service.finishRequest('POST', '/api/example', 500, 0.08);

    const snapshot = await service.operationalSnapshot();

    expect(snapshot.http.requestsTotal).toBe(2);
    expect(snapshot.http.errors5xx).toBe(1);
    expect(snapshot.http.errorRate).toBe(0.5);
    expect(snapshot.http.p95DurationMs).toBe(80);
    expect(snapshot.database.status).toBe('OPERATIONNEL');
    expect(snapshot.history).toHaveLength(60);
  });
});
