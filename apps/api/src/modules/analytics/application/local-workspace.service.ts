import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  LocalWorkspaceCampaignItem,
  LocalWorkspaceClientOption,
  LocalWorkspaceConnectionItem,
  LocalWorkspaceDailyPoint,
  LocalWorkspaceInsightItem,
  LocalWorkspaceMetricCard,
  LocalWorkspacePeriod,
  LocalWorkspaceReportItem,
  LocalWorkspaceSyncHealth,
  LocalWorkspaceTenantOption,
  LocalWorkspaceView,
} from '@googleads/shared';

import { PrismaService } from '../../../common/database/prisma.service';
import { LocalOptimizationAgentService } from './local-optimization-agent.service';

interface WorkspaceQueryInput {
  readonly tenantSlug?: string | undefined;
  readonly clientId?: string | undefined;
  readonly period: LocalWorkspacePeriod;
}

interface TenantRow {
  readonly tenantId: bigint;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly status: 'active' | 'suspended' | 'pending';
  readonly clientCount: bigint;
}

interface ClientRow {
  readonly clientId: bigint;
  readonly clientName: string;
  readonly status: 'active' | 'paused' | 'archived';
  readonly accountCount: bigint;
  readonly lastMetricSyncAt: Date | null;
}

type NumericLike =
  | number
  | string
  | bigint
  | {
      toNumber(): number;
    }
  | null;

