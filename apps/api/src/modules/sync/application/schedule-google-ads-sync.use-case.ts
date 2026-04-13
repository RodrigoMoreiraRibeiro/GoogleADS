import type {
  GoogleAdsSyncCheckpoint,
  GoogleAdsSyncMode,
  GoogleAdsSyncPlanItem,
  GoogleAdsSyncScope,
} from '../domain/google-ads-sync.types';
import { GOOGLE_ADS_SYNC_SCOPES } from '../domain/google-ads-sync.types';
import type {
  SyncCheckpointRepository,
  SyncJobRepository,
} from '../infrastructure/google-ads-sync.ports';
import { GoogleAdsSyncWindowPlannerService } from './google-ads-sync-window-planner.service';

export interface ScheduleGoogleAdsSyncCommand {
  readonly tenantId: string;
  readonly clientId?: string;
  readonly googleAdsAccountId: string;
  readonly mode: GoogleAdsSyncMode;
  readonly referenceTime: Date;
  readonly allowSearchTerms?: boolean;
}

export interface ScheduleGoogleAdsSyncResult {
  readonly planned: readonly GoogleAdsSyncPlanItem[];
  readonly enqueued: readonly GoogleAdsSyncPlanItem[];
  readonly skippedAsDuplicate: readonly GoogleAdsSyncPlanItem[];
}

export class ScheduleGoogleAdsSyncUseCase {
  public constructor(
    private readonly planner: GoogleAdsSyncWindowPlannerService,
    private readonly syncJobRepository: SyncJobRepository,
    private readonly checkpointRepository: SyncCheckpointRepository,
  ) {}

  public async execute(
    command: ScheduleGoogleAdsSyncCommand,
  ): Promise<ScheduleGoogleAdsSyncResult> {
    const checkpoints = await this.loadCheckpoints(command);
    const planned = this.planner.plan({
      ...command,
      checkpoints,
    });

    const openDedupeKeys = await this.syncJobRepository.findOpenDedupeKeys(
      command.tenantId,
      planned.map((item) => item.dedupeKey),
    );

    const [enqueued, skippedAsDuplicate] = planned.reduce<
      [GoogleAdsSyncPlanItem[], GoogleAdsSyncPlanItem[]]
    >(
      (accumulator, planItem) => {
        if (openDedupeKeys.has(planItem.dedupeKey)) {
          accumulator[1].push(planItem);
          return accumulator;
        }

        accumulator[0].push(planItem);
        return accumulator;
      },
      [[], []],
    );

    if (enqueued.length > 0) {
      await this.syncJobRepository.enqueueMany(enqueued);
    }

    return {
      planned,
      enqueued,
      skippedAsDuplicate,
    };
  }

  private async loadCheckpoints(
    command: ScheduleGoogleAdsSyncCommand,
  ): Promise<ReadonlyMap<GoogleAdsSyncScope, GoogleAdsSyncCheckpoint>> {
    const checkpointEntries = await Promise.all(
      GOOGLE_ADS_SYNC_SCOPES.map(async (scope) => {
        const checkpoint = await this.checkpointRepository.findByScope(
          command.tenantId,
          command.googleAdsAccountId,
          scope,
          this.getCheckpointKey(scope),
        );

        return checkpoint ? ([scope, checkpoint] as const) : null;
      }),
    );

    return new Map(
      checkpointEntries.filter(
        (entry): entry is readonly [GoogleAdsSyncScope, GoogleAdsSyncCheckpoint] =>
          entry !== null,
      ),
    );
  }

  private getCheckpointKey(scope: GoogleAdsSyncScope): string {
    return scope;
  }
}
