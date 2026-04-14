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

function row(input: {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly dimension: 'device' | 'geo' | 'schedule' | 'day_of_week';
  readonly dimensionValue: string;
  readonly metrics: Metrics;
}) {
  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    dimension: input.dimension,
    dimensionValue: input.dimensionValue,
    ...input.metrics,
  };
}

function buildBaseInput(): AgentInput {
  return {
    agent_name: 'segmentation_specialist',
    agent_version: '1.0.0',
    execution_context: {
      tenant_id: '1',
      client_id: '10',
      account_id: '100',
      membership_id: null,
      request_id: 'req-segmentation',
      correlation_id: 'corr-segmentation',
      trigger_source: 'scheduler',
      trigger_reference: '9003',
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
      segmentation_spend_floor_brl: 120,
      segmentation_min_clicks: 25,
      segmentation_min_conversions: 2,
      segmentation_time_waste_cpa_gap_multiplier: 1.35,
      segmentation_time_waste_cvr_ratio: 0.65,
      segmentation_time_winner_roas_multiplier: 1.18,
      segmentation_time_winner_cpa_multiplier: 0.85,
      segmentation_geo_high_cpa_multiplier: 1.45,
      segmentation_geo_opportunity_roas_multiplier: 1.15,
      segmentation_geo_opportunity_cpa_multiplier: 0.9,
      segmentation_device_low_cvr_ratio: 0.55,
      segmentation_device_high_clicks_min: 60,
      segmentation_device_winner_roas_multiplier: 1.12,
      segmentation_device_winner_cvr_ratio: 1.12,
      segmentation_trend_cpa_growth_pct: 15,
      segmentation_trend_conversion_drop_pct: -15,
    },
    features: {
      account_summary_current: toJsonValue(
        metrics({
          spend: 5000,
          impressions: 100000,
          clicks: 2000,
          conversions: 80,
          conversionValue: 30000,
        }),
      ),
      account_summary_baseline: toJsonValue(
        metrics({
          spend: 4700,
          impressions: 96000,
          clicks: 1920,
          conversions: 76,
          conversionValue: 28500,
        }),
      ),
      segmentation_rows_current: toJsonValue([
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'schedule',
          dimensionValue: '03:00',
          metrics: metrics({
            spend: 420,
            impressions: 5200,
            clicks: 90,
            conversions: 1,
            conversionValue: 120,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'schedule',
          dimensionValue: '19:00',
          metrics: metrics({
            spend: 360,
            impressions: 4800,
            clicks: 80,
            conversions: 8,
            conversionValue: 3200,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'day_of_week',
          dimensionValue: 'MONDAY',
          metrics: metrics({
            spend: 310,
            impressions: 4100,
            clicks: 62,
            conversions: 1,
            conversionValue: 90,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'geo',
          dimensionValue: 'Rio de Janeiro',
          metrics: metrics({
            spend: 520,
            impressions: 6200,
            clicks: 110,
            conversions: 2,
            conversionValue: 500,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'geo',
          dimensionValue: 'Minas Gerais',
          metrics: metrics({
            spend: 430,
            impressions: 5800,
            clicks: 84,
            conversions: 8,
            conversionValue: 3300,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'device',
          dimensionValue: 'mobile',
          metrics: metrics({
            spend: 680,
            impressions: 13000,
            clicks: 180,
            conversions: 1,
            conversionValue: 250,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'device',
          dimensionValue: 'desktop',
          metrics: metrics({
            spend: 520,
            impressions: 7000,
            clicks: 95,
            conversions: 9,
            conversionValue: 4200,
          }),
        }),
      ]),
      segmentation_rows_baseline: toJsonValue([
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'schedule',
          dimensionValue: '03:00',
          metrics: metrics({
            spend: 330,
            impressions: 4900,
            clicks: 82,
            conversions: 2,
            conversionValue: 240,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'schedule',
          dimensionValue: '19:00',
          metrics: metrics({
            spend: 340,
            impressions: 4700,
            clicks: 78,
            conversions: 6,
            conversionValue: 2500,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'day_of_week',
          dimensionValue: 'MONDAY',
          metrics: metrics({
            spend: 280,
            impressions: 4000,
            clicks: 58,
            conversions: 2,
            conversionValue: 220,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'geo',
          dimensionValue: 'Rio de Janeiro',
          metrics: metrics({
            spend: 430,
            impressions: 6000,
            clicks: 108,
            conversions: 3,
            conversionValue: 750,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'geo',
          dimensionValue: 'Minas Gerais',
          metrics: metrics({
            spend: 410,
            impressions: 5600,
            clicks: 82,
            conversions: 6,
            conversionValue: 2500,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'device',
          dimensionValue: 'mobile',
          metrics: metrics({
            spend: 610,
            impressions: 12600,
            clicks: 170,
            conversions: 3,
            conversionValue: 780,
          }),
        }),
        row({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          dimension: 'device',
          dimensionValue: 'desktop',
          metrics: metrics({
            spend: 500,
            impressions: 6900,
            clicks: 92,
            conversions: 7,
            conversionValue: 3100,
          }),
        }),
      ]),
    },
    upstream_outputs: [],
  };
}

export const SEGMENTATION_SPECIALIST_EXAMPLE_INPUTS = {
  portfolio_mix: buildBaseInput(),
  missing_day_of_week: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      segmentation_rows_current: toJsonValue(
        (buildBaseInput().features.segmentation_rows_current as unknown as Array<{
          dimension: string;
        }>).filter((item) => item.dimension !== 'day_of_week'),
      ),
      segmentation_rows_baseline: toJsonValue(
        (buildBaseInput().features.segmentation_rows_baseline as unknown as Array<{
          dimension: string;
        }>).filter((item) => item.dimension !== 'day_of_week'),
      ),
    },
  } satisfies AgentInput,
} as const;
