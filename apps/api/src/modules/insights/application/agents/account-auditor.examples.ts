import type {
  AgentInput,
  PerformanceAgentJsonValue,
} from '@googleads/shared';

type Metrics = {
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly conversionValue: number;
  readonly ctr: number | null;
  readonly cpa: number | null;
  readonly roas: number | null;
};

function toJsonValue(value: unknown): PerformanceAgentJsonValue {
  return value as PerformanceAgentJsonValue;
}

function metrics(input: {
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly conversionValue: number;
}): Metrics {
  return {
    spend: input.spend,
    impressions: input.impressions,
    clicks: input.clicks,
    conversions: input.conversions,
    conversionValue: input.conversionValue,
    ctr:
      input.impressions > 0
        ? Number((input.clicks / input.impressions).toFixed(4))
        : null,
    cpa:
      input.conversions > 0
        ? Number((input.spend / input.conversions).toFixed(2))
        : null,
    roas:
      input.spend > 0
        ? Number((input.conversionValue / input.spend).toFixed(2))
        : null,
  };
}

function comparison(
  windowLabel: 'last_7d' | 'last_14d' | 'last_30d',
  sampleDays: 7 | 14 | 30,
  current: Metrics,
  baseline: Metrics,
) {
  return {
    windowLabel,
    sampleDays,
    current,
    baseline,
  };
}

function buildBaseInput(): AgentInput {
  return {
    agent_name: 'account_auditor',
    agent_version: '1.0.0',
    execution_context: {
      tenant_id: '1',
      client_id: '10',
      account_id: '100',
      membership_id: null,
      request_id: 'req-account-auditor',
      correlation_id: 'corr-account-auditor',
      trigger_source: 'scheduler',
      trigger_reference: '9001',
    },
    analysis_window: {
      analysis_window_label: 'last_30d',
      period_start: '2026-03-15',
      period_end: '2026-04-13',
      baseline_start: '2026-02-13',
      baseline_end: '2026-03-14',
      comparison_label: 'last_30d vs previous_30d',
    },
    data_quality: {
      is_sync_stale: false,
      has_minimum_volume: true,
      has_baseline: true,
      warnings: [],
    },
    thresholds: {
      min_account_conversions: 12,
      min_account_clicks: 120,
      account_cpa_warning_delta_pct: 15,
      account_roas_warning_delta_pct: -10,
      account_conversion_drop_pct: -12,
      account_spend_growth_guard_pct: 5,
      account_volume_drop_pct: -20,
      account_scale_cpa_multiplier: 0.9,
      account_scale_roas_multiplier: 1.1,
      account_scale_conversion_growth_pct: 8,
      account_min_consistent_windows: 2,
      account_volatility_cpa_spread_pct: 20,
      account_volatility_roas_spread_pct: 18,
    },
    features: {
      account_summary_current: toJsonValue(
        metrics({
          spend: 12000,
          impressions: 180000,
          clicks: 3600,
          conversions: 180,
          conversionValue: 72000,
        }),
      ),
      account_summary_baseline: toJsonValue(
        metrics({
          spend: 11000,
          impressions: 176000,
          clicks: 3500,
          conversions: 205,
          conversionValue: 82000,
        }),
      ),
      account_window_comparisons: toJsonValue([
        comparison(
          'last_7d',
          7,
          metrics({
            spend: 3500,
            impressions: 52000,
            clicks: 840,
            conversions: 34,
            conversionValue: 16800,
          }),
          metrics({
            spend: 3000,
            impressions: 50000,
            clicks: 820,
            conversions: 45,
            conversionValue: 22500,
          }),
        ),
        comparison(
          'last_14d',
          14,
          metrics({
            spend: 6200,
            impressions: 93000,
            clicks: 1820,
            conversions: 82,
            conversionValue: 34100,
          }),
          metrics({
            spend: 5600,
            impressions: 91000,
            clicks: 1780,
            conversions: 102,
            conversionValue: 42800,
          }),
        ),
        comparison(
          'last_30d',
          30,
          metrics({
            spend: 12000,
            impressions: 180000,
            clicks: 3600,
            conversions: 180,
            conversionValue: 72000,
          }),
          metrics({
            spend: 11000,
            impressions: 176000,
            clicks: 3500,
            conversions: 205,
            conversionValue: 82000,
          }),
        ),
      ]),
      campaign_summaries_current: toJsonValue([
        {
          campaignId: '2001',
          campaignName: 'Pesquisa Decor',
          status: 'ENABLED',
          ...metrics({
            spend: 4200,
            impressions: 64000,
            clicks: 1280,
            conversions: 72,
            conversionValue: 29800,
          }),
          searchImpressionShare: 0.54,
        },
      ]),
      sync_health: toJsonValue({
        overallStatus: 'healthy',
        lastSuccessfulSyncAt: '2026-04-13T08:00:00.000Z',
        lastFailedSyncAt: null,
        queuedJobs: 0,
        failedJobs: 0,
        openIssues: 0,
      }),
    },
    upstream_outputs: [],
  };
}

