import { Injectable } from '@nestjs/common';

import type {
  GoogleAdsSyncCheckpoint,
  GoogleAdsSyncJobType,
  GoogleAdsSyncMode,
  GoogleAdsSyncPlanItem,
  GoogleAdsSyncScope,
  GoogleAdsSyncWindow,
  GoogleAdsSyncWindowKind,
} from '../domain/google-ads-sync.types';
import { addUtcDays, isAfterOrEqual, isBeforeOrEqual, startOfUtcDay } from './sync-date.utils';
import { SyncDedupeKeyBuilderService } from './sync-dedupe-key-builder.service';
import { type GoogleAdsSyncRuntimeConfig, SyncRuntimeConfigService } from './sync-runtime-config.service';

interface ScopePlanSpec {
  readonly scope: GoogleAdsSyncScope;
  readonly initialJobType: GoogleAdsSyncJobType;
  readonly incrementalJobType: GoogleAdsSyncJobType;
  readonly reprocessJobType?: GoogleAdsSyncJobType;
  readonly initialChunkDays: number;
  readonly regularChunkDays: number;
  readonly reprocessDays: number;
  readonly queueName: string;
  readonly priority: number;
  readonly concurrencyKeySuffix: string;
  readonly intraday: boolean;
  readonly enabledByDefault: boolean;
}

export interface ScheduleGoogleAdsSyncPlanCommand {
  readonly tenantId: string;
  readonly clientId?: string;
  readonly googleAdsAccountId: string;
  readonly mode: GoogleAdsSyncMode;
  readonly referenceTime: Date;
  readonly checkpoints: ReadonlyMap<GoogleAdsSyncScope, GoogleAdsSyncCheckpoint>;
  readonly allowSearchTerms?: boolean;
}

@Injectable()
export class GoogleAdsSyncWindowPlannerService {
  private readonly config: GoogleAdsSyncRuntimeConfig;

  public constructor(
    private readonly runtimeConfigService: SyncRuntimeConfigService,
    private readonly dedupeKeyBuilder: SyncDedupeKeyBuilderService,
  ) {
    this.config = this.runtimeConfigService.get();
  }

  public plan(command: ScheduleGoogleAdsSyncPlanCommand): GoogleAdsSyncPlanItem[] {
    const plannedItems: GoogleAdsSyncPlanItem[] = [];
    const yesterday = addUtcDays(startOfUtcDay(command.referenceTime), -1);
    const today = startOfUtcDay(command.referenceTime);

    for (const spec of this.getScopePlanSpecs(command.allowSearchTerms ?? false)) {
      const checkpoint = command.checkpoints.get(spec.scope) ?? null;

      if (spec.intraday) {
        if (command.mode === 'initial' || !this.shouldRunIntraday(command.referenceTime, checkpoint)) {
          continue;
        }

        plannedItems.push(
          this.toPlanItem({
            command,
            spec,
            window: {
              scope: spec.scope,
              kind: 'intraday',
              startDate: today,
              endDate: today,
            },
            jobType: spec.incrementalJobType,
          }),
        );
        continue;
      }

      if (command.mode === 'initial' || this.isCheckpointUninitialized(checkpoint)) {
        const initialStartDate = addUtcDays(
          yesterday,
          -(this.config.initialBackfillDays - 1),
        );

        plannedItems.push(
          ...this.chunkWindowRange({
            command,
            spec,
            startDate: initialStartDate,
            endDate: yesterday,
            kind: 'initial_backfill',
            jobType: spec.initialJobType,
            chunkDays: spec.initialChunkDays,
          }),
        );
        continue;
      }

      if (this.shouldScheduleCatchup(checkpoint, yesterday)) {
        const lastCompleteDate = checkpoint?.lastCompleteDate;

        if (lastCompleteDate === undefined) {
          continue;
        }

        plannedItems.push(
          ...this.chunkWindowRange({
            command,
            spec,
            startDate: addUtcDays(lastCompleteDate, 1),
            endDate: yesterday,
            kind: 'catchup',
            jobType: spec.incrementalJobType,
            chunkDays: spec.regularChunkDays,
          }),
        );
        continue;
      }

      if (!spec.reprocessJobType) {
        continue;
      }

      const reprocessStartDate = checkpoint?.safeReprocessFrom
        ? checkpoint.safeReprocessFrom
        : addUtcDays(yesterday, -(spec.reprocessDays - 1));

      if (isAfterOrEqual(startOfUtcDay(reprocessStartDate), addUtcDays(yesterday, 1))) {
        continue;
      }

      plannedItems.push(
        this.toPlanItem({
          command,
          spec,
          window: {
            scope: spec.scope,
            kind: 'reprocess',
            startDate: startOfUtcDay(reprocessStartDate),
            endDate: yesterday,
          },
          jobType: spec.reprocessJobType,
        }),
      );
    }

    return plannedItems.sort((left, right) => right.priority - left.priority);
  }

