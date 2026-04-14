import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  ConsolidatedInsight,
  ExecutiveDeckHighlight,
  ExecutiveDeckPeriodReference,
  ExecutiveDeckReportType,
  ExecutiveReportNarrativeItem,
  ExecutiveReportSource,
  ExecutiveReportView,
  PerformanceAgentSummary,
} from '@googleads/shared';

import { PrismaService } from '../../../common/database/prisma.service';
import { ExecutiveReportDeckBuilderService } from './executive-report-deck-builder.service';

interface LocalExecutiveReportQueryInput {
  readonly tenantSlug?: string | undefined;
  readonly clientId?: string | undefined;
  readonly period: 'last_7d' | 'last_30d';
}

interface TenantRow {
  readonly tenantId: bigint;
  readonly tenantSlug: string;
}

interface ClientRow {
  readonly clientId: bigint;
}

type NumericLike =
  | number
  | string
  | bigint
  | {
      toNumber(): number;
    }
  | null;

interface PeriodAggregateRow {
  readonly spend: NumericLike;
  readonly clicks: bigint;
  readonly conversions: NumericLike;
  readonly conversionsValue: NumericLike;
  readonly roas: NumericLike;
  readonly cpa: NumericLike;
}

interface AnalysisRunRow {
  readonly analysisRunId: bigint;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly baselineStart: Date | null;
  readonly baselineEnd: Date | null;
  readonly comparisonLabel: string | null;
  readonly summaryJson: string | null;
  readonly finishedAt: Date | null;
}

@Injectable()
export class LocalExecutiveReportService {
  public constructor(
    private readonly prismaService: PrismaService,
    private readonly deckBuilderService: ExecutiveReportDeckBuilderService,
  ) {}

  public async getExecutiveReportView(
    input: LocalExecutiveReportQueryInput,
  ): Promise<ExecutiveReportView> {
    try {
      const tenantId = await this.resolveTenantId(input.tenantSlug);

      if (tenantId === null) {
        return emptyExecutiveReportView(mapReportType(input.period));
      }

      const clientId = await this.resolveClientId(tenantId, input.clientId);

      if (clientId === null) {
        return emptyExecutiveReportView(mapReportType(input.period));
      }

      const reportType = mapReportType(input.period);
      const latestAnalysisRun = await this.getLatestCompletedAnalysisRun(
        tenantId,
        clientId,
        input.period,
      );

      if (latestAnalysisRun === null || latestAnalysisRun.summaryJson === null) {
        return emptyExecutiveReportView(reportType);
      }

      const summary = parsePerformanceSummary(latestAnalysisRun.summaryJson);

      if (summary === null) {
        return emptyExecutiveReportView(reportType);
      }

      const periodReference: ExecutiveDeckPeriodReference = {
        period_label: reportType === 'weekly' ? 'Resumo semanal' : 'Resumo mensal',
        period_start: formatDateOnly(latestAnalysisRun.periodStart),
        period_end: formatDateOnly(latestAnalysisRun.periodEnd),
        baseline_label:
          latestAnalysisRun.baselineStart === null ||
          latestAnalysisRun.baselineEnd === null
            ? null
            : `${formatDateOnly(latestAnalysisRun.baselineStart)} a ${formatDateOnly(latestAnalysisRun.baselineEnd)}`,
      };

      const aggregate = await this.getPeriodAggregate(
        tenantId,
        clientId,
        input.period,
        latestAnalysisRun,
      );
      const source = buildExecutiveReportSource({
        tenantId,
        clientId,
        reportType,
        periodReference,
        aggregate,
        summary,
        analysisRunId: String(Number(latestAnalysisRun.analysisRunId)),
        generatedAt:
          latestAnalysisRun.finishedAt?.toISOString() ?? new Date().toISOString(),
      });

      return {
        report_type: reportType,
        source,
        deck: this.deckBuilderService.buildDeck(source),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Nao foi possivel montar o relatorio executivo local. Confirme a base local e o historico de analysis runs.',
      );
    }
  }

  private async resolveTenantId(
    tenantSlug?: string | undefined,
  ): Promise<string | null> {
    const rows = await this.prismaService.$queryRaw<TenantRow[]>`
      SELECT id AS tenantId, slug AS tenantSlug
      FROM tenants
      WHERE plan_code = 'local-demo'
      ORDER BY name ASC
    `;

    if (rows.length === 0) {
      return null;
    }

    const firstRow = rows[0];

    if (tenantSlug === undefined) {
      return firstRow === undefined ? null : String(Number(firstRow.tenantId));
    }

    const selected = rows.find((row) => row.tenantSlug === tenantSlug);

    if (selected === undefined) {
      throw new NotFoundException(
        'Tenant de demonstracao nao encontrado para o relatorio local.',
      );
    }

    return String(Number(selected.tenantId));
  }

  private async resolveClientId(
    tenantId: string,
    clientId?: string | undefined,
  ): Promise<string | null> {
    const rows = await this.prismaService.$queryRaw<ClientRow[]>`
      SELECT id AS clientId
      FROM clients
      WHERE tenant_id = ${Number(tenantId)}
        AND status <> 'archived'
      ORDER BY name ASC
    `;

    if (rows.length === 0) {
      return null;
    }

    const firstRow = rows[0];

    if (clientId === undefined) {
      return firstRow === undefined ? null : String(Number(firstRow.clientId));
    }

    const selected = rows.find((row) => String(Number(row.clientId)) === clientId);

    if (selected === undefined) {
      throw new NotFoundException(
        'Cliente de demonstracao nao encontrado para o relatorio local.',
      );
    }

    return String(Number(selected.clientId));
  }

