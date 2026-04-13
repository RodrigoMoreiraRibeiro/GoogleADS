export type InsightOutputEntityType =
  | 'account'
  | 'campaign'
  | 'device'
  | 'geo'
  | 'schedule'
  | 'keyword'
  | 'search_term'
  | 'tracking';

export type InsightOutputSeverity = 'info' | 'warning' | 'critical';

export type InsightOutputRiskLevel = 'low' | 'medium' | 'high';

export interface InsightOutputEvidenceItem {
  evidence_id: string;
  metric: string;
  current_value?: number | null;
  baseline_value?: number | null;
  delta_pct?: number | null;
  window: string;
  scope_label?: string | null;
  note: string;
}

export interface InsightOutputRecommendedAction {
  action_type: string;
  action_target: string | null;
  description: string;
  execution_mode: 'manual' | 'semi_automatic' | 'informational';
}

export interface InsightOutputExpectedImpact {
  impact_type: 'efficiency' | 'volume' | 'cost_control' | 'budget_allocation' | 'tracking' | 'mixed';
  direction: 'increase' | 'decrease' | 'protect' | 'investigate';
  summary: string;
}

export interface InsightOutputPeriodReference {
  analysis_window: string;
  period_start: string;
  period_end: string;
  baseline_start?: string | null;
  baseline_end?: string | null;
  comparison_label: string;
}

export interface InsightOutput {
  id: string;
  tenant_id: string;
  account_id: string | null;
  entity_type: InsightOutputEntityType;
  entity_id: string;
  category: string;
  severity: InsightOutputSeverity;
  priority_score: number;
  confidence_score: number;
  title: string;
  summary: string;
  evidence: InsightOutputEvidenceItem[];
  diagnosis: string;
  primary_hypothesis: string;
  alternative_hypotheses: string[];
  recommended_action: InsightOutputRecommendedAction;
  expected_impact: InsightOutputExpectedImpact;
  risk_level: InsightOutputRiskLevel;
  technical_explanation: string;
  executive_explanation: string;
  generated_at: string;
  period_reference: InsightOutputPeriodReference;
}
