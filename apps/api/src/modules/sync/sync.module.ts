import { Module } from '@nestjs/common';

import { GoogleAdsSyncCheckpointService } from './application/google-ads-sync-checkpoint.service';
import { GoogleAdsSyncRetryPolicyService } from './application/google-ads-sync-retry-policy.service';
import { GoogleAdsSyncWindowPlannerService } from './application/google-ads-sync-window-planner.service';
import { SyncDedupeKeyBuilderService } from './application/sync-dedupe-key-builder.service';
import { SyncRuntimeConfigService } from './application/sync-runtime-config.service';

@Module({
  providers: [
    SyncRuntimeConfigService,
    SyncDedupeKeyBuilderService,
    GoogleAdsSyncRetryPolicyService,
    GoogleAdsSyncCheckpointService,
    GoogleAdsSyncWindowPlannerService,
  ],
  exports: [
    SyncRuntimeConfigService,
    SyncDedupeKeyBuilderService,
    GoogleAdsSyncRetryPolicyService,
    GoogleAdsSyncCheckpointService,
    GoogleAdsSyncWindowPlannerService,
  ],
})
export class SyncModule {}