@Injectable()
export class LocalWorkspaceService {
  private readonly currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });

  public constructor(
    private readonly prismaService: PrismaService,
    private readonly localOptimizationAgentService: LocalOptimizationAgentService,
  ) {}

  public async getWorkspaceView(
    input: WorkspaceQueryInput,
  ): Promise<LocalWorkspaceView> {
    try {
      const availableTenants = await this.getAvailableTenants();

      if (availableTenants.length === 0) {
        return emptyWorkspaceView();
      }

      const selectedTenant =
        input.tenantSlug === undefined
          ? availableTenants[0]
          : availableTenants.find((tenant) => tenant.tenantSlug === input.tenantSlug);

      if (selectedTenant === undefined) {
        throw new NotFoundException(
          'Tenant de demonstracao nao encontrado para este ambiente local.',
        );
      }

      const availableClients = await this.getAvailableClients(selectedTenant.tenantId);

      if (availableClients.length === 0) {
        return {
          ...emptyWorkspaceView(),
          availableTenants,
        };
      }

      const selectedClient =
        input.clientId === undefined
          ? availableClients[0]
          : availableClients.find((client) => client.clientId === input.clientId);

      if (selectedClient === undefined) {
        throw new NotFoundException(
          'Cliente de demonstracao nao pertence ao tenant selecionado.',
        );
      }

      const latestReportDate = await this.getLatestReportDate(
        selectedTenant.tenantId,
        selectedClient.clientId,
      );
      const seedMetadata = await this.getSeedMetadata(selectedTenant.tenantId);
      const periodWindow =
        latestReportDate === null
          ? null
          : buildPeriodWindow(latestReportDate, input.period);
      const previousWindow =
        periodWindow === null ? null : buildPreviousWindow(periodWindow);

      const [
        currentTotals,
        previousTotals,
        dailySeries,
        topCampaigns,
        insights,
        optimizationAgent,
        reports,
        connections,
        syncHealth,
      ] = await Promise.all([
        periodWindow === null
          ? Promise.resolve(null)
          : this.getTotals(selectedTenant.tenantId, selectedClient.clientId, periodWindow),
        previousWindow === null
          ? Promise.resolve(null)
          : this.getTotals(
              selectedTenant.tenantId,
              selectedClient.clientId,
              previousWindow,
            ),
        periodWindow === null
          ? Promise.resolve([])
          : this.getDailySeries(
              selectedTenant.tenantId,
              selectedClient.clientId,
              periodWindow,
            ),
        periodWindow === null
          ? Promise.resolve([])
          : this.getTopCampaigns(
              selectedTenant.tenantId,
              selectedClient.clientId,
              periodWindow,
            ),
        this.getInsights(selectedTenant.tenantId, selectedClient.clientId),
        periodWindow === null || previousWindow === null
          ? Promise.resolve(null)
          : this.localOptimizationAgentService.buildAgentView({
              tenantId: selectedTenant.tenantId,
              clientId: selectedClient.clientId,
              clientName: selectedClient.clientName,
              period: input.period,
              periodWindow,
              previousWindow,
            }),
        this.getReports(selectedTenant.tenantId, selectedClient.clientId),
        this.getConnections(selectedTenant.tenantId, selectedClient.clientId),
        this.getSyncHealth(selectedTenant.tenantId, selectedClient.clientId),
      ]);

      return {
        availableTenants,
        availableClients,
        context: {
          tenantId: selectedTenant.tenantId,
          tenantSlug: selectedTenant.tenantSlug,
          tenantName: selectedTenant.tenantName,
          clientId: selectedClient.clientId,
          clientName: selectedClient.clientName,
          period: input.period,
          periodStart: periodWindow?.start ?? null,
          periodEnd: periodWindow?.end ?? null,
          lastSeededAt: seedMetadata.lastSeededAt,
        },
        metricCards: buildMetricCards(
          currentTotals,
          previousTotals,
          syncHealth,
          input.period,
          this.currencyFormatter,
        ),
        dailySeries,
        topCampaigns,
        insights,
        optimizationAgent,
        reports,
        connections,
        syncHealth,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Nao foi possivel ler os dados locais. Confirme se o MySQL esta ativo e se a base foi populada.',
      );
    }
  }

  private async getAvailableTenants(): Promise<LocalWorkspaceTenantOption[]> {
    const rows = await this.prismaService.$queryRaw<TenantRow[]>`
      SELECT
        t.id AS tenantId,
        t.slug AS tenantSlug,
        t.name AS tenantName,
        t.status AS status,
        COUNT(c.id) AS clientCount
      FROM tenants t
      LEFT JOIN clients c
        ON c.tenant_id = t.id
       AND c.status <> 'archived'
      WHERE t.plan_code = 'local-demo'
      GROUP BY t.id, t.slug, t.name, t.status
      ORDER BY t.name ASC
    `;

    return rows.map((row: TenantRow) => ({
      tenantId: String(Number(row.tenantId)),
      tenantSlug: row.tenantSlug,
      tenantName: row.tenantName,
      status: row.status,
      clientCount: Number(row.clientCount),
    }));
  }

  private async getAvailableClients(
    tenantId: string,
  ): Promise<LocalWorkspaceClientOption[]> {
    const rows = await this.prismaService.$queryRaw<ClientRow[]>`
      SELECT
        c.id AS clientId,
        c.name AS clientName,
        c.status AS status,
        COUNT(DISTINCT a.id) AS accountCount,
        MAX(a.last_metric_sync_at) AS lastMetricSyncAt
      FROM clients c
      LEFT JOIN google_ads_accounts a
        ON a.client_id = c.id
       AND a.tenant_id = c.tenant_id
      WHERE c.tenant_id = ${Number(tenantId)}
        AND c.status <> 'archived'
      GROUP BY c.id, c.name, c.status
      ORDER BY c.name ASC
    `;

    return rows.map((row: ClientRow) => ({
      clientId: String(Number(row.clientId)),
      clientName: row.clientName,
      status: row.status,
      accountCount: Number(row.accountCount),
      lastMetricSyncAt: row.lastMetricSyncAt?.toISOString() ?? null,
    }));
  }

  private async getLatestReportDate(
    tenantId: string,
    clientId: string,
  ): Promise<string | null> {
    const rows = await this.prismaService.$queryRaw<Array<{ latestReportDate: Date | null }>>`
      SELECT MAX(report_date) AS latestReportDate
      FROM agg_client_kpi_daily
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
    `;

    return rows[0]?.latestReportDate === null || rows[0]?.latestReportDate === undefined
      ? null
      : formatDateOnly(rows[0].latestReportDate);
  }

  private async getSeedMetadata(
    tenantId: string,
  ): Promise<{ readonly lastSeededAt: string | null }> {
    const rows = await this.prismaService.$queryRaw<Array<{ lastSeededAt: Date | null }>>`
      SELECT MAX(created_at) AS lastSeededAt
      FROM agg_client_kpi_daily
      WHERE tenant_id = ${Number(tenantId)}
    `;

    return {
      lastSeededAt: rows[0]?.lastSeededAt?.toISOString() ?? null,
    };
  }

  private async getTotals(
    tenantId: string,
    clientId: string,
    periodWindow: { readonly start: string; readonly end: string },
  ): Promise<{
    readonly spend: number;
    readonly impressions: number;
    readonly clicks: number;
    readonly conversions: number;
    readonly conversionsValue: number;
    readonly roas: number | null;
  } | null> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        spend: NumericLike;
        impressions: bigint | null;
        clicks: bigint | null;
        conversions: NumericLike;
        conversionsValue: NumericLike;
      }>
    >`
      SELECT
        SUM(spend) AS spend,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(conversions) AS conversions,
        SUM(conversions_value) AS conversionsValue
      FROM agg_client_kpi_daily
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
        AND report_date BETWEEN ${periodWindow.start} AND ${periodWindow.end}
    `;

    const row = rows[0];

    if (row === undefined || row.spend === null) {
      return null;
    }

    const spend = decimalToNumber(row.spend);
    const conversionsValue = decimalToNumber(row.conversionsValue);

    return {
      spend,
      impressions: bigintToNumber(row.impressions),
      clicks: bigintToNumber(row.clicks),
      conversions: decimalToNumber(row.conversions),
      conversionsValue,
      roas: spend > 0 ? roundNumber(conversionsValue / spend, 2) : null,
    };
  }

  private async getDailySeries(
    tenantId: string,
    clientId: string,
    periodWindow: { readonly start: string; readonly end: string },
  ): Promise<LocalWorkspaceDailyPoint[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        reportDate: Date;
        spend: NumericLike;
        conversions: NumericLike;
        conversionsValue: NumericLike;
        roas: NumericLike;
      }>
    >`
      SELECT
        report_date AS reportDate,
        spend,
        conversions,
        conversions_value AS conversionsValue,
        roas
      FROM agg_client_kpi_daily
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
        AND report_date BETWEEN ${periodWindow.start} AND ${periodWindow.end}
      ORDER BY report_date ASC
    `;

    return rows.map((row: {
      reportDate: Date;
      spend: NumericLike;
      conversions: NumericLike;
      conversionsValue: NumericLike;
      roas: NumericLike;
    }) => ({
      date: formatDateOnly(row.reportDate),
      spend: decimalToNumber(row.spend),
      conversions: decimalToNumber(row.conversions),
      conversionsValue: decimalToNumber(row.conversionsValue),
      roas: decimalOrNull(row.roas),
    }));
  }

  private async getTopCampaigns(
    tenantId: string,
    clientId: string,
    periodWindow: { readonly start: string; readonly end: string },
  ): Promise<LocalWorkspaceCampaignItem[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        googleCampaignId: bigint;
        campaignName: string;
        status: string;
        spend: NumericLike;
        conversions: NumericLike;
        conversionsValue: NumericLike;
        clicks: bigint;
        impressions: bigint;
        searchImpressionShare: NumericLike;
      }>
    >`
      SELECT
        d.google_campaign_id AS googleCampaignId,
        d.name AS campaignName,
        d.status AS status,
        SUM(f.cost_micros) / 1000000 AS spend,
        SUM(f.conversions) AS conversions,
        SUM(f.conversions_value) AS conversionsValue,
        SUM(f.clicks) AS clicks,
        SUM(f.impressions) AS impressions,
        AVG(f.search_impression_share) AS searchImpressionShare
      FROM fact_google_ads_campaign_daily f
      INNER JOIN dim_campaigns d
        ON d.tenant_id = f.tenant_id
       AND d.google_ads_account_id = f.google_ads_account_id
       AND d.google_campaign_id = f.google_campaign_id
      WHERE f.tenant_id = ${Number(tenantId)}
        AND f.client_id = ${Number(clientId)}
        AND f.report_date BETWEEN ${periodWindow.start} AND ${periodWindow.end}
      GROUP BY d.google_campaign_id, d.name, d.status
      ORDER BY SUM(f.conversions_value) DESC, SUM(f.cost_micros) DESC
      LIMIT 5
    `;

    return rows.map((row: {
      googleCampaignId: bigint;
      campaignName: string;
      status: string;
      spend: NumericLike;
      conversions: NumericLike;
      conversionsValue: NumericLike;
      clicks: bigint;
      impressions: bigint;
      searchImpressionShare: NumericLike;
    }) => {
      const spend = decimalToNumber(row.spend);
      const conversions = decimalToNumber(row.conversions);
      const conversionsValue = decimalToNumber(row.conversionsValue);
      const clicks = bigintToNumber(row.clicks);
      const impressions = bigintToNumber(row.impressions);

      return {
        campaignId: String(Number(row.googleCampaignId)),
        campaignName: row.campaignName,
        status: row.status,
        spend,
        conversions,
        conversionValue: conversionsValue,
        ctr: impressions > 0 ? roundNumber(clicks / impressions, 4) : null,
        cpa: conversions > 0 ? roundNumber(spend / conversions, 2) : null,
        roas: spend > 0 ? roundNumber(conversionsValue / spend, 2) : null,
        searchImpressionShare: decimalOrNull(row.searchImpressionShare),
      };
    });
  }

  private async getInsights(
    tenantId: string,
    clientId: string,
  ): Promise<LocalWorkspaceInsightItem[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        insightId: bigint;
        title: string;
        category: string;
        severity: 'info' | 'warning' | 'critical';
        priority: 'low' | 'medium' | 'high' | 'critical';
        priorityScore: NumericLike;
        confidenceScore: NumericLike;
        summary: string;
        recommendedAction: string;
        generatedAt: Date;
      }>
    >`
      SELECT
        id AS insightId,
        title,
        category,
        severity,
        priority,
        priority_score AS priorityScore,
        confidence AS confidenceScore,
        summary,
        recommendation_action AS recommendedAction,
        generated_at AS generatedAt
      FROM insights
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
        AND status = 'open'
      ORDER BY priority_score DESC, generated_at DESC
      LIMIT 6
    `;

    return rows.map((row: {
      insightId: bigint;
      title: string;
      category: string;
      severity: 'info' | 'warning' | 'critical';
      priority: 'low' | 'medium' | 'high' | 'critical';
      priorityScore: NumericLike;
      confidenceScore: NumericLike;
      summary: string;
      recommendedAction: string;
      generatedAt: Date;
    }) => ({
      insightId: String(Number(row.insightId)),
      title: row.title,
      category: row.category,
      severity: row.severity,
      priority: row.priority,
      priorityScore: decimalToNumber(row.priorityScore),
      confidenceScore: decimalToNumber(row.confidenceScore),
      summary: row.summary,
      recommendedAction: row.recommendedAction,
      generatedAt: row.generatedAt.toISOString(),
    }));
  }

  private async getReports(
    tenantId: string,
    clientId: string,
  ): Promise<LocalWorkspaceReportItem[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        reportId: bigint;
        periodStart: Date;
        periodEnd: Date;
        audienceLevel: 'executive' | 'marketing' | 'technical';
        outputFormat: 'pptx' | 'pdf' | 'html';
        status: 'queued' | 'generating' | 'ready' | 'failed';
        storagePath: string | null;
        summaryJson: string | null;
        generatedAt: Date | null;
      }>
    >`
      SELECT
        id AS reportId,
        period_start AS periodStart,
        period_end AS periodEnd,
        audience_level AS audienceLevel,
        output_format AS outputFormat,
        status,
        storage_path AS storagePath,
        summary_json AS summaryJson,
        generated_at AS generatedAt
      FROM executive_reports
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
      ORDER BY COALESCE(generated_at, created_at) DESC
      LIMIT 6
    `;

    return rows.map((row: {
      reportId: bigint;
      periodStart: Date;
      periodEnd: Date;
      audienceLevel: 'executive' | 'marketing' | 'technical';
      outputFormat: 'pptx' | 'pdf' | 'html';
      status: 'queued' | 'generating' | 'ready' | 'failed';
      storagePath: string | null;
      summaryJson: string | null;
      generatedAt: Date | null;
    }) => ({
      reportId: String(Number(row.reportId)),
      periodLabel: `${formatDateOnly(row.periodStart)} a ${formatDateOnly(row.periodEnd)}`,
      audienceLevel: row.audienceLevel,
      outputFormat: row.outputFormat,
      status: row.status,
      generatedAt: row.generatedAt?.toISOString() ?? null,
      storagePath: row.storagePath,
      headline: readHeadline(row.summaryJson),
    }));
  }

  private async getConnections(
    tenantId: string,
    clientId: string,
  ): Promise<LocalWorkspaceConnectionItem[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        accountId: bigint;
        customerId: bigint;
        customerName: string | null;
        descriptiveName: string | null;
        connectionStatus: 'active' | 'paused' | 'revoked' | 'error';
        accountStatus: 'active' | 'paused' | 'removed' | 'disconnected';
        syncFrequencyMinutes: number;
        lastMetricSyncAt: Date | null;
      }>
    >`
      SELECT
        a.id AS accountId,
        a.customer_id AS customerId,
        a.customer_name AS customerName,
        a.descriptive_name AS descriptiveName,
        c.status AS connectionStatus,
        a.status AS accountStatus,
        c.sync_frequency_minutes AS syncFrequencyMinutes,
        a.last_metric_sync_at AS lastMetricSyncAt
      FROM google_ads_accounts a
      INNER JOIN google_ads_connections c
        ON c.id = a.connection_id
      WHERE a.tenant_id = ${Number(tenantId)}
        AND a.client_id = ${Number(clientId)}
      ORDER BY a.customer_name ASC
    `;

    return rows.map((row: {
      accountId: bigint;
      customerId: bigint;
      customerName: string | null;
      descriptiveName: string | null;
      connectionStatus: 'active' | 'paused' | 'revoked' | 'error';
      accountStatus: 'active' | 'paused' | 'removed' | 'disconnected';
      syncFrequencyMinutes: number;
      lastMetricSyncAt: Date | null;
    }) => ({
      accountId: String(Number(row.accountId)),
      customerId: String(Number(row.customerId)),
      customerName: row.customerName ?? 'Conta Google Ads',
      descriptiveName: row.descriptiveName ?? 'Sem nome descritivo',
      connectionStatus: row.connectionStatus,
      accountStatus: row.accountStatus,
      syncFrequencyMinutes: row.syncFrequencyMinutes,
      lastMetricSyncAt: row.lastMetricSyncAt?.toISOString() ?? null,
    }));
  }

  private async getSyncHealth(
    tenantId: string,
    clientId: string,
  ): Promise<LocalWorkspaceSyncHealth | null> {
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
          queuedJobs: bigint;
          failedJobs: bigint;
          openIssues: bigint;
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

    const queuedJobs = bigintToNumber(status.queuedJobs);
    const failedJobs = bigintToNumber(status.failedJobs);
    const openIssues = bigintToNumber(status.openIssues);
    const lastSuccessfulSyncAt = summary.lastSuccessfulSyncAt?.toISOString() ?? null;
    const lastSuccessAgeHours =
      summary.lastSuccessfulSyncAt === null
        ? Number.POSITIVE_INFINITY
        : (Date.now() - summary.lastSuccessfulSyncAt.getTime()) / 3_600_000;
    const overallStatus =
      lastSuccessAgeHours <= 6 && failedJobs === 0
        ? 'healthy'
        : lastSuccessAgeHours <= 18
          ? 'warning'
          : 'stale';

    return {
      overallStatus,
      lastSuccessfulSyncAt,
      lastFailedSyncAt: summary.lastFailedSyncAt?.toISOString() ?? null,
      queuedJobs,
      failedJobs,
      openIssues,
      summary:
        overallStatus === 'healthy'
          ? 'Sincronizacao em ritmo saudavel para o ambiente local.'
          : overallStatus === 'warning'
            ? 'Existe pelo menos uma falha recente simulada para validar observabilidade.'
            : 'A base esta desatualizada. Rode um novo seed local ou revise os jobs.',
    };
  }
}

