import type { AgentInput, PerformanceAgentJsonValue } from '@googleads/shared';

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

function campaign(input: {
  readonly id: string;
  readonly name: string;
  readonly metrics: Metrics;
}) {
  return {
    campaignId: input.id,
    campaignName: input.name,
    status: 'ENABLED',
    searchImpressionShare: null,
    ...input.metrics,
  };
}

function buildBaseInput(): AgentInput {
  return {
    agent_name: 'creative_performance',
    agent_version: '1.0.0',
    execution_context: {
      tenant_id: '1',
      client_id: '20',
      account_id: '200',
      membership_id: null,
      request_id: 'req-creative-performance',
      correlation_id: 'corr-creative-performance',
      trigger_source: 'scheduler',
      trigger_reference: '9005',
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
      creative_min_clicks: 35,
      creative_min_impressions: 5000,
      creative_min_spend_brl: 180,
      creative_ctr_drop_pct: -15,
      creative_cvr_drop_pct: -18,
      creative_cpa_growth_pct: 15,
      creative_low_ctr_ratio_vs_account: 0.75,
      creative_low_ctr_ratio_vs_baseline: 0.82,
      creative_misalignment_min_clicks: 45,
      creative_misalignment_ctr_ratio_vs_account: 0.9,
      creative_misalignment_cvr_ratio_vs_account: 0.6,
      creative_misalignment_cpa_multiplier: 1.15,
      creative_refresh_ctr_ratio_vs_account: 0.82,
      creative_refresh_cvr_ratio_vs_baseline: 0.7,
      creative_refresh_min_spend_brl: 250,
    },
    features: {
      account_summary_current: toJsonValue(
        metrics({
          spend: 8200,
          impressions: 152000,
          clicks: 4560,
          conversions: 152,
          conversionValue: 61200,
        }),
      ),
      account_summary_baseline: toJsonValue(
        metrics({
          spend: 7900,
          impressions: 148000,
          clicks: 4510,
          conversions: 148,
          conversionValue: 59800,
        }),
      ),
      campaign_summaries_current: toJsonValue([
        campaign({
          id: '3101',
          name: 'Pesquisa Servico Principal',
          metrics: metrics({
            spend: 950,
            impressions: 18000,
            clicks: 360,
            conversions: 7,
            conversionValue: 2800,
          }),
        }),
      ]),
      campaign_summaries_baseline: toJsonValue([
        campaign({
          id: '3101',
          name: 'Pesquisa Servico Principal',
          metrics: metrics({
            spend: 820,
            impressions: 17000,
            clicks: 460,
            conversions: 13,
            conversionValue: 6200,
          }),
        }),
      ]),
    },
    upstream_outputs: [],
  };
}

export const CREATIVE_PERFORMANCE_EXAMPLE_INPUTS = {
  fatigue_candidate: buildBaseInput(),
  click_conversion_gap: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      account_summary_current: toJsonValue(
        metrics({
          spend: 6800,
          impressions: 130000,
          clicks: 3900,
          conversions: 156,
          conversionValue: 56400,
        }),
      ),
      campaign_summaries_current: toJsonValue([
        campaign({
          id: '3102',
          name: 'Consultoria Performance',
          metrics: metrics({
            spend: 1100,
            impressions: 14500,
            clicks: 500,
            conversions: 9,
            conversionValue: 3600,
          }),
        }),
      ]),
      campaign_summaries_baseline: toJsonValue([
        campaign({
          id: '3102',
          name: 'Consultoria Performance',
          metrics: metrics({
            spend: 980,
            impressions: 14000,
            clicks: 470,
            conversions: 14,
            conversionValue: 6200,
          }),
        }),
      ]),
    },
  } satisfies AgentInput,
  low_attractiveness: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      campaign_summaries_current: toJsonValue([
        campaign({
          id: '3103',
          name: 'Servico Mid Market',
          metrics: metrics({
            spend: 620,
            impressions: 22000,
            clicks: 180,
            conversions: 8,
            conversionValue: 3200,
          }),
        }),
      ]),
      campaign_summaries_baseline: toJsonValue([
        campaign({
          id: '3103',
          name: 'Servico Mid Market',
          metrics: metrics({
            spend: 580,
            impressions: 21000,
            clicks: 260,
            conversions: 9,
            conversionValue: 3500,
          }),
        }),
      ]),
    },
  } satisfies AgentInput,
  copy_refresh: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      account_summary_current: toJsonValue(
        metrics({
          spend: 7600,
          impressions: 148000,
          clicks: 4440,
          conversions: 148,
          conversionValue: 58400,
        }),
      ),
      campaign_summaries_current: toJsonValue([
        campaign({
          id: '3104',
          name: 'Solucao Enterprise',
          metrics: metrics({
            spend: 1250,
            impressions: 16000,
            clicks: 260,
            conversions: 5,
            conversionValue: 3100,
          }),
        }),
      ]),
      campaign_summaries_baseline: toJsonValue([
        campaign({
          id: '3104',
          name: 'Solucao Enterprise',
          metrics: metrics({
            spend: 980,
            impressions: 15500,
            clicks: 330,
            conversions: 10,
            conversionValue: 7600,
          }),
        }),
      ]),
    },
  } satisfies AgentInput,
  unavailable: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      campaign_summaries_baseline: toJsonValue([]),
    },
  } satisfies AgentInput,
} as const;

export const CREATIVE_PERFORMANCE_EXPECTED_FINDINGS = {
  fatigue_candidate: {
    title: 'Sinal de fadiga criativa ou perda de atratividade',
    action_type: 'review_creative',
  },
  click_conversion_gap: {
    title: 'CTR aceitavel, mas baixa conversao apos o clique',
    action_type: 'review_creative',
  },
  low_attractiveness: {
    title: 'Baixa atratividade criativa frente a conta',
    action_type: 'review_creative',
  },
  copy_refresh: {
    title: 'Necessidade de revisao de copy ou criativo',
    action_type: 'review_creative',
  },
} as const;
