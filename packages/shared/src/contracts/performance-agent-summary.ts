import type { AgentFinding } from './performance-agent-finding';
import type {
  PerformanceAgentAction,
  PerformanceAgentAnalysisWindow,
  PerformanceAgentCategory,
  PerformanceAgentConfidenceBand,
  PerformanceAgentDataQuality,
  PerformanceAgentEntityType,
  PerformanceAgentEvidenceItem,
  PerformanceAgentName,
  PerformanceAgentPriorityBand,
  PerformanceAgentRiskLevel,
  PerformanceAgentSeverity,
} from './performance-agent-base';
import type { ExecutiveDeckSlideType } from './executive-deck';

export interface ConsolidatedInsight {
  readonly insight_id: string;
  readonly insight_key: string;
  readonly tenant_id: string;
  readonly client_id: string;
  readonly account_id: string | null;
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
  readonly source_agent_names: readonly PerformanceAgentName[];
  readonly title: string;
  readonly summary: string;
  readonly diagnosis: string;
  readonly primary_hypothesis: string;
  readonly alternative_hypotheses: readonly string[];
  readonly hypothesis_status: AgentFinding['hypothesis_status'];
  readonly recommended_action: PerformanceAgentAction;
  readonly expected_impact: string;
  readonly technical_explanation: string;
  readonly executive_explanation: string;
  readonly evidence: readonly PerformanceAgentEvidenceItem[];
  readonly review_notes: readonly string[];
  readonly supporting_finding_ids: readonly string[];
  readonly blocked_claims: readonly string[];
  readonly next_steps: readonly string[];
  readonly analysis_window: PerformanceAgentAnalysisWindow;
  readonly data_quality: PerformanceAgentDataQuality;
  readonly generated_at: string;
}

export interface PerformanceAgentSummary {
  readonly tenant_id: string;
  readonly client_id: string;
  readonly account_id: string | null;
  readonly generated_at: string;
  readonly technical_headline: string;
  readonly executive_headline: string;
  readonly technical_bullets: readonly string[];
  readonly executive_bullets: readonly string[];
  readonly next_steps: readonly string[];
  readonly technical_summary: string;
  readonly executive_summary: string;
  readonly report_narrative: readonly string[];
  readonly top_problems: readonly PerformanceAgentSummaryItem[];
  readonly top_opportunities: readonly PerformanceAgentSummaryItem[];
  readonly slide_outline: readonly PerformanceAgentSummarySlideOutlineItem[];
  readonly insights: readonly ConsolidatedInsight[];
  readonly supporting_findings: readonly AgentFinding[];
}

export interface PerformanceAgentSummaryItem {
  readonly title: string;
  readonly entity_label: string | null;
  readonly category: PerformanceAgentCategory;
  readonly action_type: PerformanceAgentAction['action_type'];
  readonly priority_score: number;
  readonly confidence_score: number;
  readonly risk_level: PerformanceAgentRiskLevel;
  readonly why_it_matters: string;
  readonly expected_impact: string;
}

export interface PerformanceAgentSummarySlideOutlineItem {
  readonly slide_type: ExecutiveDeckSlideType;
  readonly title: string;
  readonly main_message: string;
  readonly bullets: readonly string[];
}
