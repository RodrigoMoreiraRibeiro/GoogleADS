import type {
  AgentFinding,
  AgentInput,
  AgentOutput,
  PerformanceAgentActionType,
  PerformanceAgentAnalysisWindow,
  PerformanceAgentCategory,
  PerformanceAgentConfidenceBand,
  PerformanceAgentDataQuality,
  PerformanceAgentEntityType,
  PerformanceAgentEvidenceItem,
  PerformanceAgentJsonValue,
  PerformanceAgentName,
  PerformanceAgentPriorityBand,
  PerformanceAgentRiskLevel,
  PerformanceAgentSeverity,
  PerformanceAgentSummary,
} from '@googleads/shared';

export interface PerformanceAnalysisRunContext {
  readonly analysisRunId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly accountId: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly baselineStart: string | null;
  readonly baselineEnd: string | null;
  readonly comparisonLabel: string;
  readonly triggeredByUserId: string | null;
  readonly generatedBy: 'system' | 'user';
}

export interface PerformanceMetricsSnapshot {
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly conversionValue: number;
  readonly ctr: number | null;
  readonly cpa: number | null;
  readonly roas: number | null;
}

export interface CampaignPerformanceSnapshot extends PerformanceMetricsSnapshot {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly status: string;
  readonly searchImpressionShare: number | null;
}

export interface SegmentationPerformanceSnapshot extends PerformanceMetricsSnapshot {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly dimension: 'device' | 'geo' | 'schedule' | 'day_of_week';
  readonly dimensionValue: string;
}

export interface SearchTermPerformanceSnapshot extends PerformanceMetricsSnapshot {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly searchTerm: string;
}

export interface SyncHealthSnapshot {
  readonly overallStatus: 'healthy' | 'warning' | 'stale';
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastFailedSyncAt: string | null;
  readonly queuedJobs: number;
  readonly failedJobs: number;
  readonly openIssues: number;
}

export interface AccountWindowComparison {
  readonly windowLabel: 'last_7d' | 'last_14d' | 'last_30d';
  readonly sampleDays: 7 | 14 | 30;
  readonly current: PerformanceMetricsSnapshot | null;
  readonly baseline: PerformanceMetricsSnapshot | null;
}

export interface PerformanceFeatureBundle {
  readonly account_summary_current: PerformanceMetricsSnapshot | null;
  readonly account_summary_baseline: PerformanceMetricsSnapshot | null;
  readonly account_window_comparisons: readonly AccountWindowComparison[];
  readonly campaign_summaries_current: readonly CampaignPerformanceSnapshot[];
  readonly campaign_summaries_baseline: readonly CampaignPerformanceSnapshot[];
  readonly segmentation_rows_current: readonly SegmentationPerformanceSnapshot[];
  readonly segmentation_rows_baseline: readonly SegmentationPerformanceSnapshot[];
  readonly search_terms_available: boolean;
  readonly search_term_rows_current: readonly SearchTermPerformanceSnapshot[];
  readonly search_term_rows_baseline: readonly SearchTermPerformanceSnapshot[];
  readonly sync_health: SyncHealthSnapshot | null;
}

export interface PerformanceAgentRuntimeConfig {
  readonly schemaVersion: string;
  readonly orchestratorVersion: string;
  readonly thresholds: Readonly<Record<string, string | number | boolean | null>>;
  readonly optionalAgentNames: readonly PerformanceAgentName[];
}

export interface PersistedAgentRunRecord {
  readonly agentRunId: string;
  readonly dedupeKey: string;
}

export interface PersistAgentRunStartInput {
  readonly analysisRunId: string;
  readonly orchestratorRunUuid: string;
  readonly agentName: PerformanceAgentName;
  readonly agentVersion: string;
  readonly tenantId: string;
  readonly clientId: string;
  readonly accountId: string | null;
  readonly analysisWindow: PerformanceAgentAnalysisWindow;
  readonly dataQuality: PerformanceAgentDataQuality;
  readonly dedupeKey: string;
}

export interface PersistAgentRunFailureInput {
  readonly agentRunId: string;
  readonly status: 'failed' | 'insufficient_data' | 'skipped';
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly summary: string;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly outputJson: Record<string, PerformanceAgentJsonValue>;
}

export interface PersistAgentRunSuccessInput {
  readonly agentRunId: string;
  readonly output: AgentOutput;
}

export interface PerformanceConflictRecord {
  readonly entityType: string;
  readonly entityId: string;
  readonly conflictType: string;
  readonly sourceAgents: readonly PerformanceAgentName[];
  readonly resolution: string;
}

export interface PerformanceInsightUpsertRecord {
  readonly consolidatedInsight: PerformanceConsolidatedInsightDraft;
  readonly sourceRunId: string;
}

export interface PersistedInsightSnapshotRecord {
  readonly insightId: string;
  readonly versionId: string | null;
  readonly versionNumber: number;
  readonly contentHash: string;
  readonly payloadHash: string;
  readonly isNewVersion: boolean;
}

