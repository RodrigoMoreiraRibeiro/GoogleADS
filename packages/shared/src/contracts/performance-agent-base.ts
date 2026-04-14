export const PERFORMANCE_AGENT_NAMES = [
  'account_auditor',
  'campaign_strategist',
  'segmentation_specialist',
  'search_terms_specialist',
  'creative_performance',
  'hypothesis_reviewer',
  'executive_summary',
] as const;

export type PerformanceAgentName = (typeof PERFORMANCE_AGENT_NAMES)[number];

export const PERFORMANCE_AGENT_SEVERITIES = [
  'info',
  'warning',
  'critical',
] as const;

export type PerformanceAgentSeverity =
  (typeof PERFORMANCE_AGENT_SEVERITIES)[number];

export const PERFORMANCE_AGENT_CATEGORIES = [
  'account_health',
  'budget_allocation',
  'campaign_efficiency',
  'campaign_scaling',
  'segmentation',
  'device',
  'geo',
  'schedule',
  'search_terms',
  'creative',
  'tracking',
  'data_quality',
] as const;

export type PerformanceAgentCategory =
  (typeof PERFORMANCE_AGENT_CATEGORIES)[number];

export const PERFORMANCE_AGENT_RISK_LEVELS = ['low', 'medium', 'high'] as const;

export type PerformanceAgentRiskLevel =
  (typeof PERFORMANCE_AGENT_RISK_LEVELS)[number];

export const PERFORMANCE_AGENT_ENTITY_TYPES = [
  'client',
  'account',
  'campaign',
  'ad_group',
  'ad',
  'keyword',
  'search_term',
  'device',
  'geo',
  'schedule',
  'day_of_week',
  'landing_page',
  'tracking',
] as const;

export type PerformanceAgentEntityType =
  (typeof PERFORMANCE_AGENT_ENTITY_TYPES)[number];

export const PERFORMANCE_AGENT_CONFIDENCE_BANDS = [
  'low',
  'moderate',
  'high',
  'very_high',
] as const;

export type PerformanceAgentConfidenceBand =
  (typeof PERFORMANCE_AGENT_CONFIDENCE_BANDS)[number];

export const PERFORMANCE_AGENT_PRIORITY_BANDS = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

export type PerformanceAgentPriorityBand =
  (typeof PERFORMANCE_AGENT_PRIORITY_BANDS)[number];

export const PERFORMANCE_AGENT_EXECUTION_STATUSES = [
  'queued',
  'running',
  'ready',
  'partial',
  'skipped',
  'insufficient_data',
  'failed',
] as const;

export type PerformanceAgentExecutionStatus =
  (typeof PERFORMANCE_AGENT_EXECUTION_STATUSES)[number];

export const PERFORMANCE_AGENT_FINDING_STATUSES = [
  'open',
  'accepted',
  'dismissed',
  'superseded',
] as const;

export type PerformanceAgentFindingStatus =
  (typeof PERFORMANCE_AGENT_FINDING_STATUSES)[number];

export const PERFORMANCE_AGENT_HYPOTHESIS_STATUSES = [
  'confirmed',
  'plausible',
  'weak',
  'insufficient_evidence',
] as const;

export type PerformanceAgentHypothesisStatus =
  (typeof PERFORMANCE_AGENT_HYPOTHESIS_STATUSES)[number];

export const PERFORMANCE_AGENT_TRIGGER_SOURCES = [
  'system',
  'user',
  'scheduler',
  'report_run',
] as const;

export type PerformanceAgentTriggerSource =
  (typeof PERFORMANCE_AGENT_TRIGGER_SOURCES)[number];

export const PERFORMANCE_AGENT_ACTION_TYPES = [
  'scale',
  'reduce',
  'pause',
  'investigate',
  'monitor',
  'review_targeting',
  'review_search_terms',
  'review_creative',
  'review_landing_page',
  'review_tracking',
  'adjust_schedule',
  'adjust_geo',
  'adjust_device',
] as const;

export type PerformanceAgentActionType =
  (typeof PERFORMANCE_AGENT_ACTION_TYPES)[number];

export const PERFORMANCE_AGENT_ACTION_MODES = [
  'manual',
  'semi_automatic',
  'informational',
] as const;

export type PerformanceAgentActionMode =
  (typeof PERFORMANCE_AGENT_ACTION_MODES)[number];

export type PerformanceAgentJsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type PerformanceAgentJsonValue =
  | PerformanceAgentJsonPrimitive
  | PerformanceAgentJsonObject
  | PerformanceAgentJsonArray;

export interface PerformanceAgentJsonObject {
  readonly [key: string]: PerformanceAgentJsonValue;
}

export interface PerformanceAgentJsonArray
  extends ReadonlyArray<PerformanceAgentJsonValue> {}

export type PerformanceAgentThresholdValue =
  | string
  | number
  | boolean
  | null;

export type PerformanceAgentThresholds = Readonly<
  Record<string, PerformanceAgentThresholdValue>
>;

export interface PerformanceAgentExecutionContext {
  readonly tenant_id: string;
  readonly client_id: string;
  readonly account_id: string | null;
  readonly membership_id: string | null;
  readonly request_id: string | null;
  readonly correlation_id: string | null;
  readonly trigger_source: PerformanceAgentTriggerSource;
  readonly trigger_reference: string | null;
}

export interface PerformanceAgentAnalysisWindow {
  readonly analysis_window_label: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly baseline_start: string | null;
  readonly baseline_end: string | null;
  readonly comparison_label: string;
}

export interface PerformanceAgentDataQuality {
  readonly is_sync_stale: boolean;
  readonly has_minimum_volume: boolean;
  readonly has_baseline: boolean;
  readonly warnings: readonly string[];
}

export interface PerformanceAgentEvidenceItem {
  readonly evidence_id: string;
  readonly metric: string;
  readonly current_value: number | null;
  readonly baseline_value: number | null;
  readonly delta_pct: number | null;
  readonly threshold_value: number | null;
  readonly window: string;
  readonly scope_label: string | null;
  readonly source_table: string | null;
  readonly note: string;
}

export interface PerformanceAgentAction {
  readonly action_type: PerformanceAgentActionType;
  readonly action_target: string | null;
  readonly description: string;
  readonly execution_mode: PerformanceAgentActionMode;
}

export interface PerformanceAgentOutputReference {
  readonly agent_name: PerformanceAgentName;
  readonly output_id: string;
  readonly output_hash: string;
}
