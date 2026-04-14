import type {
  ExecutiveDeck,
  ExecutiveDeckHighlight,
  ExecutiveDeckPeriodReference,
  ExecutiveDeckReportType,
} from './executive-deck';
import type {
  PerformanceAgentCategory,
  PerformanceAgentConfidenceBand,
  PerformanceAgentPriorityBand,
  PerformanceAgentRiskLevel,
  PerformanceAgentSeverity,
} from './performance-agent-base';

export interface ExecutiveReportNarrativeItem {
  readonly insight_id: string;
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
  readonly technical_explanation: string;
  readonly executive_explanation: string;
  readonly recommended_action: string;
  readonly expected_impact: string;
}

export interface ExecutiveReportSummarySnapshot {
  readonly analysis_run_id: string;
  readonly technical_headline: string;
  readonly executive_headline: string;
  readonly technical_summary: string;
  readonly executive_summary: string;
  readonly report_narrative: readonly string[];
  readonly next_steps: readonly string[];
  readonly reviewed_findings_count: number;
  readonly official_insights_count: number;
}

export interface ExecutiveReportSource {
  readonly tenant_id: string;
  readonly client_id: string;
  readonly report_type: ExecutiveDeckReportType;
  readonly generated_at: string;
  readonly period_reference: ExecutiveDeckPeriodReference;
  readonly key_metrics: readonly ExecutiveDeckHighlight[];
  readonly summary_snapshot: ExecutiveReportSummarySnapshot;
  readonly top_results: readonly ExecutiveReportNarrativeItem[];
  readonly top_gaps: readonly ExecutiveReportNarrativeItem[];
  readonly prioritized_actions: readonly string[];
  readonly official_insights: readonly ExecutiveReportNarrativeItem[];
}

export interface ExecutiveReportView {
  readonly report_type: ExecutiveDeckReportType;
  readonly source: ExecutiveReportSource | null;
  readonly deck: ExecutiveDeck | null;
}
