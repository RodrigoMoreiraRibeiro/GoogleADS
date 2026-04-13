import type {
  GoogleAdsApiRequestLogEntry,
  GoogleAdsSyncCheckpoint,
  GoogleAdsSyncErrorContext,
  GoogleAdsSyncFailureClass,
  GoogleAdsSyncJob,
  GoogleAdsSyncPlanItem,
  GoogleAdsSyncRun,
  GoogleAdsSyncScope,
  GoogleAdsSyncWriteResult,
} from '../domain/google-ads-sync.types';

export interface SyncJobRepository {
  findOpenDedupeKeys(
    tenantId: string,
    dedupeKeys: readonly string[],
  ): Promise<ReadonlySet<string>>;
  enqueueMany(jobs: readonly GoogleAdsSyncPlanItem[]): Promise<void>;
  reschedule(
    jobId: string,
    nextScheduledFor: Date,
    reason: string,
  ): Promise<void>;
  markSucceeded(jobId: string, finishedAt: Date): Promise<void>;
  markFailed(
    jobId: string,
    finishedAt: Date,
    errorCode?: string | undefined,
    errorMessage?: string | undefined,
  ): Promise<void>;
  markPartial(
    jobId: string,
    finishedAt: Date,
    errorCode?: string | undefined,
    errorMessage?: string | undefined,
  ): Promise<void>;
}

export interface SyncRunRepository {
  start(job: GoogleAdsSyncJob, startedAt: Date): Promise<GoogleAdsSyncRun>;
  finishSucceeded(
    runId: string,
    finishedAt: Date,
    result: GoogleAdsSyncWriteResult,
    apiOperationCount: number,
    lastGoogleRequestId?: string | undefined,
  ): Promise<void>;
  finishFailed(
    runId: string,
    status: 'failed' | 'partial',
    finishedAt: Date,
    result: GoogleAdsSyncWriteResult,
    error: GoogleAdsSyncErrorContext,
    apiOperationCount: number,
    lastGoogleRequestId?: string | undefined,
  ): Promise<void>;
}

export interface SyncCheckpointRepository {
  findByScope(
    tenantId: string,
    googleAdsAccountId: string,
    scope: GoogleAdsSyncScope,
    checkpointKey: string,
  ): Promise<GoogleAdsSyncCheckpoint | null>;
  save(checkpoint: GoogleAdsSyncCheckpoint): Promise<void>;
}

export interface ApiRequestLogRepository {
  recordMany(
    tenantId: string,
    clientId: string | undefined,
    googleAdsAccountId: string,
    syncJobId: string | undefined,
    syncRunId: string,
    entries: readonly GoogleAdsApiRequestLogEntry[],
  ): Promise<void>;
}

export interface DeadLetterQueueRepository {
  push(entry: {
    tenantId: string;
    clientId?: string | undefined;
    googleAdsAccountId: string;
    syncJobId?: string | undefined;
    syncRunId?: string | undefined;
    dedupeKey?: string | undefined;
    failureClass: GoogleAdsSyncFailureClass;
    failureReason: string;
    payload?: Record<string, unknown> | undefined;
  }): Promise<void>;
}

export interface GoogleAdsSyncRateLimiter {
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}

export interface GoogleAdsSyncFetchResult<Row> {
  readonly rows: readonly Row[];
  readonly requestLogs: readonly GoogleAdsApiRequestLogEntry[];
}

export interface GoogleAdsSyncGateway<Row = unknown> {
  fetch(job: GoogleAdsSyncJob): Promise<GoogleAdsSyncFetchResult<Row>>;
}

export interface GoogleAdsFactWriter<Row = unknown> {
  write(
    job: GoogleAdsSyncJob,
    rows: readonly Row[],
  ): Promise<GoogleAdsSyncWriteResult>;
}
