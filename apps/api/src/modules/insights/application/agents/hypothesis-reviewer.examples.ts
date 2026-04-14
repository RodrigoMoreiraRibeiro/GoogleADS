import type {
  AgentFinding,
  AgentInput,
  PerformanceAgentJsonValue,
} from '@googleads/shared';

import { buildAction, buildFinding } from '../../domain/agents/performance-agent.utils';

function toJsonValue(value: unknown): PerformanceAgentJsonValue {
  return value as PerformanceAgentJsonValue;
}

function evidence(id: string, metric: string, value: number): AgentFinding['evidence'][number] {
  return {
    evidence_id: id,
    metric,
    current_value: value,
    baseline_value: null,
    delta_pct: null,
    threshold_value: null,
    window: 'analysis_run',
    scope_label: 'Escopo local',
    source_table: 'fact_google_ads_campaign_daily',
    note: `Evidencia ${metric}`,
  };
}

function finding(input: {
  readonly sourceAgent: AgentFinding['source_agent'];
  readonly entityId: string;
  readonly title: string;
  readonly category: AgentFinding['category'];
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly evidence: AgentFinding['evidence'];
  readonly dataGaps?: readonly string[];
  readonly actionType?: AgentFinding['recommended_action']['action_type'];
  readonly primaryHypothesis?: string;
}): AgentFinding {
  return buildFinding({
    sourceAgent: input.sourceAgent,
    entityType: 'campaign',
    entityId: input.entityId,
    entityLabel: 'Campanha Exemplo',
    category: input.category,
    severity: 'warning',
    priorityScore: input.priorityScore,
    confidenceScore: input.confidenceScore,
    riskLevel: 'medium',
    title: input.title,
    summary: 'Resumo de teste',
    diagnosis: 'A evidencia confirma uma causa direta na mensagem.',
    primaryHypothesis:
      input.primaryHypothesis ?? 'A evidencia confirma que a copy atual causa queda de eficiencia.',
    alternativeHypotheses: ['Outra hipotese secundaria'],
    recommendedAction: buildAction(
      input.actionType ?? 'review_creative',
      'Revisar o criativo',
      {
        actionTarget: `campaign:${input.entityId}`,
      },
    ),
    expectedImpact: 'Melhorar eficiencia',
    technicalExplanation: 'Os dados confirmam queda forte.',
    executiveExplanation: 'A campanha perdeu desempenho.',
    evidence: input.evidence,
    dataGaps: input.dataGaps ?? [],
    tags: ['example'],
  });
}

function buildBaseInput(): AgentInput {
  const baseFinding = finding({
    sourceAgent: 'campaign_strategist',
    entityId: '5001',
    title: 'Campanha precisa de revisao criativa',
    category: 'creative',
    priorityScore: 82,
    confidenceScore: 0.84,
    evidence: [evidence('e1', 'ctr', 0.021), evidence('e2', 'cpa', 82), evidence('e3', 'conversion_rate', 0.018)],
  });

  return {
    agent_name: 'hypothesis_reviewer',
    agent_version: '1.0.0',
    execution_context: {
      tenant_id: '1',
      client_id: '30',
      account_id: '300',
      membership_id: null,
      request_id: 'req-hypothesis-reviewer',
      correlation_id: 'corr-hypothesis-reviewer',
      trigger_source: 'scheduler',
      trigger_reference: '9006',
    },
    analysis_window: {
      analysis_window_label: 'analysis_run',
      period_start: '2026-03-15',
      period_end: '2026-04-13',
      baseline_start: '2026-02-13',
      baseline_end: '2026-03-14',
      comparison_label: 'last_30d vs previous_30d',
    },
    data_quality: {
      is_sync_stale: false,
      has_minimum_volume: true,
      has_baseline: true,
      warnings: [],
    },
    thresholds: {
      hypothesis_review_stale_sync_penalty: 0.08,
      hypothesis_review_data_gap_penalty: 0.05,
      hypothesis_review_missing_baseline_penalty: 0.1,
      hypothesis_review_soft_conflict_penalty: 0.08,
      hypothesis_review_hard_conflict_penalty: 0.18,
      hypothesis_review_support_agent_bonus: 0.03,
      hypothesis_review_min_evidence_confirmed: 3,
      hypothesis_review_min_evidence_plausible: 2,
      hypothesis_review_min_confidence_confirmed: 0.82,
      hypothesis_review_min_confidence_plausible: 0.62,
      hypothesis_review_min_confidence_weak: 0.45,
      hypothesis_review_discard_weak_below_priority: 45,
      hypothesis_review_discard_insufficient_below_priority: 60,
      hypothesis_review_max_merged_evidence: 8,
    },
    features: {
      review_queue_findings: toJsonValue([baseFinding]),
      review_queue_conflicts: toJsonValue([]),
    },
    upstream_outputs: [],
  };
}

