import type { AgentFinding } from './performance-agent-finding';
import type {
  PerformanceAgentAnalysisWindow,
  PerformanceAgentDataQuality,
  PerformanceAgentExecutionContext,
  PerformanceAgentExecutionStatus,
  PerformanceAgentJsonValue,
  PerformanceAgentName,
  PerformanceAgentOutputReference,
  PerformanceAgentThresholds,
} from './performance-agent-base';

export interface AgentInput {
  readonly agent_name: PerformanceAgentName;
  readonly agent_version: string;
  readonly execution_context: PerformanceAgentExecutionContext;
  readonly analysis_window: PerformanceAgentAnalysisWindow;
  readonly data_quality: PerformanceAgentDataQuality;
  readonly thresholds: PerformanceAgentThresholds;
  readonly features: Readonly<Record<string, PerformanceAgentJsonValue>>;
  readonly upstream_outputs: readonly PerformanceAgentOutputReference[];
}

export interface AgentOutputStats {
  readonly entities_evaluated: number;
  readonly findings_generated: number;
  readonly findings_suppressed: number;
}

export interface AgentOutput {
  readonly output_id: string;
  readonly output_hash: string;
  readonly agent_name: PerformanceAgentName;
  readonly agent_version: string;
  readonly execution_context: PerformanceAgentExecutionContext;
  readonly analysis_window: PerformanceAgentAnalysisWindow;
  readonly generated_at: string;
  readonly status: PerformanceAgentExecutionStatus;
  readonly priority_score: number;
  readonly confidence_score: number;
  readonly data_quality: PerformanceAgentDataQuality;
  readonly summary: string;
  readonly recommended_focus: string | null;
  readonly candidate_entity_ids: readonly string[];
  readonly findings: readonly AgentFinding[];
  readonly stats: AgentOutputStats;
}
