import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../../../../common/database/prisma.service';
import type {
  AccountWindowComparison,
  CampaignPerformanceSnapshot,
  PerformanceAnalysisRunContext,
  PerformanceFeatureBundle,
  PerformanceMetricsSnapshot,
  SearchTermPerformanceSnapshot,
  SegmentationPerformanceSnapshot,
  SyncHealthSnapshot,
} from '../../domain/agents/performance-agent.types';

type NumericLike =
  | number
  | string
  | bigint
  | {
      toNumber(): number;
    }
  | null;

interface InsightRunRow {
  readonly insightRunId: bigint;
  readonly tenantId: bigint;
  readonly tenantName: string;
  readonly clientId: bigint;
  readonly clientName: string;
  readonly accountId: bigint | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly generatedBy: 'system' | 'user';
  readonly triggeredByUserId: bigint | null;
}

@Injectable()
export class PerformanceAgentFeatureReaderRepository {
  public constructor(private readonly prismaService: PrismaService) {}

  public async loadRunContext(
    analysisRunId: string,
  ): Promise<PerformanceAnalysisRunContext> {
    const rows = await this.prismaService.$queryRaw<InsightRunRow[]>`
      SELECT
        ir.id AS insightRunId,
        ir.tenant_id AS tenantId,
        t.name AS tenantName,
        ir.client_id AS clientId,
        c.name AS clientName,
        (
          SELECT a.id
          FROM google_ads_accounts a
          WHERE a.tenant_id = ir.tenant_id
            AND a.client_id = ir.client_id
          ORDER BY a.last_metric_sync_at DESC, a.id ASC
          LIMIT 1
        ) AS accountId,
        ir.period_start AS periodStart,
        ir.period_end AS periodEnd,
        ir.generated_by AS generatedBy,
        ir.triggered_by_user_id AS triggeredByUserId
      FROM insight_runs ir
      INNER JOIN tenants t
        ON t.id = ir.tenant_id
      INNER JOIN clients c
        ON c.id = ir.client_id
      WHERE ir.id = ${Number(analysisRunId)}
      LIMIT 1
    `;

    const row = rows[0];

    if (row === undefined) {
      throw new NotFoundException('analysis_run_id nao encontrado.');
    }

    const baselineWindow = buildPreviousWindow(
      formatDateOnly(row.periodStart),
      formatDateOnly(row.periodEnd),
    );

    return {
      analysisRunId,
      tenantId: String(Number(row.tenantId)),
      tenantName: row.tenantName,
      clientId: String(Number(row.clientId)),
      clientName: row.clientName,
      accountId:
        row.accountId === null ? null : String(Number(row.accountId)),
      periodStart: formatDateOnly(row.periodStart),
      periodEnd: formatDateOnly(row.periodEnd),
      baselineStart: baselineWindow.start,
      baselineEnd: baselineWindow.end,
      comparisonLabel: 'analysis_run vs baseline_window',
      triggeredByUserId:
        row.triggeredByUserId === null
          ? null
          : String(Number(row.triggeredByUserId)),
      generatedBy: row.generatedBy,
    };
  }

  public async loadFeatureBundle(
    runContext: PerformanceAnalysisRunContext,
  ): Promise<PerformanceFeatureBundle> {
    try {
      const [
        accountCurrent,
        accountBaseline,
        accountWindowComparisons,
        campaignsCurrent,
        campaignsBaseline,
        segmentationCurrent,
        segmentationBaseline,
        syncHealth,
      ] = await Promise.all([
        this.getAccountSummary(
          runContext.tenantId,
          runContext.clientId,
          runContext.periodStart,
          runContext.periodEnd,
        ),
        runContext.baselineStart === null || runContext.baselineEnd === null
          ? Promise.resolve(null)
          : this.getAccountSummary(
              runContext.tenantId,
              runContext.clientId,
              runContext.baselineStart,
              runContext.baselineEnd,
            ),
        this.getAccountWindowComparisons(
          runContext.tenantId,
          runContext.clientId,
          runContext.periodEnd,
        ),
        this.getCampaignSummaries(
          runContext.tenantId,
          runContext.clientId,
          runContext.periodStart,
          runContext.periodEnd,
        ),
        runContext.baselineStart === null || runContext.baselineEnd === null
          ? Promise.resolve([])
          : this.getCampaignSummaries(
              runContext.tenantId,
              runContext.clientId,
              runContext.baselineStart,
              runContext.baselineEnd,
            ),
        this.getSegmentationSnapshots(
          runContext.tenantId,
          runContext.clientId,
          runContext.periodStart,
          runContext.periodEnd,
        ),
        runContext.baselineStart === null || runContext.baselineEnd === null
          ? Promise.resolve([])
          : this.getSegmentationSnapshots(
              runContext.tenantId,
              runContext.clientId,
              runContext.baselineStart,
              runContext.baselineEnd,
            ),
        this.getSyncHealth(runContext.tenantId, runContext.clientId),
      ]);

      return {
        account_summary_current: accountCurrent,
        account_summary_baseline: accountBaseline,
        account_window_comparisons: accountWindowComparisons,
        campaign_summaries_current: campaignsCurrent,
        campaign_summaries_baseline: campaignsBaseline,
        segmentation_rows_current: segmentationCurrent,
        segmentation_rows_baseline: segmentationBaseline,
        search_terms_available: false,
        search_term_rows_current: [],
        search_term_rows_baseline: [],
        sync_health: syncHealth,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Nao foi possivel carregar as features locais do analysis run.',
      );
    }
  }

