import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AzureCliCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from '@azure/identity';
import { GoogleWifTokenService } from '../documents/extraction/google-wif-token.service';

export type CloudCostStatus =
  'OK' | 'NOT_CONFIGURED' | 'WAITING_FOR_EXPORT' | 'ERROR';

export interface CloudCostReport {
  provider: 'azure' | 'gcp';
  status: CloudCostStatus;
  scope: string | null;
  currency: string | null;
  monthToDate: number | null;
  /** Credits already deducted (GCP trial or promotions); negative or zero. */
  credits: number | null;
  lastMonth: number | null;
  monthlyBudget: number | null;
  byService: Array<{ name: string; project: string | null; cost: number }>;
  daily: Array<{ date: string; cost: number }>;
  refreshedAtUtc: string;
  message: string | null;
}

interface CostQueryResult {
  properties?: {
    columns?: Array<{ name: string }>;
    rows?: unknown[][];
  };
}

interface BigQueryResult {
  rows?: Array<{ f: Array<{ v: string | null }> }>;
  jobComplete?: boolean;
}

const CACHE_MS = 3 * 60 * 60 * 1000;

/**
 * Reads what the platform costs on each cloud. Azure comes from the Cost
 * Management API on the staging resource group; Google Cloud comes from the
 * billing export in BigQuery, which a billing administrator enables once.
 * Both sources lag by several hours, so results are cached for three hours.
 */
