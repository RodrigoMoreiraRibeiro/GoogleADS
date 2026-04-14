import { createHash } from 'node:crypto';

import type {
  AgentFinding,
  AgentOutput,
  PerformanceAgentAction,
  PerformanceAgentActionMode,
  PerformanceAgentActionType,
  PerformanceAgentCategory,
  PerformanceAgentConfidenceBand,
  PerformanceAgentDataQuality,
  PerformanceAgentEntityType,
  PerformanceAgentEvidenceItem,
  PerformanceAgentName,
  PerformanceAgentPriorityBand,
  PerformanceAgentRiskLevel,
  PerformanceAgentSeverity,
} from '@googleads/shared';

export function buildAgentOutput(input: {
  readonly agentName: PerformanceAgentName;
  readonly agentVersion: string;
  readonly executionContext: AgentOutput['execution_context'];
  readonly analysisWindow: AgentOutput['analysis_window'];
  readonly status: AgentOutput['status'];
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly dataQuality: PerformanceAgentDataQuality;
  readonly summary: string;
  readonly recommendedFocus: string | null;
  readonly candidateEntityIds: readonly string[];
  readonly findings: readonly AgentFinding[];
  readonly entitiesEvaluated: number;
  readonly findingsSuppressed: number;
}): AgentOutput {
  const outputHash = createDeterministicHash({
    agent_name: input.agentName,
    analysis_window: input.analysisWindow,
    findings: input.findings,
    summary: input.summary,
    recommended_focus: input.recommendedFocus,
  });

  return {
    output_id: createDeterministicHash({
      agent_name: input.agentName,
      generated_at: new Date().toISOString(),
      output_hash: outputHash,
    }).slice(0, 24),
    output_hash: outputHash,
    agent_name: input.agentName,
    agent_version: input.agentVersion,
    execution_context: input.executionContext,
    analysis_window: input.analysisWindow,
    generated_at: new Date().toISOString(),
    status: input.status,
    priority_score: roundNumber(input.priorityScore, 2),
    confidence_score: roundNumber(input.confidenceScore, 4),
    data_quality: input.dataQuality,
    summary: input.summary,
    recommended_focus: input.recommendedFocus,
    candidate_entity_ids: input.candidateEntityIds,
    findings: input.findings,
    stats: {
      entities_evaluated: input.entitiesEvaluated,
      findings_generated: input.findings.length,
      findings_suppressed: input.findingsSuppressed,
    },
  };
}

export function buildFinding(input: {
  readonly sourceAgent: PerformanceAgentName;
  readonly supportAgentNames?: readonly PerformanceAgentName[];
  readonly entityType: PerformanceAgentEntityType;
  readonly entityId: string;
  readonly entityLabel: string | null;
  readonly category: PerformanceAgentCategory;
  readonly severity: PerformanceAgentSeverity;
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly riskLevel: PerformanceAgentRiskLevel;
  readonly title: string;
  readonly summary: string;
  readonly diagnosis: string;
  readonly primaryHypothesis: string;
  readonly alternativeHypotheses?: readonly string[];
  readonly recommendedAction: PerformanceAgentAction;
  readonly expectedImpact: string;
  readonly technicalExplanation: string;
  readonly executiveExplanation: string;
  readonly evidence?: readonly PerformanceAgentEvidenceItem[];
  readonly dataGaps?: readonly string[];
  readonly tags?: readonly string[];
  readonly hypothesisStatus?: AgentFinding['hypothesis_status'];
  readonly reviewNotes?: readonly string[];
  readonly status?: AgentFinding['status'];
}): AgentFinding {
  const findingKey = createDeterministicHash({
    source_agent: input.sourceAgent,
    entity_type: input.entityType,
    entity_id: input.entityId,
    category: input.category,
    action_type: input.recommendedAction.action_type,
    title: input.title,
  });

  return {
    finding_id: findingKey.slice(0, 24),
    finding_key: findingKey,
    source_agent: input.sourceAgent,
    support_agent_names: input.supportAgentNames ?? [],
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_label: input.entityLabel,
    category: input.category,
    severity: input.severity,
    priority_band: scoreToPriorityBand(input.priorityScore),
    priority_score: roundNumber(input.priorityScore, 2),
    confidence_band: scoreToConfidenceBand(input.confidenceScore),
    confidence_score: roundNumber(input.confidenceScore, 4),
    risk_level: input.riskLevel,
    title: input.title,
    summary: input.summary,
    diagnosis: input.diagnosis,
    primary_hypothesis: input.primaryHypothesis,
    alternative_hypotheses: input.alternativeHypotheses ?? [],
    recommended_action: input.recommendedAction,
    expected_impact: input.expectedImpact,
    technical_explanation: input.technicalExplanation,
    executive_explanation: input.executiveExplanation,
    evidence: input.evidence ?? [],
    data_gaps: input.dataGaps ?? [],
    tags: input.tags ?? [],
    hypothesis_status: input.hypothesisStatus ?? 'plausible',
    review_notes: input.reviewNotes ?? [],
    status: input.status ?? 'open',
  };
}

export function buildAction(
  actionType: PerformanceAgentActionType,
  description: string,
  options?: {
    readonly actionTarget?: string | null;
    readonly executionMode?: PerformanceAgentActionMode;
  },
): PerformanceAgentAction {
  return {
    action_type: actionType,
    action_target: options?.actionTarget ?? null,
    description,
    execution_mode: options?.executionMode ?? 'manual',
  };
}

export function scoreToPriorityBand(score: number): PerformanceAgentPriorityBand {
  if (score >= 88) {
    return 'critical';
  }

  if (score >= 72) {
    return 'high';
  }

  if (score >= 52) {
    return 'medium';
  }

  return 'low';
}

export function scoreToConfidenceBand(
  score: number,
): PerformanceAgentConfidenceBand {
  if (score >= 0.9) {
    return 'very_high';
  }

  if (score >= 0.75) {
    return 'high';
  }

  if (score >= 0.55) {
    return 'moderate';
  }

  return 'low';
}

export function createDeterministicHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

export function percentageDelta(
  current: number | null,
  baseline: number | null,
): number | null {
  if (current === null || baseline === null || baseline === 0) {
    return null;
  }

  return roundNumber(((current - baseline) / baseline) * 100, 1);
}

export function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateConfidenceScore(input: {
  readonly clicks: number;
  readonly conversions: number;
  readonly spend: number;
}): number {
  let score = 0.45;

  if (input.clicks >= 25) {
    score += 0.08;
  }

  if (input.clicks >= 60) {
    score += 0.08;
  }

  if (input.conversions >= 3) {
    score += 0.12;
  }

  if (input.conversions >= 8) {
    score += 0.1;
  }

  if (input.conversions >= 15) {
    score += 0.05;
  }

  if (input.spend >= 150) {
    score += 0.05;
  }

  if (input.spend >= 600) {
    score += 0.04;
  }

  return roundNumber(clampNumber(score, 0.4, 0.97), 4);
}