  private async getAccountSummary(
    tenantId: string,
    clientId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<PerformanceMetricsSnapshot | null> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        spend: NumericLike;
        impressions: bigint | null;
        clicks: bigint | null;
        conversions: NumericLike;
        conversionValue: NumericLike;
      }>
    >`
      SELECT
        SUM(cost_micros) / 1000000 AS spend,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(conversions) AS conversions,
        SUM(conversions_value) AS conversionValue
      FROM fact_google_ads_account_daily
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
        AND report_date BETWEEN ${periodStart} AND ${periodEnd}
    `;

    return buildMetricsSnapshot(rows[0]);
  }

  private async getCampaignSummaries(
    tenantId: string,
    clientId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<CampaignPerformanceSnapshot[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        campaignId: bigint;
        campaignName: string;
        status: string;
        spend: NumericLike;
        impressions: bigint | null;
        clicks: bigint | null;
        conversions: NumericLike;
        conversionValue: NumericLike;
        searchImpressionShare: NumericLike;
      }>
    >`
      SELECT
        d.google_campaign_id AS campaignId,
        d.name AS campaignName,
        d.status AS status,
        SUM(f.cost_micros) / 1000000 AS spend,
        SUM(f.impressions) AS impressions,
        SUM(f.clicks) AS clicks,
        SUM(f.conversions) AS conversions,
        SUM(f.conversions_value) AS conversionValue,
        AVG(f.search_impression_share) AS searchImpressionShare
      FROM fact_google_ads_campaign_daily f
      INNER JOIN dim_campaigns d
        ON d.tenant_id = f.tenant_id
       AND d.google_ads_account_id = f.google_ads_account_id
       AND d.google_campaign_id = f.google_campaign_id
      WHERE f.tenant_id = ${Number(tenantId)}
        AND f.client_id = ${Number(clientId)}
        AND f.report_date BETWEEN ${periodStart} AND ${periodEnd}
      GROUP BY d.google_campaign_id, d.name, d.status
      ORDER BY SUM(f.cost_micros) DESC
    `;

    return rows.map((row) => {
      const metrics = buildMetricsSnapshot(row);

      return {
        campaignId: String(Number(row.campaignId)),
        campaignName: row.campaignName,
        status: row.status,
        spend: metrics?.spend ?? 0,
        impressions: metrics?.impressions ?? 0,
        clicks: metrics?.clicks ?? 0,
        conversions: metrics?.conversions ?? 0,
        conversionValue: metrics?.conversionValue ?? 0,
        ctr: metrics?.ctr ?? null,
        cpa: metrics?.cpa ?? null,
        roas: metrics?.roas ?? null,
        searchImpressionShare: decimalOrNull(row.searchImpressionShare),
      };
    });
  }

  private async getAccountWindowComparisons(
    tenantId: string,
    clientId: string,
    anchorDate: string,
  ): Promise<AccountWindowComparison[]> {
    const windows = [7, 14, 30] as const;

    const comparisons = await Promise.all(
      windows.map(async (days) => {
        const currentWindow = buildTrailingWindow(anchorDate, days);
        const baselineWindow = buildPreviousWindow(
          currentWindow.start,
          currentWindow.end,
        );
        const [current, baseline] = await Promise.all([
          this.getAccountSummary(
            tenantId,
            clientId,
            currentWindow.start,
            currentWindow.end,
          ),
          this.getAccountSummary(
            tenantId,
            clientId,
            baselineWindow.start,
            baselineWindow.end,
          ),
        ]);

        return {
          windowLabel: `last_${days}d`,
          sampleDays: days,
          current,
          baseline,
        } satisfies AccountWindowComparison;
      }),
    );

    return comparisons;
  }

  private async getSegmentationSnapshots(
    tenantId: string,
    clientId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<SegmentationPerformanceSnapshot[]> {
    const [deviceRows, geoRows, hourlyRows] = await Promise.all([
      this.prismaService.$queryRaw<
        Array<{
          campaignId: bigint;
          campaignName: string;
          dimensionValue: string;
          spend: NumericLike;
          impressions: bigint | null;
          clicks: bigint | null;
          conversions: NumericLike;
          conversionValue: NumericLike;
        }>
      >`
        SELECT
          d.google_campaign_id AS campaignId,
          d.name AS campaignName,
          f.device_type AS dimensionValue,
          SUM(f.cost_micros) / 1000000 AS spend,
          SUM(f.impressions) AS impressions,
          SUM(f.clicks) AS clicks,
          SUM(f.conversions) AS conversions,
          SUM(f.conversions_value) AS conversionValue
        FROM fact_google_ads_campaign_device_daily f
        INNER JOIN dim_campaigns d
          ON d.tenant_id = f.tenant_id
         AND d.google_ads_account_id = f.google_ads_account_id
         AND d.google_campaign_id = f.google_campaign_id
        WHERE f.tenant_id = ${Number(tenantId)}
          AND f.client_id = ${Number(clientId)}
          AND f.report_date BETWEEN ${periodStart} AND ${periodEnd}
        GROUP BY d.google_campaign_id, d.name, f.device_type
      `,
      this.prismaService.$queryRaw<
        Array<{
          campaignId: bigint;
          campaignName: string;
          dimensionValue: string;
          spend: NumericLike;
          impressions: bigint | null;
          clicks: bigint | null;
          conversions: NumericLike;
          conversionValue: NumericLike;
        }>
      >`
        SELECT
          d.google_campaign_id AS campaignId,
          d.name AS campaignName,
          f.geo_label AS dimensionValue,
          SUM(f.cost_micros) / 1000000 AS spend,
          SUM(f.impressions) AS impressions,
          SUM(f.clicks) AS clicks,
          SUM(f.conversions) AS conversions,
          SUM(f.conversions_value) AS conversionValue
        FROM fact_google_ads_campaign_geo_daily f
        INNER JOIN dim_campaigns d
          ON d.tenant_id = f.tenant_id
         AND d.google_ads_account_id = f.google_ads_account_id
         AND d.google_campaign_id = f.google_campaign_id
        WHERE f.tenant_id = ${Number(tenantId)}
          AND f.client_id = ${Number(clientId)}
          AND f.report_date BETWEEN ${periodStart} AND ${periodEnd}
        GROUP BY d.google_campaign_id, d.name, f.geo_label
      `,
      this.prismaService.$queryRaw<
        Array<{
          campaignId: bigint;
          campaignName: string;
          dimensionValue: bigint;
          spend: NumericLike;
          impressions: bigint | null;
          clicks: bigint | null;
          conversions: NumericLike;
          conversionValue: NumericLike;
        }>
      >`
        SELECT
          d.google_campaign_id AS campaignId,
          d.name AS campaignName,
          f.hour_of_day AS dimensionValue,
          SUM(f.cost_micros) / 1000000 AS spend,
          SUM(f.impressions) AS impressions,
          SUM(f.clicks) AS clicks,
          SUM(f.conversions) AS conversions,
          SUM(f.conversions_value) AS conversionValue
        FROM fact_google_ads_campaign_hourly f
        INNER JOIN dim_campaigns d
          ON d.tenant_id = f.tenant_id
         AND d.google_ads_account_id = f.google_ads_account_id
         AND d.google_campaign_id = f.google_campaign_id
        WHERE f.tenant_id = ${Number(tenantId)}
          AND f.client_id = ${Number(clientId)}
          AND f.report_date BETWEEN ${periodStart} AND ${periodEnd}
        GROUP BY d.google_campaign_id, d.name, f.hour_of_day
      `,
    ]);

    return [
      ...deviceRows.map((row) =>
        buildSegmentationSnapshot(row, 'device', row.dimensionValue),
      ),
      ...geoRows.map((row) =>
        buildSegmentationSnapshot(row, 'geo', row.dimensionValue),
      ),
      ...hourlyRows.map((row) =>
        buildSegmentationSnapshot(
          row,
          'schedule',
          `${String(Number(row.dimensionValue)).padStart(2, '0')}:00`,
        ),
      ),
    ];
  }

  private async getSyncHealth(
    tenantId: string,
    clientId: string,
  ): Promise<SyncHealthSnapshot | null> {
    const [summaryRows, statusRows] = await Promise.all([
      this.prismaService.$queryRaw<
        Array<{
          lastSuccessfulSyncAt: Date | null;
          lastFailedSyncAt: Date | null;
        }>
      >`
        SELECT
          MAX(CASE WHEN status = 'succeeded' THEN finished_at END) AS lastSuccessfulSyncAt,
          MAX(CASE WHEN status = 'failed' THEN finished_at END) AS lastFailedSyncAt
        FROM sync_runs
        WHERE tenant_id = ${Number(tenantId)}
          AND client_id = ${Number(clientId)}
      `,
      this.prismaService.$queryRaw<
        Array<{
          queuedJobs: bigint | null;
          failedJobs: bigint | null;
          openIssues: bigint | null;
        }>
      >`
        SELECT
          SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queuedJobs,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedJobs,
          SUM(CASE WHEN status IN ('failed', 'partial') THEN 1 ELSE 0 END) AS openIssues
        FROM sync_jobs
        WHERE tenant_id = ${Number(tenantId)}
          AND client_id = ${Number(clientId)}
      `,
    ]);

    const summary = summaryRows[0];
    const status = statusRows[0];

    if (summary === undefined || status === undefined) {
      return null;
    }

    const lastSuccessAgeHours =
      summary.lastSuccessfulSyncAt === null
        ? Number.POSITIVE_INFINITY
        : (Date.now() - summary.lastSuccessfulSyncAt.getTime()) / 3_600_000;

    return {
      overallStatus:
        lastSuccessAgeHours <= 6
          ? 'healthy'
          : lastSuccessAgeHours <= 18
            ? 'warning'
            : 'stale',
      lastSuccessfulSyncAt:
        summary.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastFailedSyncAt: summary.lastFailedSyncAt?.toISOString() ?? null,
      queuedJobs: bigintToNumber(status.queuedJobs),
      failedJobs: bigintToNumber(status.failedJobs),
      openIssues: bigintToNumber(status.openIssues),
    };
  }
}

