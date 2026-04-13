export const GOOGLE_ADS_SYNC_SCOPES = [
  'metadata',
  'account_daily',
  'campaign_daily',
  'campaign_device_daily',
  'campaign_hourly',
  'campaign_geo_daily',
  'search_term_daily',
  'intraday_account',
  'intraday_campaign',
] as const;

export type GoogleAdsSyncScope = (typeof GOOGLE_ADS_SYNC_SCOPES)[number];

export const GOOGLE_ADS_SYNC_JOB_TYPES = [
  'account_discovery',
  'metadata_change_scan',
  'metadata_refresh',
  'initial_backfill_account_daily',
  'initial_backfill_campaign_daily',
  'initial_backfill_campaign_device_daily',
  'initial_backfill_campaign_hourly',
  'initial_backfill_campaign_geo_daily',
  'intraday_account',
  'intraday_campaign',
  'daily_account',
  'daily_campaign',
  'daily_campaign_device',
  'daily_campaign_hourly',
  'daily_campaign_geo',
  'daily_search_term',
  'recent_reprocess_account',
  'recent_reprocess_campaign',
  'recent_reprocess_campaign_device',
  'recent_reprocess_campaign_hourly',
  'recent_reprocess_campaign_geo',
  'recent_reprocess_search_term',
] as const;

export type GoogleAdsSyncJobType = (typeof GOOGLE_ADS_SYNC_JOB_TYPES)[number];

export type GoogleAdsSyncMode = 'initial' | 'incremental' | 'manual';
export type GoogleAdsSyncTrigger = 'scheduler' | 'manual' | 'retry' | 'system';
export type GoogleAdsSyncJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'partial'
  | 'cancelled';
export type GoogleAdsSyncRunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'partial'
  | 'cancelled';
export type GoogleAdsSyncWindowKind =
  | 'initial_backfill'
  | 'catchup'
  | 'reprocess'
  | 'intraday';
export type GoogleAdsSyncFailureClass =
  | 'auth'
  | 'quota'
  | 'retry_exhausted'
  | 'validation'
  | 'sync'
  | 'unknown';

export interface GoogleAdsSyncWindow {
  readonly scope: GoogleAdsSyncScope;
  readonly kind: GoogleAdsSyncWindowKind;
  readonly startDate: Date;
  readonly endDate: Date;
}

export interface GoogleAdsSyncCheckpoint {
  readonly tenantId: string;
  readonly clientId?: string | undefined;
  readonly googleAdsAccountId: string;
  readonly scope: GoogleAdsSyncScope;
  readonly checkpointKey: string;
  readonly watermarkDate?: Date | undefined;
  readonly watermarkDateTime?: Date | undefined;
  readonly safeReprocessFrom?: Date | undefined;
  readonly lastCompleteDate?: Date | undefined;
  readonly lastStatus: 'idle' | 'running' | 'succeeded' | 'failed' | 'partial';
  readonly lastSuccessRunId?: string | undefined;
}

export interface GoogleAdsSyncJob {
  readonly id: string;
  readonly tenantId: string;
  readonly clientId?: string | undefined;
  readonly googleAdsAccountId: string;
  readonly jobType: GoogleAdsSyncJobType;
  readonly queueName: string;
  readonly status: GoogleAdsSyncJobStatus;
  readonly priority: number;
  readonly dedupeKey?: string | undefined;
  readonly concurrencyKey?: string | undefined;
  readonly triggeredBy: GoogleAdsSyncTrigger;
  readonly scheduledFor: Date;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly requestWindowStart?: Date | undefined;
  readonly requestWindowEnd?: Date | undefined;
  readonly payload: Record<string, unknown>;
}

export interface GoogleAdsSyncRun {
  readonly id: string;
  readonly tenantId: string;
  readonly clientId?: string | undefined;
  readonly googleAdsAccountId: string;
  readonly syncJobId?: string | undefined;
  readonly runUuid: string;
  readonly jobType: GoogleAdsSyncJobType;
  readonly entityScope: GoogleAdsSyncScope;
  readonly status: GoogleAdsSyncRunStatus;
  readonly attemptNumber: number;
  readonly requestWindowStart?: Date | undefined;
  readonly requestWindowEnd?: Date | undefined;
  readonly startedAt: Date;
  readonly finishedAt?: Date | undefined;
}

export interface GoogleAdsSyncPlanItem {
  readonly tenantId: string;
  readonly clientId?: string | undefined;
  readonly googleAdsAccountId: string;
  readonly scope: GoogleAdsSyncScope;
  readonly jobType: GoogleAdsSyncJobType;
  readonly queueName: string;
  readonly priority: number;
  readonly dedupeKey: string;
  readonly concurrencyKey: string;
  readonly triggeredBy: GoogleAdsSyncTrigger;
  readonly window: GoogleAdsSyncWindow;
  readonly payload: Record<string, unknown>;
}

export interface GoogleAdsSyncWriteResult {
  readonly rowsRead: number;
  readonly rowsInserted: number;
  readonly rowsUpdated: number;
  readonly rowsUpserted: number;
  readonly rowsSkipped: number;
  readonly maxObservedDate?: Date | undefined;
  readonly maxObservedDateTime?: Date | undefined;
}

export interface GoogleAdsApiRequestLogEntry {
  readonly requestScope: 'metadata' | 'metrics' | 'reprocess' | 'search_term';
  readonly apiMethod: 'search' | 'search_stream' | 'get' | 'mutate';
  readonly resourceName: string;
  readonly googleRequestId?: string | undefined;
  readonly gaqlFingerprint?: string | undefined;
  readonly gaqlQueryExcerpt?: string | undefined;
  readonly dateFrom?: Date | undefined;
  readonly dateTo?: Date | undefined;
  readonly httpStatus?: number | undefined;
  readonly grpcStatusCode?: string | undefined;
  readonly success: boolean;
  readonly retryAttempt: number;
  readonly durationMs: number;
  readonly responseRowCount?: number | undefined;
  readonly responseBatchCount?: number | undefined;
  readonly errorCode?: string | undefined;
  readonly errorMessage?: string | undefined;
  readonly requestedAt: Date;
  readonly finishedAt?: Date | undefined;
}

export interface GoogleAdsSyncErrorContext {
  readonly code?: string | undefined;
  readonly message: string;
  readonly httpStatus?: number | undefined;
  readonly grpcStatusCode?: string | undefined;
  readonly isRetryable?: boolean | undefined;
  readonly details?: Record<string, unknown> | undefined;
}