function emptyWorkspaceView(): LocalWorkspaceView {
  return {
    availableTenants: [],
    availableClients: [],
    context: null,
    metricCards: [],
    dailySeries: [],
    topCampaigns: [],
    insights: [],
    optimizationAgent: null,
    reports: [],
    connections: [],
    syncHealth: null,
  };
}

function buildMetricCards(
  currentTotals: {
    readonly spend: number;
    readonly impressions: number;
    readonly clicks: number;
    readonly conversions: number;
    readonly conversionsValue: number;
    readonly roas: number | null;
  } | null,
  previousTotals: {
    readonly spend: number;
    readonly impressions: number;
    readonly clicks: number;
    readonly conversions: number;
    readonly conversionsValue: number;
    readonly roas: number | null;
  } | null,
  syncHealth: LocalWorkspaceSyncHealth | null,
  period: LocalWorkspacePeriod,
  currencyFormatter: Intl.NumberFormat,
): LocalWorkspaceMetricCard[] {
  if (currentTotals === null) {
    return [];
  }

  const spendDelta = percentageDelta(currentTotals.spend, previousTotals?.spend ?? null);
  const conversionDelta = percentageDelta(
    currentTotals.conversions,
    previousTotals?.conversions ?? null,
  );
  const roasDelta =
    currentTotals.roas === null || previousTotals?.roas === null
      ? null
      : roundNumber(currentTotals.roas - (previousTotals?.roas ?? 0), 2);

  return [
    {
      key: 'spend',
      label: `Investimento ${period === 'last_7d' ? '7d' : '30d'}`,
      value: currencyFormatter.format(currentTotals.spend),
      supportingText: formatDeltaLabel(spendDelta, 'vs janela anterior'),
      tone: spendDelta !== null && spendDelta <= -5 ? 'success' : 'neutral',
    },
    {
      key: 'conversions',
      label: 'Conversoes',
      value: formatCompactNumber(currentTotals.conversions),
      supportingText: formatDeltaLabel(conversionDelta, 'vs janela anterior'),
      tone: conversionDelta !== null && conversionDelta >= 5 ? 'success' : 'warning',
    },
    {
      key: 'roas',
      label: 'ROAS',
      value:
        currentTotals.roas === null ? 'Sem dado' : `${currentTotals.roas.toFixed(2)}x`,
      supportingText:
        roasDelta === null
          ? 'Base anterior insuficiente para comparar.'
          : `${roasDelta >= 0 ? '+' : ''}${roasDelta.toFixed(2)}x vs janela anterior`,
      tone: currentTotals.roas !== null && currentTotals.roas >= 3 ? 'success' : 'warning',
    },
    {
      key: 'sync',
      label: 'Saude da sync',
      value:
        syncHealth === null
          ? 'Sem sync'
          : syncHealth.overallStatus === 'healthy'
            ? 'Estavel'
            : syncHealth.overallStatus === 'warning'
              ? 'Atencao'
              : 'Atrasada',
      supportingText:
        syncHealth?.lastSuccessfulSyncAt === null || syncHealth === null
          ? 'Ainda sem execucao local registrada.'
          : `Ultimo sucesso em ${formatPtDateTime(syncHealth.lastSuccessfulSyncAt)}.`,
      tone:
        syncHealth === null
          ? 'warning'
          : syncHealth.overallStatus === 'healthy'
            ? 'success'
            : syncHealth.overallStatus === 'warning'
              ? 'warning'
              : 'danger',
    },
  ];
}

