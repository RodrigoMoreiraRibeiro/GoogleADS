import { Injectable } from '@nestjs/common';

import type {
  GoogleAdsSyncCheckpoint,
  GoogleAdsSyncRun,
  GoogleAdsSyncWindow,
  GoogleAdsSyncWriteResult,
} from '../domain/google-ads-sync.types';
import { addUtcDays, maxDate, startOfUtcDay } from './sync-date.utils';

@Injectable()
export class GoogleAdsSyncCheckpointService {
  public advanceAfterSuccess(input: {
    currentCheckpoint: GoogleAdsSyncCheckpoint | null;
    run: GoogleAdsSyncRun;
    window: GoogleAdsSyncWindow;
    result: GoogleAdsSyncWriteResult;
    reprocessDays: number;
    checkpointKey: string;
  }): GoogleAdsSyncCheckpoint {
    const windowEndDate = startOfUtcDay(input.window.endDate);
    const maxObservedDate = input.result.maxObservedDate
      ? startOfUtcDay(input.result.maxObservedDate)
      : windowEndDate;
    const maxObservedDateTime =
      input.result.maxObservedDateTime ?? input.window.endDate;
    const isIntradayScope =
      input.run.entityScope === 'intraday_account' ||
      input.run.entityScope === 'intraday_campaign';
    const lastCompleteDate = isIntradayScope
      ? input.currentCheckpoint?.lastCompleteDate
      : input.currentCheckpoint?.lastCompleteDate
        ? maxDate(input.currentCheckpoint.lastCompleteDate, maxObservedDate)
        : maxObservedDate;
    const safeReprocessFrom = isIntradayScope
      ? input.currentCheckpoint?.safeReprocessFrom
      : addUtcDays(windowEndDate, -(input.reprocessDays - 1));

    return {
      tenantId: input.run.tenantId,
      clientId: input.run.clientId,
      googleAdsAccountId: input.run.googleAdsAccountId,
      scope: input.run.entityScope,
      checkpointKey: input.checkpointKey,
      watermarkDate: maxObservedDate,
      watermarkDateTime: maxObservedDateTime,
      safeReprocessFrom,
      lastCompleteDate,
      lastStatus: 'succeeded',
      lastSuccessRunId: input.run.id,
    };
  }

  public keepPositionAfterFailure(input: {
    currentCheckpoint: GoogleAdsSyncCheckpoint | null;
    run: GoogleAdsSyncRun;
    checkpointKey: string;
    status: 'failed' | 'partial';
  }): GoogleAdsSyncCheckpoint {
    return {
      tenantId: input.run.tenantId,
      clientId: input.run.clientId,
      googleAdsAccountId: input.run.googleAdsAccountId,
      scope: input.run.entityScope,
      checkpointKey: input.checkpointKey,
      watermarkDate: input.currentCheckpoint?.watermarkDate,
      watermarkDateTime: input.currentCheckpoint?.watermarkDateTime,
      safeReprocessFrom: input.currentCheckpoint?.safeReprocessFrom,
      lastCompleteDate: input.currentCheckpoint?.lastCompleteDate,
      lastStatus: input.status,
      lastSuccessRunId: input.currentCheckpoint?.lastSuccessRunId,
    };
  }
}
