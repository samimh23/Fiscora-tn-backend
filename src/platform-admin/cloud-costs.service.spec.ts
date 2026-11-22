import { ConfigService } from '@nestjs/config';
import type { GoogleWifTokenService } from '../documents/extraction/google-wif-token.service';
import { CloudCostsService } from './cloud-costs.service';

jest.mock('@azure/identity', () => ({
  ManagedIdentityCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ token: 'azure-token' }),
  })),
  AzureCliCredential: jest.fn(),
}));

const google = {
  accessToken: jest.fn().mockResolvedValue('google-token'),
} as unknown as GoogleWifTokenService;

function json(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

describe('CloudCostsService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('reports both clouds as not configured without settings', async () => {
    global.fetch = jest.fn();
    const report = await new CloudCostsService(
      new ConfigService({}),
      google,
    ).report();
    expect(report.azure.status).toBe('NOT_CONFIGURED');
    expect(report.gcp.status).toBe('NOT_CONFIGURED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reads Azure month-to-date cost by service, the daily trend and last month', async () => {
    global.fetch = jest.fn((url: string, init: { body: string }) => {
      expect(url).toContain(
        '/subscriptions/s/resourceGroups/rg/providers/Microsoft.CostManagement/query',
      );
      const body = JSON.parse(init.body) as {
        timeframe: string;
        dataset: { granularity: string };
      };
      if (body.timeframe === 'MonthToDate')
        return Promise.resolve(
          json({
            properties: {
              columns: [
                { name: 'Cost' },
                { name: 'ServiceName' },
                { name: 'Currency' },
              ],
              rows: [
                [12.829, 'Azure Database for PostgreSQL', 'USD'],
                [36.05, 'Azure App Service', 'USD'],
                [0.0004, 'Key Vault', 'USD'],
              ],
            },
          }),
        );
      if (body.dataset.granularity === 'Daily')
        return Promise.resolve(
          json({
            properties: {
              columns: [
                { name: 'Cost' },
                { name: 'UsageDate' },
                { name: 'Currency' },
              ],
              rows: [
                [2.5, 20261122, 'USD'],
                [2.25, 20261121, 'USD'],
              ],
            },
          }),
        );
      return Promise.resolve(
        json({
          properties: {
            columns: [{ name: 'Cost' }, { name: 'Currency' }],
            rows: [[61.2, 'USD']],
          },
        }),
      );
    }) as unknown as typeof fetch;

    const { azure } = await new CloudCostsService(
      new ConfigService({
        AZURE_COST_SCOPE: '/subscriptions/s/resourceGroups/rg',
        AZURE_MONTHLY_BUDGET_USD: '40',
      }),
      google,
    ).report();

    expect(azure).toMatchObject({
      status: 'OK',
      currency: 'USD',
      monthToDate: 48.88,
      lastMonth: 61.2,
      monthlyBudget: 40,
      byService: [
        { name: 'Azure App Service', cost: 36.05 },
        { name: 'Azure Database for PostgreSQL', cost: 12.83 },
      ],
      daily: [
        { date: '2026-11-21', cost: 2.25 },
        { date: '2026-11-22', cost: 2.5 },
      ],
    });
  });

  it('waits for the Google billing export, then reads it from BigQuery', async () => {
    let exported = false;
    global.fetch = jest.fn((_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body) as { query: string };
      if (query.includes('INFORMATION_SCHEMA'))
        return Promise.resolve(
          json({
            jobComplete: true,
            rows: exported
              ? [{ f: [{ v: 'gcp_billing_export_v1_01E670' }] }]
              : [],
          }),
        );
      if (query.includes('service.description'))
        return Promise.resolve(
          json({
            jobComplete: true,
            rows: [
              {
                f: [
                  { v: 'fiscora-ai' },
                  { v: 'Cloud Run' },
                  { v: '20.456' },
                  { v: '-20.456' },
                  { v: 'USD' },
                ],
              },
            ],
          }),
        );
      if (query.includes('usage_start_time'))
        return Promise.resolve(
          json({
            jobComplete: true,
            rows: [{ f: [{ v: '2026-11-21' }, { v: '1.5' }] }],
          }),
        );
      return Promise.resolve(
        json({ jobComplete: true, rows: [{ f: [{ v: '33.1' }] }] }),
      );
    }) as unknown as typeof fetch;

    const service = new CloudCostsService(
      new ConfigService({
        GCP_BILLING_EXPORT_DATASET: 'fiscora-ai.billing_export',
      }),
      google,
    );
    expect((await service.report()).gcp.status).toBe('WAITING_FOR_EXPORT');

    exported = true;
    const { gcp } = await service.report();
    expect(gcp).toMatchObject({
      status: 'OK',
      currency: 'USD',
      monthToDate: 20.46,
      credits: -20.46,
      lastMonth: 33.1,
      byService: [{ name: 'Cloud Run', project: 'fiscora-ai', cost: 20.46 }],
      daily: [{ date: '2026-11-21', cost: 1.5 }],
    });
  });

  it('rejects a malformed dataset setting without calling BigQuery', async () => {
    global.fetch = jest.fn();
    const { gcp } = await new CloudCostsService(
      new ConfigService({ GCP_BILLING_EXPORT_DATASET: 'x; DROP' }),
      google,
    ).report();
    expect(gcp.status).toBe('ERROR');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
