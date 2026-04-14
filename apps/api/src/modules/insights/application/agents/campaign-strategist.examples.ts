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

function campaign(input: {
  readonly id: string;
  readonly name: string;
  readonly status?: string;
  readonly searchImpressionShare?: number | null;
  readonly metrics: Metrics;
}) {
  return {
    campaignId: input.id,
    campaignName: input.name,
    status: input.status ?? 'ENABLED',
    ...input.metrics,
    searchImpressionShare: input.searchImpressionShare ?? null,
  };
}

function buildBaseInput(): AgentInput {
  return {
    agent_name: 'campaign_strategist',
    agent_version: '1.0.0',
    execution_context: {
      tenant_id: '1',
      client_id: '10',
      account_id: '100',
      membership_id: null,
      request_id: 'req-campaign-strategist',
      correlation_id: 'corr-campaign-strategist',
      trigger_source: 'scheduler',
      trigger_reference: '9002',
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
      min_campaign_clicks: 30,
      min_campaign_conversions: 3,
      min_campaign_spend_brl: 180,
      campaign_cpa_gap_multiplier: 1.25,
      campaign_roas_gap_multiplier: 0.8,
      campaign_peer_cpa_gap_multiplier: 1.2,
      campaign_peer_roas_gap_multiplier: 0.85,
      campaign_scale_cpa_multiplier: 0.92,
      campaign_scale_roas_multiplier: 1.03,
      campaign_scale_min_conversion_growth_pct: 8,
      campaign_contain_min_spend_share_pct: 12,
      campaign_pause_min_clicks: 80,
      campaign_pause_max_conversions: 1,
      campaign_pause_min_spend_brl: 350,
      campaign_pause_roas_max: 0.7,
      campaign_pause_min_spend_share_pct: 8,
      campaign_investigate_cpa_growth_pct: 18,
      campaign_investigate_conversion_drop_pct: -18,
      campaign_concentration_warn_spend_share_pct: 30,
      campaign_concentration_high_spend_share_pct: 45,
      campaign_budget_limited_search_impression_share_pct: 0.55,
      campaign_budget_limited_min_conversions: 8,
    },
    features: {
      account_summary_current: toJsonValue(
        metrics({
          spend: 10300,
          impressions: 162000,
          clicks: 3450,
          conversions: 100,
          conversionValue: 69000,
        }),
      ),
      account_summary_baseline: toJsonValue(
        metrics({
          spend: 9600,
          impressions: 156000,
          clicks: 3280,
          conversions: 96,
          conversionValue: 64600,
        }),
      ),
      campaign_summaries_current: toJsonValue([
        campaign({
          id: '2001',
          name: 'Pesquisa Premium',
          searchImpressionShare: 0.43,
          metrics: metrics({
            spend: 1800,
            impressions: 28000,
            clicks: 620,
            conversions: 24,
            conversionValue: 16800,
          }),
        }),
        campaign({
          id: '2002',
          name: 'Generic Search',
          searchImpressionShare: 0.71,
          metrics: metrics({
            spend: 2900,
            impressions: 47000,
            clicks: 840,
            conversions: 14,
            conversionValue: 9100,
          }),
        }),
        campaign({
          id: '2003',
          name: 'Topo Funnel',
          searchImpressionShare: 0.64,
          metrics: metrics({
            spend: 900,
            impressions: 21000,
            clicks: 140,
            conversions: 0,
            conversionValue: 0,
          }),
        }),
        campaign({
          id: '2004',
          name: 'Brand Central',
          searchImpressionShare: 0.82,
          metrics: metrics({
            spend: 4700,
            impressions: 66000,
            clicks: 1850,
            conversions: 36,
            conversionValue: 27800,
          }),
        }),
      ]),
      campaign_summaries_baseline: toJsonValue([
        campaign({
          id: '2001',
          name: 'Pesquisa Premium',
          searchImpressionShare: 0.47,
          metrics: metrics({
            spend: 1500,
            impressions: 25000,
            clicks: 540,
            conversions: 19,
            conversionValue: 12000,
          }),
        }),
        campaign({
          id: '2002',
          name: 'Generic Search',
          searchImpressionShare: 0.74,
          metrics: metrics({
            spend: 2500,
            impressions: 45200,
            clicks: 790,
            conversions: 18,
            conversionValue: 12100,
          }),
        }),
        campaign({
          id: '2003',
          name: 'Topo Funnel',
          searchImpressionShare: 0.61,
          metrics: metrics({
            spend: 620,
            impressions: 19500,
            clicks: 120,
            conversions: 1,
            conversionValue: 200,
          }),
        }),
        campaign({
          id: '2004',
          name: 'Brand Central',
          searchImpressionShare: 0.8,
          metrics: metrics({
            spend: 4200,
            impressions: 64000,
            clicks: 1790,
            conversions: 40,
            conversionValue: 30000,
          }),
        }),
      ]),
    },
    upstream_outputs: [],
  };
}