export interface PerformanceConsolidatedInsightDraft {
  readonly tenantId: string;
  readonly clientId: string;
  readonly accountId: string | null;
  readonly entityType: PerformanceAgentEntityType;
  readonly entityId: string;
  readonly entityLabel: string | null;
  readonly category: PerformanceAgentCategory;
  readonly severity: PerformanceAgentSeverity;
  readonly priorityBand: PerformanceAgentPriorityBand;
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly confidenceBand: PerformanceAgentConfidenceBand;
  readonly riskLevel: PerformanceAgentRiskLevel;
  readonly sourceAgentNames: readonly PerformanceAgentName[];
  readonly title: string;
  readonly summary: string;
  readonly diagnosis: string;
  readonly primaryHypothesis: string;
  readonly alternativeHypotheses: readonly string[];
  readonly hypothesisStatus: AgentFinding['hypothesis_status'];
  readonly recommendedAction: {
    readonly actionType: PerformanceAgentActionType;
    readonly actionTarget: string | null;
    readonly description: string;
  };
  readonly expectedImpact: string;
  readonly technicalExplanation: string;
  readonly executiveExplanation: string;
  readonly evidenceJson: readonly PerformanceAgentEvidenceItem[];
  readonly reviewNotes: readonly string[];
  readonly blockedClaims: readonly string[];
  readonly nextSteps: readonly string[];
  readonly analysisWindow: PerformanceAgentAnalysisWindow;
  readonly dataQuality: PerformanceAgentDataQuality;
  readonly generatedAt: string;
}

export interface PerformanceAgentExecutionResult {
  readonly orchestratorRunUuid: string;
  readonly analysisRunId: string;
  readonly summary: PerformanceAgentSummary;
  readonly agentOutputs: readonly AgentOutput[];
  readonly persistedInsights: number;
  readonly partialFailures: readonly {
    readonly agentName: PerformanceAgentName;
    readonly reason: string;
  }[];
}

export interface AnalysisRunHistoryListItem {
  readonly analysisRunId: string;
  readonly tenantId: string;
  readonly clientId: string;
  readonly accountId: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly baselineStart: string | null;
  readonly baselineEnd: string | null;
  readonly comparisonLabel: string | null;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly generatedBy: 'system' | 'user';
  readonly orchestratorRunUuid: string | null;
  readonly insightCount: number;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface AgentOutputHistoryItem {
  readonly agentRunId: string;
  readonly analysisRunId: string;
  readonly agentName: PerformanceAgentName;
  readonly agentVersion: string;
  readonly status: string;
  readonly priorityScore: number | null;
  readonly confidenceScore: number | null;
  readonly summary: string | null;
  readonly recommendedFocus: string | null;
  readonly outputHash: string | null;
  readonly findingsCount: number;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface AnalysisRunInsightSnapshot {
  readonly insightRunItemId: string;
  readonly analysisRunId: string;
  readonly insightId: string;
  readonly insightVersionId: string | null;
  readonly versionNumber: number | null;
  readonly insightKey: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
  readonly category: string;
  readonly severity: string;
  readonly hypothesisStatus: string | null;
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly runChangeType: 'new' | 'updated' | 'unchanged';
  readonly contentHash: string;
  readonly payloadJson: PerformanceAgentJsonValue;
  readonly generatedAt: string;
}

export interface AnalysisRunComparisonItem {
  readonly insightKey: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
  readonly leftVersionNumber: number | null;
  readonly rightVersionNumber: number | null;
  readonly leftPriorityScore: number | null;
  readonly rightPriorityScore: number | null;
  readonly leftConfidenceScore: number | null;
  readonly rightConfidenceScore: number | null;
  readonly changeType: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface AnalysisRunComparisonResult {
  readonly leftAnalysisRunId: string;
  readonly rightAnalysisRunId: string;
  readonly items: readonly AnalysisRunComparisonItem[];
}

export interface PerformanceAgentPayloadBuilderInput {
  readonly agentName: PerformanceAgentName;
  readonly agentVersion: string;
  readonly runContext: PerformanceAnalysisRunContext;
  readonly dataQuality: PerformanceAgentDataQuality;
  readonly thresholds: Readonly<Record<string, string | number | boolean | null>>;
  readonly features: Record<string, PerformanceAgentJsonValue>;
  readonly upstreamOutputs: readonly AgentOutput[];
  readonly requestId: string | null;
  readonly correlationId: string | null;
}

export type AgentFindingConflictLevel = 'none' | 'soft' | 'hard';

export interface ReviewedFindingCandidate {
  readonly finding: AgentFinding;
  readonly conflictLevel: AgentFindingConflictLevel;
}

export interface DedupedFindingResult {
  readonly findings: readonly AgentFinding[];
  readonly conflicts: readonly PerformanceConflictRecord[];
}