function buildMetricsSnapshot(
  row:
    | {
        spend: NumericLike;
        impressions: bigint | null;
        clicks: bigint | null;
        conversions: NumericLike;
        conversionValue: NumericLike;
      }
    | undefined,
): PerformanceMetricsSnapshot | null {
  if (row === undefined || row.spend === null) {
    return null;
  }

  const spend = decimalToNumber(row.spend);
  const impressions = bigintToNumber(row.impressions);
  const clicks = bigintToNumber(row.clicks);
  const conversions = decimalToNumber(row.conversions);
  const conversionValue = decimalToNumber(row.conversionValue);

  return {
    spend,
    impressions,
    clicks,
    conversions,
    conversionValue,
    ctr: impressions > 0 ? roundNumber(clicks / impressions, 4) : null,
    cpa: conversions > 0 ? roundNumber(spend / conversions, 2) : null,
    roas: spend > 0 ? roundNumber(conversionValue / spend, 2) : null,
  };
}

function buildSegmentationSnapshot(
  row: {
    campaignId: bigint;
    campaignName: string;
    spend: NumericLike;
    impressions: bigint | null;
    clicks: bigint | null;
    conversions: NumericLike;
    conversionValue: NumericLike;
  },
  dimension: 'device' | 'geo' | 'schedule',
  dimensionValue: string,
): SegmentationPerformanceSnapshot {
  const metrics = buildMetricsSnapshot(row);

  return {
    campaignId: String(Number(row.campaignId)),
    campaignName: row.campaignName,
    dimension,
    dimensionValue,
    spend: metrics?.spend ?? 0,
    impressions: metrics?.impressions ?? 0,
    clicks: metrics?.clicks ?? 0,
    conversions: metrics?.conversions ?? 0,
    conversionValue: metrics?.conversionValue ?? 0,
    ctr: metrics?.ctr ?? null,
    cpa: metrics?.cpa ?? null,
    roas: metrics?.roas ?? null,
  };
}

function decimalToNumber(value: NumericLike): number {
  if (value === null) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return value.toNumber();
}

function decimalOrNull(value: NumericLike): number | null {
  return value === null ? null : roundNumber(decimalToNumber(value), 4);
}

function bigintToNumber(value: bigint | null): number {
  return value === null ? 0 : Number(value);
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildPreviousWindow(
  periodStart: string,
  periodEnd: string,
): { readonly start: string; readonly end: string } {
  const currentStart = new Date(`${periodStart}T00:00:00.000Z`);
  const currentEnd = new Date(`${periodEnd}T00:00:00.000Z`);
  const dayCount =
    Math.round((currentEnd.getTime() - currentStart.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousEnd.getDate() - (dayCount - 1));

  return {
    start: formatDateOnly(previousStart),
    end: formatDateOnly(previousEnd),
  };
}

function buildTrailingWindow(
  anchorDate: string,
  dayCount: number,
): { readonly start: string; readonly end: string } {
  const end = new Date(`${anchorDate}T00:00:00.000Z`);
  const start = new Date(end);
  start.setDate(end.getDate() - (dayCount - 1));

  return {
    start: formatDateOnly(start),
    end: formatDateOnly(end),
  };
}
