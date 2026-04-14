import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  LocalWorkspaceAgentInsightItem,
  LocalWorkspaceAgentInsightsView,
  LocalWorkspaceAnalysisRunInfo,
  LocalWorkspaceClientOption,
  LocalWorkspaceTenantOption,
} from '@googleads/shared';

import { PrismaService } from '../../../common/database/prisma.service';

interface AgentInsightsQueryInput {
  readonly tenantSlug?: string | undefined;
  readonly clientId?: string | undefined;
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
export class LocalAgentInsightsService {
  public constructor(private readonly prismaService: PrismaService) {}

  public async getAgentInsightsView(
    input: AgentInsightsQueryInput,
  ): Promise<LocalWorkspaceAgentInsightsView> {
    try {
      const availableTenants = await this.getAvailableTenants();

      if (availableTenants.length === 0) {
        return emptyAgentInsightsView();
      }

      const selectedTenant =
        input.tenantSlug === undefined
          ? availableTenants[0]
          : availableTenants.find((tenant) => tenant.tenantSlug === input.tenantSlug);

      if (selectedTenant === undefined) {
        throw new NotFoundException(
          'Tenant de demonstracao nao encontrado para a leitura dos insights.',
        );
      }

      const availableClients = await this.getAvailableClients(selectedTenant.tenantId);

      if (availableClients.length === 0) {
        return emptyAgentInsightsView();
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

      const lastAnalysis = await this.getLastAnalysisRun(
        selectedTenant.tenantId,
        selectedClient.clientId,
      );
      const prioritizedInsights = await this.getPrioritizedInsights(
        selectedTenant.tenantId,
        selectedClient.clientId,
        lastAnalysis?.analysisRunId ?? null,
      );
      const topProblems = prioritizedInsights
        .filter((insight) => !isOpportunityInsight(insight))
        .slice(0, 3);
      const topOpportunities = prioritizedInsights
        .filter((insight) => isOpportunityInsight(insight))
        .slice(0, 3);

      return {
        lastAnalysis,
        availableCategories: Array.from(
          new Set(prioritizedInsights.map((insight) => insight.category)),
        ).sort((left, right) => left.localeCompare(right)),
        topProblems,
        topOpportunities,
        prioritizedInsights,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Nao foi possivel ler a analise consolidada local. Confirme se o MySQL esta ativo e se a base foi populada.',
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

    return rows.map((row) => ({
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

    return rows.map((row) => ({
      clientId: String(Number(row.clientId)),
      clientName: row.clientName,
      status: row.status,
      accountCount: Number(row.accountCount),
      lastMetricSyncAt: row.lastMetricSyncAt?.toISOString() ?? null,
    }));
  }

  private async getLastAnalysisRun(
    tenantId: string,
    clientId: string,
  ): Promise<LocalWorkspaceAnalysisRunInfo | null> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        analysisRunId: bigint;
        status: 'queued' | 'running' | 'completed' | 'failed';
        generatedBy: 'system' | 'user';
        comparisonLabel: string | null;
        insightCount: bigint;
        createdAt: Date;
        startedAt: Date | null;
        finishedAt: Date | null;
      }>
    >`
      SELECT
        ir.id AS analysisRunId,
        ir.status AS status,
        ir.generated_by AS generatedBy,
        ir.comparison_label AS comparisonLabel,
        COUNT(i.id) AS insightCount,
        ir.created_at AS createdAt,
        ir.started_at AS startedAt,
        ir.finished_at AS finishedAt
      FROM insight_runs ir
      LEFT JOIN insights i
        ON i.insight_run_id = ir.id
       AND i.tenant_id = ir.tenant_id
       AND i.client_id = ir.client_id
       AND i.status = 'open'
      WHERE ir.tenant_id = ${Number(tenantId)}
        AND ir.client_id = ${Number(clientId)}
      GROUP BY
        ir.id,
        ir.status,
        ir.generated_by,
        ir.comparison_label,
        ir.created_at,
        ir.started_at,
        ir.finished_at
      ORDER BY COALESCE(ir.finished_at, ir.started_at, ir.created_at) DESC
      LIMIT 1
    `;

    const row = rows[0];

    if (row === undefined) {
      return null;
    }

    return {
      analysisRunId: String(Number(row.analysisRunId)),
      status: row.status,
      generatedBy: row.generatedBy,
      comparisonLabel: row.comparisonLabel,
      insightCount: Number(row.insightCount),
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }

  private async getPrioritizedInsights(
    tenantId: string,
    clientId: string,
    latestAnalysisRunId: string | null,
  ): Promise<LocalWorkspaceAgentInsightItem[]> {
    const rows =
      latestAnalysisRunId === null
        ? await this.prismaService.$queryRaw<InsightRow[]>`
            SELECT
              i.id AS insightId,
              i.insight_run_id AS analysisRunId,
              i.scope_type AS entityType,
              i.scope_ref AS entityId,
              i.category AS category,
              i.severity AS severity,
              i.priority AS priorityBand,
              i.priority_score AS priorityScore,
              i.confidence AS confidenceScore,
              i.confidence_band AS confidenceBand,
              i.risk_level AS riskLevel,
              i.hypothesis_status AS hypothesisStatus,
              i.title AS title,
              i.summary AS summary,
              i.diagnosis AS diagnosis,
              i.explanation_short AS technicalExplanation,
              i.explanation_exec AS executiveExplanation,
              i.recommendation_action AS recommendationActionType,
              i.estimated_monthly_impact AS estimatedMonthlyImpact,
              i.source_agent_names_json AS sourceAgentNamesJson,
              i.current_payload_json AS currentPayloadJson,
              i.generated_at AS generatedAt
            FROM insights i
            WHERE i.tenant_id = ${Number(tenantId)}
              AND i.client_id = ${Number(clientId)}
              AND i.status = 'open'
            ORDER BY i.priority_score DESC, i.confidence DESC, i.generated_at DESC
            LIMIT 24
          `
        : await this.prismaService.$queryRaw<InsightRow[]>`
            SELECT
              i.id AS insightId,
              i.insight_run_id AS analysisRunId,
              i.scope_type AS entityType,
              i.scope_ref AS entityId,
              i.category AS category,
              i.severity AS severity,
              i.priority AS priorityBand,
              i.priority_score AS priorityScore,
              i.confidence AS confidenceScore,
              i.confidence_band AS confidenceBand,
              i.risk_level AS riskLevel,
              i.hypothesis_status AS hypothesisStatus,
              i.title AS title,
              i.summary AS summary,
              i.diagnosis AS diagnosis,
              i.explanation_short AS technicalExplanation,
              i.explanation_exec AS executiveExplanation,
              i.recommendation_action AS recommendationActionType,
              i.estimated_monthly_impact AS estimatedMonthlyImpact,
              i.source_agent_names_json AS sourceAgentNamesJson,
              i.current_payload_json AS currentPayloadJson,
              i.generated_at AS generatedAt
            FROM insights i
            WHERE i.tenant_id = ${Number(tenantId)}
              AND i.client_id = ${Number(clientId)}
              AND i.status = 'open'
              AND i.insight_run_id = ${Number(latestAnalysisRunId)}
            ORDER BY i.priority_score DESC, i.confidence DESC, i.generated_at DESC
            LIMIT 24
          `;

    return rows.map((row) => {
      const payload = parseJsonObject(row.currentPayloadJson);
      const recommendedActionObject = readNestedObject(payload, 'recommended_action');
      const sourceAgentNames = parseStringArray(row.sourceAgentNamesJson);
      const entityLabel =
        readString(payload, 'entity_label') ??
        readString(payload, 'scope_label') ??
        row.entityId;
      const technicalExplanation =
        readString(payload, 'technical_explanation') ?? row.technicalExplanation;
      const executiveExplanation =
        readString(payload, 'executive_explanation') ??
        row.executiveExplanation ??
        row.summary;
      const expectedImpact =
        readString(payload, 'expected_impact') ??
        formatEstimatedImpact(row.estimatedMonthlyImpact);
      const recommendedAction =
        readString(recommendedActionObject, 'description') ??
        mapLegacyActionLabel(row.recommendationActionType);
      const recommendedActionType =
        readString(recommendedActionObject, 'action_type') ??
        row.recommendationActionType;

      return {
        insightId: String(Number(row.insightId)),
        analysisRunId: String(Number(row.analysisRunId)),
        entityType: row.entityType,
        entityId: row.entityId,
        entityLabel,
        category: row.category,
        severity: row.severity,
        priorityBand: row.priorityBand,
        priorityScore: decimalToNumber(row.priorityScore),
        confidenceBand:
          row.confidenceBand ?? scoreToConfidenceBand(decimalToNumber(row.confidenceScore)),
        confidenceScore: decimalToNumber(row.confidenceScore),
        riskLevel: row.riskLevel,
        hypothesisStatus: row.hypothesisStatus,
        title: row.title,
        summary: row.summary,
        diagnosis: row.diagnosis,
        technicalExplanation,
        executiveExplanation,
        recommendedAction,
        recommendedActionType,
        expectedImpact,
        sourceAgentNames,
        generatedAt: row.generatedAt.toISOString(),
      };
    });
  }
}

interface InsightRow {
  readonly insightId: bigint;
  readonly analysisRunId: bigint;
  readonly entityType: string;
  readonly entityId: string;
  readonly category: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly priorityBand: 'low' | 'medium' | 'high' | 'critical';
  readonly priorityScore: NumericLike;
  readonly confidenceScore: NumericLike;
  readonly confidenceBand: 'low' | 'moderate' | 'high' | 'very_high' | null;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly hypothesisStatus:
    | 'confirmed'
    | 'plausible'
    | 'weak'
    | 'insufficient_evidence'
    | null;
  readonly title: string;
  readonly summary: string;
  readonly diagnosis: string;
  readonly technicalExplanation: string;
  readonly executiveExplanation: string | null;
  readonly recommendationActionType: string;
  readonly estimatedMonthlyImpact: NumericLike;
  readonly sourceAgentNamesJson: string | null;
  readonly currentPayloadJson: string | null;
  readonly generatedAt: Date;
}

function emptyAgentInsightsView(): LocalWorkspaceAgentInsightsView {
  return {
    lastAnalysis: null,
    availableCategories: [],
    topProblems: [],
    topOpportunities: [],
    prioritizedInsights: [],
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

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return null;
  } catch {
    return null;
  }
}

function readNestedObject(
  input: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (input === null) {
    return null;
  }

  const candidate = input[key];

  if (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }

  return null;
}

function readString(
  input: Record<string, unknown> | null,
  key: string,
): string | null {
  if (input === null) {
    return null;
  }

  const candidate = input[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function parseStringArray(value: string | null): readonly string[] {
  if (value === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function isOpportunityInsight(insight: LocalWorkspaceAgentInsightItem): boolean {
  const normalizedAction = insight.recommendedActionType.toLowerCase();
  const normalizedText = `${insight.title} ${insight.summary} ${insight.expectedImpact ?? ''}`.toLowerCase();

  return (
    normalizedAction === 'scale' ||
    normalizedAction === 'increase_budget' ||
    insight.severity === 'info' ||
    normalizedText.includes('oportunidade') ||
    normalizedText.includes('vencedor') ||
    normalizedText.includes('crescimento')
  );
}

function scoreToConfidenceBand(
  value: number,
): 'low' | 'moderate' | 'high' | 'very_high' {
  if (value >= 0.9) {
    return 'very_high';
  }

  if (value >= 0.75) {
    return 'high';
  }

  if (value >= 0.5) {
    return 'moderate';
  }

  return 'low';
}

function formatEstimatedImpact(value: NumericLike): string | null {
  const numericValue = decimalToNumber(value);

  if (numericValue <= 0) {
    return null;
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function mapLegacyActionLabel(actionType: string): string {
  switch (actionType) {
    case 'increase_budget':
    case 'scale':
      return 'Ampliar investimento de forma controlada.';
    case 'decrease_budget':
    case 'reduce':
      return 'Reduzir verba ate recuperar eficiencia.';
    case 'pause':
      return 'Pausar a frente ate revisar a causa principal.';
    case 'shift_schedule':
    case 'adjust_schedule':
      return 'Redistribuir entrega para horarios mais eficientes.';
    case 'shift_geo':
    case 'adjust_geo':
      return 'Revisar geografia e reduzir exposicao onde houver desperdicio.';
    case 'shift_device':
    case 'adjust_device':
      return 'Ajustar distribuicao por dispositivo.';
    case 'review_search_terms':
      return 'Revisar termos e negativas.';
    case 'review_creative':
      return 'Revisar copy e criativos.';
    case 'review_tracking':
      return 'Verificar tracking e qualidade da medicao.';
    default:
      return 'Revisar o insight e definir a proxima acao.';
  }
}