@Injectable()
export class CloudCostsService {
  private readonly logger = new Logger(CloudCostsService.name);
  private readonly cache = new Map<
    string,
    { report: CloudCostReport; atMs: number }
  >();
  private azureCredential: TokenCredential | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly googleTokens: GoogleWifTokenService,
  ) {}

  async report(refresh = false) {
    const [azure, gcp] = await Promise.all([
      this.cached('azure', refresh, () => this.azure()),
      this.cached('gcp', refresh, () => this.gcp()),
    ]);
    return { azure, gcp };
  }

  private async cached(
    key: string,
    refresh: boolean,
    load: () => Promise<CloudCostReport>,
  ) {
    const hit = this.cache.get(key);
    if (!refresh && hit && Date.now() - hit.atMs < CACHE_MS) return hit.report;
    const report = await load();
    // Keep failures briefly only, so a fixed setting shows up quickly.
    if (report.status === 'OK' || report.status === 'NOT_CONFIGURED')
      this.cache.set(key, { report, atMs: Date.now() });
    return report;
  }

  private empty(
    provider: 'azure' | 'gcp',
    status: CloudCostStatus,
    scope: string | null,
    message: string | null,
  ): CloudCostReport {
    return {
      provider,
      status,
      scope,
      currency: null,
      monthToDate: null,
      credits: null,
      lastMonth: null,
      monthlyBudget: this.budget(provider),
      byService: [],
      daily: [],
      refreshedAtUtc: new Date().toISOString(),
      message,
    };
  }

  private budget(provider: 'azure' | 'gcp') {
    const value = Number(
      this.config.get<string>(
        provider === 'azure'
          ? 'AZURE_MONTHLY_BUDGET_USD'
          : 'GCP_MONTHLY_BUDGET_USD',
      ),
    );
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  // ---------------------------------------------------------------- Azure

  private async azure(): Promise<CloudCostReport> {
    const scope = this.config.get<string>('AZURE_COST_SCOPE')?.trim();
    if (!scope)
      return this.empty(
        'azure',
        'NOT_CONFIGURED',
        null,
        'AZURE_COST_SCOPE is not set.',
      );
    try {
      const token = await this.azureToken();
      // One query at a time: Cost Management throttles parallel calls.
      const byService = await this.azureQuery(token, scope, {
        type: 'ActualCost',
        timeframe: 'MonthToDate',
        dataset: {
          granularity: 'None',
          aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
          grouping: [{ type: 'Dimension', name: 'ServiceName' }],
        },
      });
      const daily = await this.azureQuery(token, scope, {
        type: 'ActualCost',
        timeframe: 'Custom',
        timePeriod: {
          from: daysAgo(29).toISOString(),
          to: new Date().toISOString(),
        },
        dataset: {
          granularity: 'Daily',
          aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
        },
      });
      const lastMonth = await this.azureQuery(token, scope, {
        type: 'ActualCost',
        // TheLastMonth is rejected by the query API: give the dates.
        timeframe: 'Custom',
        timePeriod: previousMonth(),
        dataset: {
          granularity: 'None',
          aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
        },
      });
      const services = rowsOf(byService).map((row) => ({
        name: text(row.ServiceName) || 'Other',
        project: null,
        cost: Number(row.Cost ?? 0),
      }));
      const currency =
        text(rowsOf(byService)[0]?.Currency) ||
        text(rowsOf(daily)[0]?.Currency) ||
        null;
      return {
        provider: 'azure',
        status: 'OK',
        scope,
        currency,
        monthToDate: round(services.reduce((sum, item) => sum + item.cost, 0)),
        credits: null,
        lastMonth: round(Number(rowsOf(lastMonth)[0]?.Cost ?? 0)),
        monthlyBudget: this.budget('azure'),
        byService: services
          .filter((item) => item.cost >= 0.005)
          .map((item) => ({ ...item, cost: round(item.cost) }))
          .sort((left, right) => right.cost - left.cost),
        daily: rowsOf(daily)
          .map((row) => ({
            date: azureDate(row.UsageDate),
            cost: round(Number(row.Cost ?? 0)),
          }))
          .sort((left, right) => left.date.localeCompare(right.date)),
        refreshedAtUtc: new Date().toISOString(),
        message: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Azure cost query failed: ${message}`);
      return this.empty('azure', 'ERROR', scope, message.slice(0, 300));
    }
  }

  private async azureToken() {
    if (!this.azureCredential) {
      const localCli =
        this.config.get<string>('AZURE_LOCAL_CLI_AUTH') === 'true';
      if (localCli && this.config.get<string>('NODE_ENV') === 'production')
        throw new Error('AZURE_LOCAL_CLI_AUTH is for local development only.');
      const clientId = this.config.get<string>('AZURE_CLIENT_ID')?.trim();
      this.azureCredential = localCli
        ? new AzureCliCredential()
        : clientId
          ? new ManagedIdentityCredential(clientId)
          : new ManagedIdentityCredential();
    }
    const token = await this.azureCredential.getToken(
      'https://management.azure.com/.default',
    );
    if (!token?.token) throw new Error('No Azure management token.');
    return token.token;
  }

  private async azureQuery(token: string, scope: string, body: unknown) {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(
        `https://management.azure.com${scope}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (response.ok) return (await response.json()) as CostQueryResult;
      const detail = (await response.text()).slice(0, 200);
      if (response.status === 429 && attempt < 2) {
        // Azure says how long to wait; cap it so the admin page stays usable.
        const seconds = Number(
          response.headers.get(
            'x-ms-ratelimit-microsoft.costmanagement-entity-retry-after',
          ) ??
            response.headers.get('retry-after') ??
            5,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(Math.max(seconds, 1), 15) * 1000),
        );
        continue;
      }
      throw new Error(`Cost Management returned ${response.status}: ${detail}`);
    }
  }

  // ---------------------------------------------------------- Google Cloud

  private async gcp(): Promise<CloudCostReport> {
    const dataset = this.config
      .get<string>('GCP_BILLING_EXPORT_DATASET')
      ?.trim();
    if (!dataset)
      return this.empty(
        'gcp',
        'NOT_CONFIGURED',
        null,
        'GCP_BILLING_EXPORT_DATASET is not set.',
      );
    const [project, datasetId] = dataset.split('.');
    if (!project || !datasetId || !/^[\w-]+$/.test(project + datasetId))
      return this.empty(
        'gcp',
        'ERROR',
        dataset,
        'GCP_BILLING_EXPORT_DATASET must be "project.dataset".',
      );
    try {
      const token = await this.googleTokens.accessToken();
      const tables = await this.bigQuery(
        token,
        project,
        `SELECT table_name FROM \`${project}.${datasetId}\`.INFORMATION_SCHEMA.TABLES
         WHERE table_name LIKE 'gcp_billing_export_v1_%' ORDER BY table_name LIMIT 1`,
      );
      const table = tables[0]?.[0];
      if (!table)
        return this.empty(
          'gcp',
          'WAITING_FOR_EXPORT',
          dataset,
          'The billing export is not enabled yet, or Google has not written its first rows (this takes up to a day).',
        );
      const source = `\`${project}.${datasetId}.${table}\``;
      const credits =
        'IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)';
      const [services, daily, lastMonth] = await Promise.all([
        this.bigQuery(
          token,
          project,
          `SELECT project.id, service.description, SUM(cost), SUM(${credits}), ANY_VALUE(currency)
           FROM ${source}
           WHERE invoice.month = FORMAT_DATE('%Y%m', CURRENT_DATE())
           GROUP BY 1, 2 ORDER BY 3 DESC`,
        ),
        this.bigQuery(
          token,
          project,
          `SELECT FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time)), SUM(cost)
           FROM ${source}
           WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY)
           GROUP BY 1 ORDER BY 1`,
        ),
        this.bigQuery(
          token,
          project,
          `SELECT SUM(cost) FROM ${source}
           WHERE invoice.month = FORMAT_DATE('%Y%m', DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))`,
        ),
      ]);
      const byService = services.map((row) => ({
        name: String(row[1] ?? 'Other'),
        project: row[0] ?? null,
        cost: Number(row[2] ?? 0),
        credits: Number(row[3] ?? 0),
      }));
      return {
        provider: 'gcp',
        status: 'OK',
        scope: dataset,
        currency: services[0]?.[4] ?? null,
        monthToDate: round(byService.reduce((sum, item) => sum + item.cost, 0)),
        credits: round(byService.reduce((sum, item) => sum + item.credits, 0)),
        lastMonth:
          lastMonth[0]?.[0] == null ? null : round(Number(lastMonth[0][0])),
        monthlyBudget: this.budget('gcp'),
        byService: byService
          .filter((item) => item.cost >= 0.005)
          .map(({ name, project: id, cost }) => ({
            name,
            project: id,
            cost: round(cost),
          })),
        daily: daily.map((row) => ({
          date: String(row[0]),
          cost: round(Number(row[1] ?? 0)),
        })),
        refreshedAtUtc: new Date().toISOString(),
        message: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Google Cloud cost query failed: ${message}`);
      return this.empty('gcp', 'ERROR', dataset, message.slice(0, 300));
    }
  }

  private async bigQuery(token: string, project: string, query: string) {
    const response = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query, useLegacySql: false, timeoutMs: 20_000 }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(
        `BigQuery returned ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    const body = (await response.json()) as BigQueryResult;
    if (body.jobComplete === false)
      throw new Error('BigQuery did not finish the cost query in time.');
    return (body.rows ?? []).map((row) => row.f.map((cell) => cell.v));
  }
}

function rowsOf(result: CostQueryResult) {
  const columns = (result.properties?.columns ?? []).map(
    (column) => column.name,
  );
  return (result.properties?.rows ?? []).map((row) =>
    Object.fromEntries(columns.map((name, index) => [name, row[index]])),
  );
}

/** Cost Management returns dates as numbers such as 20261122. */
function azureDate(value: unknown) {
  const raw = text(value);
  return /^\d{8}$/.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw.slice(0, 10);
}

/** First and last day of the previous calendar month (UTC). */
function previousMonth() {
  const now = new Date();
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59),
  );
  return { from: from.toISOString(), to: to.toISOString() };
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

/** Cost Management cells are strings or numbers. */
function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
