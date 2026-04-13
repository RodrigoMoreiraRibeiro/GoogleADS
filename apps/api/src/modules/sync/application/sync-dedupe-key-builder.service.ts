import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { GoogleAdsSyncPlanItem } from '../domain/google-ads-sync.types';

@Injectable()
export class SyncDedupeKeyBuilderService {
  public build(planItem: {
    tenantId: string;
    googleAdsAccountId: string;
    scope: string;
    jobType: string;
    windowStart: Date;
    windowEnd: Date;
  }): string {
    return createHash('sha256')
      .update(planItem.tenantId)
      .update('|')
      .update(planItem.googleAdsAccountId)
      .update('|')
      .update(planItem.scope)
      .update('|')
      .update(planItem.jobType)
      .update('|')
      .update(planItem.windowStart.toISOString())
      .update('|')
      .update(planItem.windowEnd.toISOString())
      .digest('hex');
  }

  public buildFromPlanItem(planItem: GoogleAdsSyncPlanItem): string {
    return this.build({
      tenantId: planItem.tenantId,
      googleAdsAccountId: planItem.googleAdsAccountId,
      scope: planItem.scope,
      jobType: planItem.jobType,
      windowStart: planItem.window.startDate,
      windowEnd: planItem.window.endDate,
    });
  }
}
