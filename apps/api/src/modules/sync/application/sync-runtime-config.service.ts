import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ApiEnvironment } from '../../../common/config/environment';

export interface GoogleAdsSyncRuntimeConfig {
  readonly initialBackfillDays: number;
  readonly recentReprocessDays: number;
  readonly heavyReprocessDays: number;
  readonly searchTermReprocessDays: number;
  readonly accountDailyChunkDays: number;
  readonly campaignDailyChunkDays: number;
  readonly heavyGranularityChunkDays: number;
  readonly searchTermChunkDays: number;
  readonly intradayMinimumIntervalHours: number;
  readonly intradayStartHour: number;
  readonly intradayEndHour: number;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly queueConcurrency: number;
}

@Injectable()
export class SyncRuntimeConfigService {
  public constructor(
    private readonly configService: ConfigService<ApiEnvironment, true>,
  ) {}

  public get(): GoogleAdsSyncRuntimeConfig {
    return {
      initialBackfillDays: this.configService.get(
        'SYNC_INITIAL_BACKFILL_DAYS',
        {
          infer: true,
        },
      ),
      recentReprocessDays: this.configService.get(
        'SYNC_RECENT_REPROCESS_DAYS',
        {
          infer: true,
        },
      ),
      heavyReprocessDays: 3,
      searchTermReprocessDays: 3,
      accountDailyChunkDays: 30,
      campaignDailyChunkDays: 30,
      heavyGranularityChunkDays: 7,
      searchTermChunkDays: 1,
      intradayMinimumIntervalHours: 2,
      intradayStartHour: 6,
      intradayEndHour: 22,
      maxAttempts: this.configService.get('JOB_MAX_ATTEMPTS', {
        infer: true,
      }),
      retryBaseDelayMs: this.configService.get('JOB_RETRY_BASE_DELAY_MS', {
        infer: true,
      }),
      queueConcurrency: this.configService.get('QUEUE_CONCURRENCY', {
        infer: true,
      }),
    };
  }
}
