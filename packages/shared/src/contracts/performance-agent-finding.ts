import type {
  PerformanceAgentAction,
  PerformanceAgentCategory,
  PerformanceAgentConfidenceBand,
  PerformanceAgentEntityType,
  PerformanceAgentEvidenceItem,
  PerformanceAgentFindingStatus,
  PerformanceAgentHypothesisStatus,
  PerformanceAgentName,
  PerformanceAgentPriorityBand,
  PerformanceAgentRiskLevel,
  PerformanceAgentSeverity,
} from './performance-agent-base';

export interface AgentFinding {
  readonly finding_id: string;
  readonly finding_key: string;
  readonly source_agent: PerformanceAgentName;
  readonly support_agent_names: readonly PerformanceAgentName[];
  readonly entity_type: PerformanceAgentEntityType;
  readonly entity_id: string;
  readonly entity_label: string | null;
  readonly category: PerformanceAgentCategory;
  readonly severity: PerformanceAgentSeverity;
  readonly priority_band: PerformanceAgentPriorityBand;
  readonly priority_score: number;
  readonly confidence_band: PerformanceAgentConfidenceBand;
  readonly confidence_score: number;
  readonly risk_level: PerformanceAgentRiskLevel;
  readonly title: string;
  readonly summary: string;
  readonly diagnosis: string;
  readonly primary_hypothesis: string;
  readonly alternative_hypotheses: readonly string[];
  readonly recommended_action: PerformanceAgentAction;
  readonly expected_impact: string;
  readonly technical_explanation: string;
  readonly executive_explanation: string;
  readonly evidence: readonly PerformanceAgentEvidenceItem[];
  readonly data_gaps: readonly string[];
  readonly tags: readonly string[];
  readonly hypothesis_status: PerformanceAgentHypothesisStatus;
  readonly review_notes: readonly string[];
  readonly status: PerformanceAgentFindingStatus;
}