export const CAMPAIGN_STRATEGIST_EXAMPLE_INPUTS = {
  portfolio_mix: buildBaseInput(),
  scale_candidate: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      account_summary_current: toJsonValue(
        metrics({
          spend: 4200,
          impressions: 69000,
          clicks: 1260,
          conversions: 43,
          conversionValue: 33400,
        }),
      ),
      account_summary_baseline: toJsonValue(
        metrics({
          spend: 3950,
          impressions: 65000,
          clicks: 1180,
          conversions: 37,
          conversionValue: 27400,
        }),
      ),
      campaign_summaries_current: toJsonValue([
        campaign({
          id: '2001',
          name: 'Pesquisa Premium',
          searchImpressionShare: 0.68,
          metrics: metrics({
            spend: 1700,
            impressions: 27500,
            clicks: 630,
            conversions: 27,
            conversionValue: 19400,
          }),
        }),
        campaign({
          id: '2007',
          name: 'Search Generic Apoio',
          searchImpressionShare: 0.74,
          metrics: metrics({
            spend: 2500,
            impressions: 41500,
            clicks: 630,
            conversions: 16,
            conversionValue: 14000,
          }),
        }),
      ]),
      campaign_summaries_baseline: toJsonValue([
        campaign({
          id: '2001',
          name: 'Pesquisa Premium',
          searchImpressionShare: 0.46,
          metrics: metrics({
            spend: 1500,
            impressions: 24500,
            clicks: 540,
            conversions: 20,
            conversionValue: 12400,
          }),
        }),
        campaign({
          id: '2007',
          name: 'Search Generic Apoio',
          searchImpressionShare: 0.76,
          metrics: metrics({
            spend: 2450,
            impressions: 40500,
            clicks: 640,
            conversions: 17,
            conversionValue: 15000,
          }),
        }),
      ]),
    },
  } satisfies AgentInput,
  contain_candidate: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      campaign_summaries_current: toJsonValue([
        campaign({
          id: '2002',
          name: 'Generic Search',
          searchImpressionShare: 0.71,
          metrics: metrics({
            spend: 3200,
            impressions: 47800,
            clicks: 860,
            conversions: 13,
            conversionValue: 8600,
          }),
        }),
        campaign({
          id: '2005',
          name: 'Competidor Defesa',
          searchImpressionShare: 0.77,
          metrics: metrics({
            spend: 2100,
            impressions: 35000,
            clicks: 720,
            conversions: 25,
            conversionValue: 22000,
          }),
        }),
      ]),
      campaign_summaries_baseline: toJsonValue([
        campaign({
          id: '2002',
          name: 'Generic Search',
          searchImpressionShare: 0.74,
          metrics: metrics({
            spend: 2500,
            impressions: 45200,
            clicks: 790,
            conversions: 18,
            conversionValue: 12100,
          }),
        }),
        campaign({
          id: '2005',
          name: 'Competidor Defesa',
          searchImpressionShare: 0.79,
          metrics: metrics({
            spend: 1950,
            impressions: 34000,
            clicks: 700,
            conversions: 24,
            conversionValue: 20500,
          }),
        }),
      ]),
      account_summary_current: toJsonValue(
        metrics({
          spend: 5300,
          impressions: 82800,
          clicks: 1580,
          conversions: 38,
          conversionValue: 30600,
        }),
      ),
    },
  } satisfies AgentInput,
  pause_candidate: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      campaign_summaries_current: toJsonValue([
        campaign({
          id: '2003',
          name: 'Topo Funnel',
          searchImpressionShare: 0.64,
          metrics: metrics({
            spend: 980,
            impressions: 23000,
            clicks: 148,
            conversions: 0,
            conversionValue: 0,
          }),
        }),
        campaign({
          id: '2006',
          name: 'Remarketing Quente',
          searchImpressionShare: 0.84,
          metrics: metrics({
            spend: 1900,
            impressions: 24000,
            clicks: 560,
            conversions: 19,
            conversionValue: 15200,
          }),
        }),
      ]),
      campaign_summaries_baseline: toJsonValue([
        campaign({
          id: '2003',
          name: 'Topo Funnel',
          searchImpressionShare: 0.61,
          metrics: metrics({
            spend: 620,
            impressions: 19500,
            clicks: 120,
            conversions: 1,
            conversionValue: 200,
          }),
        }),
        campaign({
          id: '2006',
          name: 'Remarketing Quente',
          searchImpressionShare: 0.83,
          metrics: metrics({
            spend: 1800,
            impressions: 23500,
            clicks: 540,
            conversions: 18,
            conversionValue: 14800,
          }),
        }),
      ]),
      account_summary_current: toJsonValue(
        metrics({
          spend: 2880,
          impressions: 47000,
          clicks: 708,
          conversions: 19,
          conversionValue: 15200,
        }),
      ),
    },
  } satisfies AgentInput,
} as const;

export const CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES = {
  scale_candidate: {
    title: 'Campanha com espaco para expansao controlada',
    action_type: 'scale',
  },
  contain_candidate: {
    title: 'Campanha para conter e redistribuir verba',
    action_type: 'reduce',
  },
  pause_candidate: {
    title: 'Campanha com sinal forte para pausa',
    action_type: 'pause',
  },
  portfolio_mix_budget_check: {
    title: 'Campanha eficiente com espaco de entrega para validar limitacao',
    action_type: 'investigate',
  },
} as const;
