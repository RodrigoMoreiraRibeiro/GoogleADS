import type {
  GoogleAdsSyncErrorContext,
  GoogleAdsSyncJob,
  GoogleAdsSyncScope,
  GoogleAdsSyncRunStatus,
  GoogleAdsSyncWindow,
  GoogleAdsSyncWriteResult,
} from '../domain/google-ads-sync.types';
import { GOOGLE_ADS_SYNC_SCOPES } from '../domain/google-ads-sync.types';
import type {
  ApiRequestLogRepository,
  DeadLetterQueueRepository,
  GoogleAdsFactWriter,
  GoogleAdsSyncGateway,
  GoogleAdsSyncRateLimiter,
  SyncCheckpointRepository,
  SyncJobRepository,
  SyncRunRepository,
} from '../infrastructure/google-ads-sync.ports';
import {
  redactSensitiveData,
  redactSensitiveString,
} from '../../../common/logging/redact-sensitive-data';
import { GoogleAdsSyncCheckpointService } from './google-ads-sync-checkpoint.service';
import { GoogleAdsSyncRetryPolicyService } from './google-ads-sync-retry-policy.service';
import { SyncRuntimeConfigService } from './sync-runtime-config.service';

const EMPTY_WRITE_RESULT: GoogleAdsSyncWriteResult = {
  rowsRead: 0,
  rowsInserted: 0,
  rowsUpdated: 0,
  rowsUpserted: 0,
  rowsSkipped: 0,
};

export interface ExecuteGoogleAdsSyncResult {
  readonly status: 'succeeded' | 'rescheduled' | 'failed' | 'partial';
  readonly nextRetryAt?: Date;
}

export class ExecuteGoogleAdsSyncUseCase<Row = unknown> {
  public constructor(
    private readonly syncJobRepository: SyncJobRepository,
    private readonly syncRunRepository: SyncRunRepository,
    private readonly checkpointRepository: SyncCheckpointRepository,
    private readonly apiRequestLogRepository: ApiRequestLogRepository,
    private readonly deadLetterQueueRepository: DeadLetterQueueRepository,
    private readonly rateLimiter: GoogleAdsSyncRateLimiter,
    private readonly gateway: GoogleAdsSyncGateway<Row>,
    private readonly factWriter: GoogleAdsFactWriter<Row>,
    private readonly retryPolicy: GoogleAdsSyncRetryPolicyService,
    private readonly checkpointService: GoogleAdsSyncCheckpointService,
    private readonly runtimeConfigService: SyncRuntimeConfigService,
  ) {}

  public async execute(
    job: GoogleAdsSyncJob,
  ): Promise<ExecuteGoogleAdsSyncResult> {
    const concurrencyKey = job.concurrencyKey ?? job.googleAdsAccountId;
    const acquired = await this.rateLimiter.acquire(concurrencyKey);

    if (!acquired) {
      const nextRetryAt = new Date(Date.now() + 60_000);
      await this.syncJobRepository.reschedule(
        job.id,
        nextRetryAt,
        'concurrency_limit',
      );

      return {
        status: 'rescheduled',
        nextRetryAt,
      };
    }

    const startedAt = new Date();
    const run = await this.syncRunRepository.start(job, startedAt);
    const checkpointKey = this.getCheckpointKey(job);
    const currentCheckpoint = await this.checkpointRepository.findByScope(
      job.tenantId,
      job.googleAdsAccountId,
      this.getScopeFromJob(job),
      checkpointKey,
    );

    let writeResult = EMPTY_WRITE_RESULT;
    let apiOperationCount = 0;
    let lastGoogleRequestId: string | undefined;

    try {
      const fetchResult = await this.gateway.fetch(job);
      apiOperationCount = fetchResult.requestLogs.length;
      lastGoogleRequestId =
        fetchResult.requestLogs[fetchResult.requestLogs.length - 1]
          ?.googleRequestId;

      if (fetchResult.requestLogs.length > 0) {
        await this.apiRequestLogRepository.recordMany(
          job.tenantId,
          job.clientId,
          job.googleAdsAccountId,
          job.id,
          run.id,
          fetchResult.requestLogs,
        );
      }

      writeResult = await this.factWriter.write(job, fetchResult.rows);

      const nextCheckpoint = this.checkpointService.advanceAfterSuccess({
        currentCheckpoint,
        run,
        window: this.getWindowFromJob(job),
        result: writeResult,
        reprocessDays: this.getReprocessDays(job.jobType),
        checkpointKey,
      });

      await this.checkpointRepository.save(nextCheckpoint);
      await this.syncRunRepository.finishSucceeded(
        run.id,
        new Date(),
        writeResult,
        apiOperationCount,
        lastGoogleRequestId,
      );
      await this.syncJobRepository.markSucceeded(job.id, new Date());

      return {
        status: 'succeeded',
      };
    } catch (unknownError) {
      const error = this.normalizeError(unknownError);
      const retryDecision = this.retryPolicy.decide(
        job.attemptCount + 1,
        job.maxAttempts,
        error,
      );
      const runStatus = this.toRunStatus(writeResult);

      await this.syncRunRepository.finishFailed(
        run.id,
        runStatus,
        new Date(),
        writeResult,
        error,
        apiOperationCount,
        lastGoogleRequestId,
      );

      const unchangedCheckpoint =
        this.checkpointService.keepPositionAfterFailure({
          currentCheckpoint,
          run,
          checkpointKey,
          status: runStatus,
        });
      await this.checkpointRepository.save(unchangedCheckpoint);

      if (retryDecision.shouldRetry && retryDecision.nextDelayMs !== undefined) {
        const nextRetryAt = new Date(Date.now() + retryDecision.nextDelayMs);
        await this.syncJobRepository.reschedule(
          job.id,
          nextRetryAt,
          error.message,
        );

        return {
          status: 'rescheduled',
          nextRetryAt,
        };
      }

      if (runStatus === 'partial') {
        await this.syncJobRepository.markPartial(
          job.id,
          new Date(),
          error.code,
          error.message,
        );
      } else {
        await this.syncJobRepository.markFailed(
          job.id,
          new Date(),
          error.code,
          error.message,
        );
      }

      await this.deadLetterQueueRepository.push({
        tenantId: job.tenantId,
        clientId: job.clientId,
        googleAdsAccountId: job.googleAdsAccountId,
        syncJobId: job.id,
        syncRunId: run.id,
        dedupeKey: job.dedupeKey,
        failureClass: retryDecision.failureClass,
        failureReason: error.message,
        payload: {
          jobType: job.jobType,
          requestWindowStart: job.requestWindowStart?.toISOString(),
          requestWindowEnd: job.requestWindowEnd?.toISOString(),
          errorCode: error.code,
          errorDetails: redactSensitiveData(error.details),
        },
      });

      return {
        status: runStatus,
      };
    } finally {
      await this.rateLimiter.release(concurrencyKey);
    }
  }