  private getScopePlanSpecs(allowSearchTerms: boolean): readonly ScopePlanSpec[] {
    const specs: ScopePlanSpec[] = [
      {
        scope: 'account_daily',
        initialJobType: 'initial_backfill_account_daily',
        incrementalJobType: 'daily_account',
        reprocessJobType: 'recent_reprocess_account',
        initialChunkDays: this.config.accountDailyChunkDays,
        regularChunkDays: this.config.accountDailyChunkDays,
        reprocessDays: this.config.recentReprocessDays,
        queueName: 'sync-daily',
        priority: 90,
        concurrencyKeySuffix: 'heavy',
        intraday: false,
        enabledByDefault: true,
      },
      {
        scope: 'campaign_daily',
        initialJobType: 'initial_backfill_campaign_daily',
        incrementalJobType: 'daily_campaign',
        reprocessJobType: 'recent_reprocess_campaign',
        initialChunkDays: this.config.campaignDailyChunkDays,
        regularChunkDays: this.config.campaignDailyChunkDays,
        reprocessDays: this.config.recentReprocessDays,
        queueName: 'sync-daily',
        priority: 85,
        concurrencyKeySuffix: 'heavy',
        intraday: false,
        enabledByDefault: true,
      },
      {
        scope: 'campaign_device_daily',
        initialJobType: 'initial_backfill_campaign_device_daily',
        incrementalJobType: 'daily_campaign_device',
        reprocessJobType: 'recent_reprocess_campaign_device',
        initialChunkDays: this.config.heavyGranularityChunkDays,
        regularChunkDays: this.config.heavyGranularityChunkDays,
        reprocessDays: this.config.heavyReprocessDays,
        queueName: 'sync-heavy',
        priority: 70,
        concurrencyKeySuffix: 'heavy',
        intraday: false,
        enabledByDefault: true,
      },
      {
        scope: 'campaign_hourly',
        initialJobType: 'initial_backfill_campaign_hourly',
        incrementalJobType: 'daily_campaign_hourly',
        reprocessJobType: 'recent_reprocess_campaign_hourly',
        initialChunkDays: this.config.heavyGranularityChunkDays,
        regularChunkDays: this.config.heavyGranularityChunkDays,
        reprocessDays: this.config.heavyReprocessDays,
        queueName: 'sync-heavy',
        priority: 65,
        concurrencyKeySuffix: 'heavy',
        intraday: false,
        enabledByDefault: true,
      },
      {
        scope: 'campaign_geo_daily',
        initialJobType: 'initial_backfill_campaign_geo_daily',
        incrementalJobType: 'daily_campaign_geo',
        reprocessJobType: 'recent_reprocess_campaign_geo',
        initialChunkDays: this.config.heavyGranularityChunkDays,
        regularChunkDays: this.config.heavyGranularityChunkDays,
        reprocessDays: this.config.heavyReprocessDays,
        queueName: 'sync-heavy',
        priority: 60,
        concurrencyKeySuffix: 'heavy',
        intraday: false,
        enabledByDefault: true,
      },
      {
        scope: 'intraday_account',
        initialJobType: 'intraday_account',
        incrementalJobType: 'intraday_account',
        initialChunkDays: 1,
        regularChunkDays: 1,
        reprocessDays: 1,
        queueName: 'sync-intraday',
        priority: 100,
        concurrencyKeySuffix: 'intraday',
        intraday: true,
        enabledByDefault: true,
      },
      {
        scope: 'intraday_campaign',
        initialJobType: 'intraday_campaign',
        incrementalJobType: 'intraday_campaign',
        initialChunkDays: 1,
        regularChunkDays: 1,
        reprocessDays: 1,
        queueName: 'sync-intraday',
        priority: 95,
        concurrencyKeySuffix: 'intraday',
        intraday: true,
        enabledByDefault: true,
      },
    ];

    if (allowSearchTerms) {
      specs.push({
        scope: 'search_term_daily',
        initialJobType: 'daily_search_term',
        incrementalJobType: 'daily_search_term',
        reprocessJobType: 'recent_reprocess_search_term',
        initialChunkDays: this.config.searchTermChunkDays,
        regularChunkDays: this.config.searchTermChunkDays,
        reprocessDays: this.config.searchTermReprocessDays,
        queueName: 'sync-search-term',
        priority: 30,
        concurrencyKeySuffix: 'search-term-global',
        intraday: false,
        enabledByDefault: false,
      });
    }

    return specs;
  }