function buildPeriodWindow(
  latestReportDate: string,
  period: LocalWorkspacePeriod,
): { readonly start: string; readonly end: string } {
  const end = parseDateOnly(latestReportDate);
  const start = new Date(end);
  start.setDate(end.getDate() - (period === 'last_7d' ? 6 : 29));

  return { start: formatDateOnly(start), end: latestReportDate };
}

function buildPreviousWindow(currentWindow: {
  readonly start: string;
  readonly end: string;
}): { readonly start: string; readonly end: string } {
  const currentStart = parseDateOnly(currentWindow.start);
  const currentEnd = parseDateOnly(currentWindow.end);
  const dayCount =
    Math.round((currentEnd.getTime() - currentStart.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousEnd.getDate() - (dayCount - 1));

  return { start: formatDateOnly(previousStart), end: formatDateOnly(previousEnd) };
}

function formatDeltaLabel(delta: number | null, suffix: string): string {
  if (delta === null) {
    return 'Base anterior insuficiente para comparar.';
  }

  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% ${suffix}`;
}

function percentageDelta(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) {
    return null;
  }

  return roundNumber(((current - previous) / previous) * 100, 1);
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
  return value === null ? null : roundNumber(decimalToNumber(value), 2);
}

function bigintToNumber(value: bigint | null): number {
  return value === null ? 0 : Number(value);
}

function formatCompactNumber(value: number): string {
  if (value >= 1000) {
    return new Intl.NumberFormat('pt-BR', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }

  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

function formatPtDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function readHeadline(summaryJson: string | null): string {
  if (summaryJson === null) {
    return 'Relatorio pronto para revisao.';
  }

  try {
    const payload = JSON.parse(summaryJson) as { headline?: string };
    return payload.headline ?? 'Relatorio pronto para revisao.';
  } catch {
    return 'Relatorio pronto para revisao.';
  }
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