  private getCheckpointKey(job: GoogleAdsSyncJob): string {
    return String(job.payload.checkpointKey ?? this.getScopeFromJob(job));
  }

  private getScopeFromJob(job: GoogleAdsSyncJob): GoogleAdsSyncScope {
    const payloadScope = job.payload.scope;

    if (typeof payloadScope === 'string') {
      if (payloadScope.includes('search_term')) {
        return 'search_term_daily';
      }

      if (
        GOOGLE_ADS_SYNC_SCOPES.includes(
          payloadScope as GoogleAdsSyncScope,
        )
      ) {
        return payloadScope as GoogleAdsSyncScope;
      }
    }

    return this.mapJobTypeToScope(job.jobType);
  }

  private mapJobTypeToScope(
    jobType: GoogleAdsSyncJob['jobType'],
  ): GoogleAdsSyncScope {
    switch (jobType) {
      case 'initial_backfill_account_daily':
      case 'daily_account':
      case 'recent_reprocess_account':
        return 'account_daily';
      case 'initial_backfill_campaign_daily':
      case 'daily_campaign':
      case 'recent_reprocess_campaign':
        return 'campaign_daily';
      case 'initial_backfill_campaign_device_daily':
      case 'daily_campaign_device':
      case 'recent_reprocess_campaign_device':
        return 'campaign_device_daily';
      case 'initial_backfill_campaign_hourly':
      case 'daily_campaign_hourly':
      case 'recent_reprocess_campaign_hourly':
        return 'campaign_hourly';
      case 'initial_backfill_campaign_geo_daily':
      case 'daily_campaign_geo':
      case 'recent_reprocess_campaign_geo':
        return 'campaign_geo_daily';
      case 'intraday_account':
        return 'intraday_account';
      case 'intraday_campaign':
        return 'intraday_campaign';
      case 'daily_search_term':
      case 'recent_reprocess_search_term':
        return 'search_term_daily';
      default:
        return 'metadata';
    }
  }

  private getWindowFromJob(job: GoogleAdsSyncJob): GoogleAdsSyncWindow {
    const startDate = job.requestWindowStart ?? new Date();
    const endDate = job.requestWindowEnd ?? startDate;

    return {
      scope: this.getScopeFromJob(job),
      kind: String(job.payload.kind ?? 'catchup') as GoogleAdsSyncWindow['kind'],
      startDate,
      endDate,
    };
  }

  private getReprocessDays(jobType: GoogleAdsSyncJob['jobType']): number {
    const runtimeConfig = this.runtimeConfigService.get();

    if (
      jobType === 'recent_reprocess_campaign_device' ||
      jobType === 'recent_reprocess_campaign_hourly' ||
      jobType === 'recent_reprocess_campaign_geo' ||
      jobType === 'recent_reprocess_search_term'
    ) {
      return 3;
    }

    return runtimeConfig.recentReprocessDays;
  }

  private normalizeError(unknownError: unknown): GoogleAdsSyncErrorContext {
    if (unknownError instanceof Error) {
      const details =
        typeof unknownError.cause === 'object' && unknownError.cause !== null
          ? (unknownError.cause as Record<string, unknown>)
          : undefined;

      return {
        code: this.tryReadStringField(unknownError, 'code'),
        message: redactSensitiveString(unknownError.message),
        httpStatus: this.tryReadNumberField(unknownError, 'status'),
        grpcStatusCode: this.tryReadStringField(unknownError, 'grpcStatusCode'),
        isRetryable: this.tryReadBooleanField(unknownError, 'retryable'),
        details: redactSensitiveData(details),
      };
    }

    return {
      message: 'Unknown Google Ads sync failure',
    };
  }

  private toRunStatus(
    result: GoogleAdsSyncWriteResult,
  ): Extract<GoogleAdsSyncRunStatus, 'failed' | 'partial'> {
    return result.rowsUpserted > 0 || result.rowsInserted > 0
      ? 'partial'
      : 'failed';
  }

  private tryReadStringField(
    source: object,
    field: string,
  ): string | undefined {
    const value = Reflect.get(source, field);
    return typeof value === 'string' ? value : undefined;
  }

  private tryReadNumberField(
    source: object,
    field: string,
  ): number | undefined {
    const value = Reflect.get(source, field);
    return typeof value === 'number' ? value : undefined;
  }

  private tryReadBooleanField(
    source: object,
    field: string,
  ): boolean | undefined {
    const value = Reflect.get(source, field);
    return typeof value === 'boolean' ? value : undefined;
  }
}