export const HYPOTHESIS_REVIEWER_EXAMPLE_INPUTS = {
  confirmed_merge: {
    ...buildBaseInput(),
    features: {
      review_queue_findings: toJsonValue([
        finding({
          sourceAgent: 'campaign_strategist',
          entityId: '5001',
          title: 'Campanha precisa de revisao criativa',
          category: 'creative',
          priorityScore: 82,
          confidenceScore: 0.84,
          evidence: [evidence('e1', 'ctr', 0.021), evidence('e2', 'cpa', 82), evidence('e3', 'conversion_rate', 0.018)],
        }),
        finding({
          sourceAgent: 'creative_performance',
          entityId: '5001',
          title: 'Criativo da campanha pede refresh',
          category: 'creative',
          priorityScore: 78,
          confidenceScore: 0.79,
          evidence: [evidence('e4', 'ctr', 0.021), evidence('e5', 'conversion_rate', 0.018)],
        }),
      ]),
      review_queue_conflicts: toJsonValue([]),
    },
  } satisfies AgentInput,
  conflict_and_downgrade: {
    ...buildBaseInput(),
    features: {
      review_queue_findings: toJsonValue([
        finding({
          sourceAgent: 'campaign_strategist',
          entityId: '5002',
          title: 'Campanha para escalar',
          category: 'campaign_scaling',
          priorityScore: 80,
          confidenceScore: 0.86,
          evidence: [
            evidence('e6', 'roas', 5.6),
            evidence('e7', 'cpa', 42),
            evidence('e7b', 'conversions', 18),
          ],
          actionType: 'scale',
        }),
      ]),
      review_queue_conflicts: toJsonValue([
        {
          entityType: 'campaign',
          entityId: '5002',
          conflictType: 'hard_action_conflict',
          sourceAgents: ['campaign_strategist', 'segmentation_specialist'],
          resolution: 'Mantido scale com menor seguranca.',
        },
      ]),
    },
  } satisfies AgentInput,
  discarded_weak: {
    ...buildBaseInput(),
    features: {
      review_queue_findings: toJsonValue([
        finding({
          sourceAgent: 'search_terms_specialist',
          entityId: '5003',
          title: 'Hipotese fraca de desperdicio',
          category: 'search_terms',
          priorityScore: 40,
          confidenceScore: 0.47,
          evidence: [evidence('e8', 'spend', 62)],
          dataGaps: ['search_term_baseline_missing', 'search_term_no_conversion_signal'],
          actionType: 'review_search_terms',
        }),
      ]),
      review_queue_conflicts: toJsonValue([]),
    },
    data_quality: {
      is_sync_stale: true,
      has_minimum_volume: true,
      has_baseline: false,
      warnings: ['sync_stale'],
    },
  } satisfies AgentInput,
} as const;

export const HYPOTHESIS_REVIEWER_EXPECTED_AFTER = {
  confirmed_merge: {
    hypothesis_status: 'confirmed',
  },
  conflict_and_downgrade: {
    hypothesis_status: 'plausible',
  },
  discarded_weak: {
    status: 'skipped',
  },
} as const;
