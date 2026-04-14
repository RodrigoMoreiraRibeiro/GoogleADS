import type { OptimizationAgentView } from './optimization-agent';

export const LOCAL_WORKSPACE_PERIODS = ['last_7d', 'last_30d'] as const;
export const LOCAL_WORKSPACE_INSIGHT_LEVELS = [
  'technical',
  'executive',
] as const;

export type LocalWorkspacePeriod = (typeof LOCAL_WORKSPACE_PERIODS)[number];
export type LocalWorkspaceInsightLevel =
  (typeof LOCAL_WORKSPACE_INSIGHT_LEVELS)[number];

export interface LocalWorkspaceTenantOption {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly status: 'active' | 'suspended' | 'pending';
  readonly clientCount: number;
}

export interface LocalWorkspaceClientOption {
  readonly clientId: string;
  readonly clientName: string;
  readonly status: 'active' | 'paused' | 'archived';
  readonly accountCount: number;
  readonly lastMetricSyncAt: string | null;
}

export interface LocalWorkspaceContext {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly period: LocalWorkspacePeriod;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly lastSeededAt: string | null;
}

export interface LocalWorkspaceMetricCard {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly supportingText: string;
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
}

export interface LocalWorkspaceDailyPoint {
  readonly date: string;
  readonly spend: number;
  readonly conversions: number;
  readonly conversionsValue: number;
  readonly roas: number | null;
}

export interface LocalWorkspaceCampaignItem {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly status: string;
  readonly spend: number;
  readonly conversions: number;
  readonly conversionValue: number;
  readonly ctr: number | null;
  readonly cpa: number | null;
  readonly roas: number | null;
  readonly searchImpressionShare: number | null;
}

export interface LocalWorkspaceInsightItem {
  readonly insightId: string;
  readonly title: string;
  readonly category: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly summary: string;
  readonly recommendedAction: string;
  readonly generatedAt: string;
}

export interface LocalWorkspaceAnalysisRunInfo {
  readonly analysisRunId: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly generatedBy: 'system' | 'user';
  readonly comparisonLabel: string | null;
  readonly insightCount: number;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface LocalWorkspaceAgentInsightItem {
  readonly insightId: string;
  readonly analysisRunId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly entityLabel: string | null;
  readonly category: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly priorityBand: 'low' | 'medium' | 'high' | 'critical';
  readonly priorityScore: number;
  readonly confidenceBand: 'low' | 'moderate' | 'high' | 'very_high';
  readonly confidenceScore: number;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly hypothesisStatus:
    | 'confirmed'
    | 'plausible'
    | 'weak'
    | 'insufficient_evidence'
    | null;
  readonly title: string;
  readonly summary: string;
  readonly diagnosis: string;
  readonly technicalExplanation: string;
  readonly executiveExplanation: string;
  readonly recommendedAction: string;
  readonly recommendedActionType: string;
  readonly expectedImpact: string | null;
  readonly sourceAgentNames: readonly string[];
  readonly generatedAt: string;
}

export interface LocalWorkspaceAgentInsightsView {
  readonly lastAnalysis: LocalWorkspaceAnalysisRunInfo | null;
  readonly availableCategories: readonly string[];
  readonly topProblems: readonly LocalWorkspaceAgentInsightItem[];
  readonly topOpportunities: readonly LocalWorkspaceAgentInsightItem[];
  readonly prioritizedInsights: readonly LocalWorkspaceAgentInsightItem[];
}

export interface LocalWorkspaceReportItem {
  readonly reportId: string;
  readonly periodLabel: string;
  readonly audienceLevel: 'executive' | 'marketing' | 'technical';
  readonly outputFormat: 'pptx' | 'pdf' | 'html';
  readonly status: 'queued' | 'generating' | 'ready' | 'failed';
  readonly generatedAt: string | null;
  readonly storagePath: string | null;
  readonly headline: string;
}

export interface LocalWorkspaceConnectionItem {
  readonly accountId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly descriptiveName: string;
  readonly connectionStatus: 'active' | 'paused' | 'revoked' | 'error';
  readonly accountStatus: 'active' | 'paused' | 'removed' | 'disconnected';
  readonly syncFrequencyMinutes: number;
  readonly lastMetricSyncAt: string | null;
}

export interface LocalWorkspaceSyncHealth {
  readonly overallStatus: 'healthy' | 'warning' | 'stale';
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastFailedSyncAt: string | null;
  readonly queuedJobs: number;
  readonly failedJobs: number;
  readonly openIssues: number;
  readonly summary: string;
}

export interface LocalWorkspaceView {
  readonly availableTenants: LocalWorkspaceTenantOption[];
  readonly availableClients: LocalWorkspaceClientOption[];
  readonly context: LocalWorkspaceContext | null;
  readonly metricCards: LocalWorkspaceMetricCard[];
  readonly dailySeries: LocalWorkspaceDailyPoint[];
  readonly topCampaigns: LocalWorkspaceCampaignItem[];
  readonly insights: LocalWorkspaceInsightItem[];
  readonly optimizationAgent: OptimizationAgentView | null;
  readonly reports: LocalWorkspaceReportItem[];
  readonly connections: LocalWorkspaceConnectionItem[];
  readonly syncHealth: LocalWorkspaceSyncHealth | null;
  readonly lastAnalysis: LocalWorkspaceAnalysisRunInfo | null;
}

export interface LocalDemoSeedResponse {
  readonly tenantCount: number;
  readonly clientCount: number;
  readonly accountCount: number;
  readonly campaignCount: number;
  readonly insightCount: number;
  readonly reportCount: number;
  readonly seededAt: string;
}