  private shouldRunIntraday(
    referenceTime: Date,
    checkpoint: GoogleAdsSyncCheckpoint | null,
  ): boolean {
    const currentHour = referenceTime.getUTCHours();

    if (
      currentHour < this.config.intradayStartHour ||
      currentHour > this.config.intradayEndHour
    ) {
      return false;
    }

    if (!checkpoint?.watermarkDateTime) {
      return true;
    }

    const hoursSinceLastWatermark =
      (referenceTime.getTime() - checkpoint.watermarkDateTime.getTime()) /
      (60 * 60 * 1000);

    return hoursSinceLastWatermark >= this.config.intradayMinimumIntervalHours;
  }

  private shouldScheduleCatchup(
    checkpoint: GoogleAdsSyncCheckpoint | null,
    yesterday: Date,
  ): boolean {
    if (!checkpoint?.lastCompleteDate) {
      return false;
    }

    return isBeforeOrEqual(checkpoint.lastCompleteDate, addUtcDays(yesterday, -1));
  }

  private isCheckpointUninitialized(
    checkpoint: GoogleAdsSyncCheckpoint | null,
  ): boolean {
    return !checkpoint?.lastCompleteDate && !checkpoint?.watermarkDateTime;
  }

  private chunkWindowRange(input: {
    command: ScheduleGoogleAdsSyncPlanCommand;
    spec: ScopePlanSpec;
    startDate: Date;
    endDate: Date;
    kind: GoogleAdsSyncWindowKind;
    jobType: GoogleAdsSyncJobType;
    chunkDays: number;
  }): GoogleAdsSyncPlanItem[] {
    const items: GoogleAdsSyncPlanItem[] = [];
    let currentStartDate = startOfUtcDay(input.startDate);

    while (isBeforeOrEqual(currentStartDate, input.endDate)) {
      const chunkEndDateCandidate = addUtcDays(
        currentStartDate,
        input.chunkDays - 1,
      );
      const chunkEndDate = isAfterOrEqual(chunkEndDateCandidate, input.endDate)
        ? input.endDate
        : chunkEndDateCandidate;

      items.push(
        this.toPlanItem({
          command: input.command,
          spec: input.spec,
          window: {
            scope: input.spec.scope,
            kind: input.kind,
            startDate: currentStartDate,
            endDate: chunkEndDate,
          },
          jobType: input.jobType,
        }),
      );

      currentStartDate = addUtcDays(chunkEndDate, 1);
    }

    return items;
  }

  private toPlanItem(input: {
    command: ScheduleGoogleAdsSyncPlanCommand;
    spec: ScopePlanSpec;
    window: GoogleAdsSyncWindow;
    jobType: GoogleAdsSyncJobType;
  }): GoogleAdsSyncPlanItem {
    const concurrencyKey =
      input.spec.scope === 'search_term_daily'
        ? `global:${input.spec.concurrencyKeySuffix}`
        : `${input.command.googleAdsAccountId}:${input.spec.concurrencyKeySuffix}`;

    const dedupeKey = this.dedupeKeyBuilder.build({
      tenantId: input.command.tenantId,
      googleAdsAccountId: input.command.googleAdsAccountId,
      scope: input.spec.scope,
      jobType: input.jobType,
      windowStart: input.window.startDate,
      windowEnd: input.window.endDate,
    });

    return {
      tenantId: input.command.tenantId,
      clientId: input.command.clientId,
      googleAdsAccountId: input.command.googleAdsAccountId,
      scope: input.spec.scope,
      jobType: input.jobType,
      queueName: input.spec.queueName,
      priority: input.spec.priority,
      dedupeKey,
      concurrencyKey,
      triggeredBy:
        input.command.mode === 'manual' ? 'manual' : 'scheduler',
      window: input.window,
      payload: {
        scope: input.spec.scope,
        kind: input.window.kind,
        allowSearchTerms: input.command.allowSearchTerms ?? false,
      },
    };
  }
}