export const ACCOUNT_AUDITOR_EXAMPLE_INPUTS = {
  deterioration: buildBaseInput(),
  scale_opportunity: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      account_summary_current: toJsonValue(
        metrics({
          spend: 10500,
          impressions: 181000,
          clicks: 3720,
          conversions: 230,
          conversionValue: 91000,
        }),
      ),
      account_summary_baseline: toJsonValue(
        metrics({
          spend: 11000,
          impressions: 176000,
          clicks: 3500,
          conversions: 205,
          conversionValue: 82000,
        }),
      ),
      account_window_comparisons: toJsonValue([
        comparison(
          'last_7d',
          7,
          metrics({
            spend: 3100,
            impressions: 51500,
            clicks: 920,
            conversions: 52,
            conversionValue: 22300,
          }),
          metrics({
            spend: 3200,
            impressions: 50000,
            clicks: 850,
            conversions: 44,
            conversionValue: 18100,
          }),
        ),
        comparison(
          'last_14d',
          14,
          metrics({
            spend: 5400,
            impressions: 92000,
            clicks: 1860,
            conversions: 112,
            conversionValue: 43600,
          }),
          metrics({
            spend: 5700,
            impressions: 90500,
            clicks: 1770,
            conversions: 96,
            conversionValue: 36200,
          }),
        ),
        comparison(
          'last_30d',
          30,
          metrics({
            spend: 10500,
            impressions: 181000,
            clicks: 3720,
            conversions: 230,
            conversionValue: 91000,
          }),
          metrics({
            spend: 11000,
            impressions: 176000,
            clicks: 3500,
            conversions: 205,
            conversionValue: 82000,
          }),
        ),
      ]),
    },
  } satisfies AgentInput,
  volatility: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      account_window_comparisons: toJsonValue([
        comparison(
          'last_7d',
          7,
          metrics({
            spend: 3600,
            impressions: 51000,
            clicks: 870,
            conversions: 32,
            conversionValue: 14100,
          }),
          metrics({
            spend: 3000,
            impressions: 50500,
            clicks: 830,
            conversions: 42,
            conversionValue: 21400,
          }),
        ),
        comparison(
          'last_14d',
          14,
          metrics({
            spend: 5900,
            impressions: 93000,
            clicks: 1780,
            conversions: 98,
            conversionValue: 47000,
          }),
          metrics({
            spend: 5600,
            impressions: 91000,
            clicks: 1750,
            conversions: 96,
            conversionValue: 41200,
          }),
        ),
        comparison(
          'last_30d',
          30,
          metrics({
            spend: 12000,
            impressions: 180000,
            clicks: 3600,
            conversions: 190,
            conversionValue: 76000,
          }),
          metrics({
            spend: 11000,
            impressions: 176000,
            clicks: 3500,
            conversions: 205,
            conversionValue: 82000,
          }),
        ),
      ]),
    },
  } satisfies AgentInput,
  insufficient_data: {
    ...buildBaseInput(),
    data_quality: {
      is_sync_stale: true,
      has_minimum_volume: false,
      has_baseline: false,
      warnings: ['sync_stale'],
    },
    features: {
      ...buildBaseInput().features,
      account_summary_baseline: null,
      account_window_comparisons: toJsonValue([]),
    },
  } satisfies AgentInput,
} as const;
