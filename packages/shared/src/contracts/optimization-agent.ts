export type OptimizationAgentStatus = 'ready' | 'insufficient_data';

export type OptimizationEntityType = 'account' | 'campaign';

export type OptimizationPriority = 'low' | 'medium' | 'high' | 'critical';

export type OptimizationRiskLevel = 'low' | 'medium' | 'high';

export interface OptimizationEvidenceItem {
  readonly label: string;
  readonly metric: string;
  readonly currentValue: number | null;
  readonly baselineValue: number | null;
  readonly deltaPct: number | null;
  readonly note: string;
}

export interface OptimizationRecommendation {
  readonly recommendationId: string;
  readonly ruleCode: string;
  readonly entityType: OptimizationEntityType;
  readonly entityId: string;
  readonly entityLabel: string;
  readonly priority: OptimizationPriority;
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly riskLevel: OptimizationRiskLevel;
  readonly title: string;
  readonly summary: string;
  readonly diagnosis: string;
  readonly recommendedAction: string;
  readonly expectedImpact: string;
  readonly technicalExplanation: string;
  readonly executiveExplanation: string;
  readonly evidence: OptimizationEvidenceItem[];
}

export interface OptimizationAgentView {
  readonly status: OptimizationAgentStatus;
  readonly generatedAt: string;
  readonly summary: string;
  readonly recommendedFocus: string;
  readonly recommendations: OptimizationRecommendation[];
}
