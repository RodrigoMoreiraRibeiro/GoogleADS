export type InsightNarrativeAudienceMode = 'technical' | 'executive' | 'dual';

export type InsightNarrativePriority = 'low' | 'medium' | 'high' | 'critical';

export type InsightNarrativeCorrelationType =
  | 'confirmed'
  | 'probable'
  | 'correlated_only'
  | 'insufficient_data';

export type InsightEntityScopeType =
  | 'account'
  | 'campaign'
  | 'device'
  | 'geo'
  | 'schedule'
  | 'keyword'
  | 'search_term'
  | 'tracking';

export interface InsightNarrativeEntity {
  scopeType: InsightEntityScopeType;
  scopeRef: string;
  scopeLabel: string;
}

export interface InsightNarrativePeriodContext {
  analysisWindow: string;
  periodStart: string;
  periodEnd: string;
  baselineStart?: string;
  baselineEnd?: string;
}

export interface InsightNarrativeFreshness {
  dataAsOf: string;
  syncStatus: 'ok' | 'partial' | 'lagging' | 'error';
  isIntradayPartial: boolean;
  selectedPeriodCompleteUntil?: string;
}

export interface InsightNarrativeRuleContext {
  ruleCode: string;
  ruleFamily: string;
  diagnosisCode: string;
  priority: InsightNarrativePriority;
  confidence: number;
  recommendedActionCandidates: string[];
}

export interface InsightNarrativeEvidenceItem {
  evidenceId: string;
  metric: string;
  currentValue?: number | null;
  baselineValue?: number | null;
  deltaPct?: number | null;
  window: string;
  interpretationHint: string;
}

export interface InsightNarrativeStyleConstraints {
  technicalMaxSentences: number;
  executiveMaxSentences: number;
  mustMentionDataGapWhenRelevant: boolean;
}

export interface InsightNarrativePayload {
  payloadVersion: string;
  locale: string;
  timezone: string;
  clientLabel: string;
  audienceMode: InsightNarrativeAudienceMode;
  entity: InsightNarrativeEntity;
  periodContext: InsightNarrativePeriodContext;
  dataFreshness: InsightNarrativeFreshness;
  ruleContext: InsightNarrativeRuleContext;
  summaryMetrics: Record<string, number | null>;
  evidenceItems: InsightNarrativeEvidenceItem[];
  allowedHypotheses: string[];
  allowedActions: string[];
  dataGaps: string[];
  forbiddenClaims: string[];
  styleConstraints: InsightNarrativeStyleConstraints;
}

export interface InsightNarrativeOutputBlock {
  headline: string;
  explanation: string;
  nextStep: string;
  caution?: string | null;
}

export interface InsightNarrativeResponse {
  responseVersion: string;
  title: string;
  diagnosis: string;
  primaryHypothesis: string;
  recommendedAction: string;
  expectedImpact: string;
  priority: InsightNarrativePriority;
  confidence: number;
  correlationType: InsightNarrativeCorrelationType;
  evidenceRefs: string[];
  dataLimitations: string[];
  technicalOutput: InsightNarrativeOutputBlock;
  executiveOutput: InsightNarrativeOutputBlock;
}
