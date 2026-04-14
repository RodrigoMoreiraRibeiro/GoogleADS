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

function term(input: {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly searchTerm: string;
  readonly metrics: Metrics;
}) {
  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    searchTerm: input.searchTerm,
    ...input.metrics,
  };
}

function buildBaseInput(): AgentInput {
  return {
    agent_name: 'search_terms_specialist',
    agent_version: '1.0.0',
    execution_context: {
      tenant_id: '1',
      client_id: '10',
      account_id: '100',
      membership_id: null,
      request_id: 'req-search-terms',
      correlation_id: 'corr-search-terms',
      trigger_source: 'scheduler',
      trigger_reference: '9004',
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
      search_terms_min_clicks: 8,
      search_terms_min_spend_brl: 40,
      search_terms_waste_min_clicks: 20,
      search_terms_waste_min_spend_brl: 80,
      search_terms_exploration_max_clicks: 18,
      search_terms_exploration_max_spend_brl: 70,
      search_terms_irrelevant_min_clicks: 12,
      search_terms_irrelevant_min_spend_brl: 55,
      search_terms_opportunity_min_clicks: 15,
      search_terms_opportunity_min_conversions: 2,
      search_terms_opportunity_roas_multiplier: 1.15,
      search_terms_opportunity_cpa_multiplier: 0.9,
      search_terms_concentration_top_share_pct: 65,
      search_terms_concentration_min_waste_terms: 3,
      search_terms_irrelevant_token_patterns:
        'gratis,free,emprego,vaga,curso,como fazer,manual,pdf,mercado livre,olx,reclame aqui,telefone,whatsapp',
    },
    features: {
      account_summary_current: toJsonValue(
        metrics({
          spend: 5200,
          impressions: 110000,
          clicks: 2200,
          conversions: 88,
          conversionValue: 33800,
        }),
      ),
      account_summary_baseline: toJsonValue(
        metrics({
          spend: 5000,
          impressions: 108000,
          clicks: 2140,
          conversions: 82,
          conversionValue: 31500,
        }),
      ),
      search_terms_available: true,
      search_term_rows_current: toJsonValue([
        term({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          searchTerm: 'curso gratis de trafego pago',
          metrics: metrics({
            spend: 120,
            impressions: 1500,
            clicks: 26,
            conversions: 0,
            conversionValue: 0,
          }),
        }),
        term({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          searchTerm: 'comprar consultoria google ads',
          metrics: metrics({
            spend: 140,
            impressions: 900,
            clicks: 20,
            conversions: 4,
            conversionValue: 1400,
          }),
        }),
        term({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          searchTerm: 'manual google ads pdf',
          metrics: metrics({
            spend: 90,
            impressions: 1100,
            clicks: 21,
            conversions: 0,
            conversionValue: 0,
          }),
        }),
        term({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          searchTerm: 'agencia google ads whatsapp',
          metrics: metrics({
            spend: 95,
            impressions: 1000,
            clicks: 22,
            conversions: 0,
            conversionValue: 0,
          }),
        }),
        term({
          campaignId: '2002',
          campaignName: 'Pesquisa Marca',
          searchTerm: 'empresa gestao google ads',
          metrics: metrics({
            spend: 55,
            impressions: 680,
            clicks: 10,
            conversions: 0,
            conversionValue: 0,
          }),
        }),
        term({
          campaignId: '2002',
          campaignName: 'Pesquisa Marca',
          searchTerm: 'consultoria avancada google ads b2b',
          metrics: metrics({
            spend: 160,
            impressions: 980,
            clicks: 24,
            conversions: 3,
            conversionValue: 1550,
          }),
        }),
      ]),
      search_term_rows_baseline: toJsonValue([
        term({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          searchTerm: 'curso gratis de trafego pago',
          metrics: metrics({
            spend: 85,
            impressions: 1200,
            clicks: 20,
            conversions: 0,
            conversionValue: 0,
          }),
        }),
        term({
          campaignId: '2001',
          campaignName: 'Pesquisa Core',
          searchTerm: 'comprar consultoria google ads',
          metrics: metrics({
            spend: 125,
            impressions: 820,
            clicks: 18,
            conversions: 3,
            conversionValue: 1100,
          }),
        }),
      ]),
      segmentation_rows_current: toJsonValue([]),
      segmentation_rows_baseline: toJsonValue([]),
      campaign_summaries_current: toJsonValue([]),
      campaign_summaries_baseline: toJsonValue([]),
    },
    upstream_outputs: [],
  };
}

export const SEARCH_TERMS_SPECIALIST_EXAMPLE_INPUTS = {
  portfolio_mix: buildBaseInput(),
  unavailable: {
    ...buildBaseInput(),
    features: {
      ...buildBaseInput().features,
      search_terms_available: false,
      search_term_rows_current: toJsonValue([]),
      search_term_rows_baseline: toJsonValue([]),
    },
  } satisfies AgentInput,
} as const;