  private async getLatestCompletedAnalysisRun(
    tenantId: string,
    clientId: string,
    period: 'last_7d' | 'last_30d',
  ): Promise<AnalysisRunRow | null> {
    const expectedWindowDays = period === 'last_7d' ? 7 : 30;
    const rows = await this.prismaService.$queryRaw<AnalysisRunRow[]>`
      SELECT
        id AS analysisRunId,
        period_start AS periodStart,
        period_end AS periodEnd,
        baseline_start AS baselineStart,
        baseline_end AS baselineEnd,
        comparison_label AS comparisonLabel,
        summary_json AS summaryJson,
        finished_at AS finishedAt
      FROM insight_runs
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
        AND status = 'completed'
        AND summary_json IS NOT NULL
        AND DATEDIFF(period_end, period_start) + 1 = ${expectedWindowDays}
      ORDER BY COALESCE(finished_at, created_at) DESC
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private async getPeriodAggregate(
    tenantId: string,
    clientId: string,
    period: 'last_7d' | 'last_30d',
    run: AnalysisRunRow,
  ): Promise<PeriodAggregateRow | null> {
    const rows = await this.prismaService.$queryRaw<PeriodAggregateRow[]>`
      SELECT
        spend,
        clicks,
        conversions,
        conversions_value AS conversionsValue,
        roas,
        cpa
      FROM agg_client_kpi_period
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
        AND period_type = ${period}
        AND period_start = ${formatDateOnly(run.periodStart)}
        AND period_end = ${formatDateOnly(run.periodEnd)}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }
}

function buildExecutiveReportSource(input: {
  readonly tenantId: string;
  readonly clientId: string;
  readonly reportType: ExecutiveDeckReportType;
  readonly periodReference: ExecutiveDeckPeriodReference;
  readonly aggregate: PeriodAggregateRow | null;
  readonly summary: PerformanceAgentSummary;
  readonly analysisRunId: string;
  readonly generatedAt: string;
}): ExecutiveReportSource {
  const keyMetrics = buildKeyMetrics(input.aggregate, input.summary);
  const officialInsights = input.summary.insights.map(mapNarrativeItem);

  return {
    tenant_id: input.tenantId,
    client_id: input.clientId,
    report_type: input.reportType,
    generated_at: input.generatedAt,
    period_reference: input.periodReference,
    key_metrics: keyMetrics,
    summary_snapshot: {
      analysis_run_id: input.analysisRunId,
      technical_headline: input.summary.technical_headline,
      executive_headline: input.summary.executive_headline,
      technical_summary: input.summary.technical_summary,
      executive_summary: input.summary.executive_summary,
      report_narrative: input.summary.report_narrative,
      next_steps: input.summary.next_steps,
      reviewed_findings_count: input.summary.supporting_findings.length,
      official_insights_count: input.summary.insights.length,
    },
    top_results: input.summary.top_opportunities
      .map((item) =>
        officialInsights.find((insight) => insight.title === item.title),
      )
      .filter((item): item is ExecutiveReportNarrativeItem => item !== undefined),
    top_gaps: input.summary.top_problems
      .map((item) =>
        officialInsights.find((insight) => insight.title === item.title),
      )
      .filter((item): item is ExecutiveReportNarrativeItem => item !== undefined),
    prioritized_actions: input.summary.next_steps,
    official_insights: officialInsights.slice(0, 8),
  };
}

function buildKeyMetrics(
  aggregate: PeriodAggregateRow | null,
  summary: PerformanceAgentSummary,
): readonly ExecutiveDeckHighlight[] {
  if (aggregate === null) {
    return [
      {
        label: 'Insights oficiais',
        value: String(summary.insights.length),
        context: null,
      },
      {
        label: 'Findings revisados',
        value: String(summary.supporting_findings.length),
        context: null,
      },
    ];
  }

  return [
    {
      label: 'Investimento',
      value: formatCurrency(decimalToNumber(aggregate.spend)),
      context: null,
    },
    {
      label: 'Conversoes',
      value: formatCompact(decimalToNumber(aggregate.conversions)),
      context: null,
    },
    {
      label: 'ROAS',
      value:
        aggregate.roas === null
          ? 'Sem dado'
          : `${decimalToNumber(aggregate.roas).toFixed(2)}x`,
      context: null,
    },
    {
      label: 'CPA',
      value:
        aggregate.cpa === null
          ? 'Sem dado'
          : formatCurrency(decimalToNumber(aggregate.cpa)),
      context: null,
    },
  ];
}

function mapNarrativeItem(insight: ConsolidatedInsight): ExecutiveReportNarrativeItem {
  return {
    insight_id: insight.insight_id,
    entity_label: insight.entity_label,
    category: insight.category,
    severity: insight.severity,
    priority_band: insight.priority_band,
    priority_score: insight.priority_score,
    confidence_band: insight.confidence_band,
    confidence_score: insight.confidence_score,
    risk_level: insight.risk_level,
    title: insight.title,
    summary: insight.summary,
    technical_explanation: insight.technical_explanation,
    executive_explanation: insight.executive_explanation,
    recommended_action: insight.recommended_action.description,
    expected_impact: insight.expected_impact,
  };
}

function parsePerformanceSummary(value: string): PerformanceAgentSummary | null {
  try {
    return JSON.parse(value) as PerformanceAgentSummary;
  } catch {
    return null;
  }
}

function emptyExecutiveReportView(
  reportType: ExecutiveDeckReportType,
): ExecutiveReportView {
  return {
    report_type: reportType,
    source: null,
    deck: null,
  };
}

function mapReportType(period: 'last_7d' | 'last_30d'): ExecutiveDeckReportType {
  return period === 'last_7d' ? 'weekly' : 'monthly';
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

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}
