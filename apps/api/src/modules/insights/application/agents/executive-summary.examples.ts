import type {
  AgentFinding,
  AgentInput,
  ConsolidatedInsight,
  PerformanceAgentJsonValue,
} from '@googleads/shared';

function toJsonValue(value: unknown): PerformanceAgentJsonValue {
  return value as PerformanceAgentJsonValue;
}

function consolidatedInsight(input: {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly expectedImpact: string;
  readonly executiveExplanation: string;
  readonly technicalExplanation: string;
  readonly entityLabel: string;
  readonly actionType: ConsolidatedInsight['recommended_action']['action_type'];
  readonly severity: ConsolidatedInsight['severity'];
  readonly priorityBand: ConsolidatedInsight['priority_band'];
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly riskLevel: ConsolidatedInsight['risk_level'];
  readonly category: ConsolidatedInsight['category'];
  readonly nextSteps: readonly string[];
}): ConsolidatedInsight {
  return {
    insight_id: input.id,
    insight_key: `key_${input.id}`,
    tenant_id: '1',
    client_id: '40',
    account_id: '400',
    entity_type: 'campaign',
    entity_id: input.id,
    entity_label: input.entityLabel,
    category: input.category,
    severity: input.severity,
    priority_band: input.priorityBand,
    priority_score: input.priorityScore,
    confidence_band:
      input.confidenceScore >= 0.9
        ? 'very_high'
        : input.confidenceScore >= 0.75
          ? 'high'
          : input.confidenceScore >= 0.55
            ? 'moderate'
            : 'low',
    confidence_score: input.confidenceScore,
    risk_level: input.riskLevel,
    source_agent_names: ['hypothesis_reviewer'],
    title: input.title,
    summary: input.summary,
    diagnosis: 'Diagnostico consolidado',
    primary_hypothesis: 'Hipotese principal plausivel',
    alternative_hypotheses: [],
    hypothesis_status: 'plausible',
    recommended_action: {
      action_type: input.actionType,
      action_target: `campaign:${input.id}`,
      description: input.nextSteps[0] ?? 'Executar proximo passo',
      execution_mode: 'manual',
    },
    expected_impact: input.expectedImpact,
    technical_explanation: input.technicalExplanation,
    executive_explanation: input.executiveExplanation,
    evidence: [],
    review_notes: [],
    supporting_finding_ids: [],
    blocked_claims: [],
    next_steps: input.nextSteps,
    analysis_window: {
      analysis_window_label: 'analysis_run',
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
    generated_at: '2026-04-13T18:00:00.000Z',
  };
}

function finding(id: string, title: string): AgentFinding {
  return {
    finding_id: id,
    finding_key: `finding_${id}`,
    source_agent: 'hypothesis_reviewer',
    support_agent_names: ['campaign_strategist'],
    entity_type: 'campaign',
    entity_id: id,
    entity_label: title,
    category: 'campaign_efficiency',
    severity: 'warning',
    priority_band: 'high',
    priority_score: 80,
    confidence_band: 'high',
    confidence_score: 0.82,
    risk_level: 'medium',
    title,
    summary: 'Resumo',
    diagnosis: 'Diagnostico',
    primary_hypothesis: 'Hipotese',
    alternative_hypotheses: [],
    recommended_action: {
      action_type: 'investigate',
      action_target: `campaign:${id}`,
      description: 'Investigar causa raiz',
      execution_mode: 'manual',
    },
    expected_impact: 'Impacto esperado',
    technical_explanation: 'Explicacao tecnica',
    executive_explanation: 'Explicacao executiva',
    evidence: [],
    data_gaps: [],
    tags: ['reviewed'],
    hypothesis_status: 'plausible',
    review_notes: [],
    status: 'open',
  };
}

function buildBaseInput(): AgentInput {
  return {
    agent_name: 'executive_summary',
    agent_version: '1.0.0',
    execution_context: {
      tenant_id: '1',
      client_id: '40',
      account_id: '400',
      membership_id: null,
      request_id: 'req-executive-summary',
      correlation_id: 'corr-executive-summary',
      trigger_source: 'scheduler',
      trigger_reference: '9007',
    },
    analysis_window: {
      analysis_window_label: 'analysis_run',
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
    thresholds: {},
    features: {
      consolidated_insights: toJsonValue([
        consolidatedInsight({
          id: '6001',
          title: 'Campanha com fadiga criativa e custo em alta',
          summary: 'A campanha perdeu atratividade e piorou a eficiencia da verba.',
          expectedImpact: 'Recuperar qualidade do clique e reduzir pressao de custo.',
          executiveExplanation: 'Essa campanha perdeu forca e hoje consome verba com menos retorno.',
          technicalExplanation: 'CTR e CVR cairam enquanto CPA subiu acima do baseline.',
          entityLabel: 'Pesquisa Servico Principal',
          actionType: 'review_creative',
          severity: 'critical',
          priorityBand: 'critical',
          priorityScore: 92,
          confidenceScore: 0.91,
          riskLevel: 'medium',
          category: 'creative',
          nextSteps: ['Atualizar copy principal', 'Testar novas variacoes de titulo'],
        }),
        consolidatedInsight({
          id: '6002',
          title: 'Campanha com espaco para expansao controlada',
          summary: 'A campanha mantem eficiencia acima da media e pode absorver mais verba.',
          expectedImpact: 'Capturar mais demanda mantendo controle de custo.',
          executiveExplanation: 'Existe uma frente que pode crescer com boa chance de retorno.',
          technicalExplanation: 'ROAS acima da conta e CPA abaixo da media consolidada.',
          entityLabel: 'Pesquisa Premium',
          actionType: 'scale',
          severity: 'info',
          priorityBand: 'high',
          priorityScore: 78,
          confidenceScore: 0.84,
          riskLevel: 'low',
          category: 'campaign_scaling',
          nextSteps: ['Aumentar verba em 10%', 'Monitorar CPA por 3 dias'],
        }),
        consolidatedInsight({
          id: '6003',
          title: 'Search terms com desperdicio concentrado',
          summary: 'Poucos termos concentram a maior parte do custo ruim.',
          expectedImpact: 'Cortar desperdicio com poucas negativas bem escolhidas.',
          executiveExplanation: 'Grande parte do desperdicio esta em poucos termos e pode ser corrigida rapido.',
          technicalExplanation: 'Top 3 termos concentram mais de 70% do gasto desperdicado.',
          entityLabel: 'Conta consolidada',
          actionType: 'review_search_terms',
          severity: 'warning',
          priorityBand: 'high',
          priorityScore: 81,
          confidenceScore: 0.79,
          riskLevel: 'medium',
          category: 'search_terms',
          nextSteps: ['Aplicar negativas nos termos principais'],
        }),
        consolidatedInsight({
          id: '6004',
          title: 'Regiao vencedora com potencial adicional',
          summary: 'A regiao esta performando acima da media e suporta ganho incremental.',
          expectedImpact: 'Expandir resultado com risco controlado em geografia vencedora.',
          executiveExplanation: 'Uma regiao esta entregando melhor que a media e pode receber mais foco.',
          technicalExplanation: 'CPA abaixo da media e ROAS acima do consolidado por geografia.',
          entityLabel: 'Sao Paulo Capital',
          actionType: 'adjust_geo',
          severity: 'info',
          priorityBand: 'medium',
          priorityScore: 66,
          confidenceScore: 0.73,
          riskLevel: 'low',
          category: 'geo',
          nextSteps: ['Aumentar cobertura da regiao vencedora'],
        }),
      ]),
      reviewed_findings: toJsonValue([
        finding('6001', 'Campanha com fadiga criativa e custo em alta'),
        finding('6002', 'Campanha com espaco para expansao controlada'),
      ]),
    },
    upstream_outputs: [],
  };
}

export const EXECUTIVE_SUMMARY_EXAMPLE_INPUTS = {
  portfolio_summary: buildBaseInput(),
  unavailable: {
    ...buildBaseInput(),
    features: {
      consolidated_insights: toJsonValue([]),
      reviewed_findings: toJsonValue([]),
    },
  } satisfies AgentInput,
} as const;

export const EXECUTIVE_SUMMARY_EXPECTED_TEXT = {
  technical_summary_example:
    'Foram revisados 2 finding(s) e consolidados os desvios com melhor sustentacao. Top problemas: Campanha com fadiga criativa e custo em alta; Search terms com desperdicio concentrado. Top oportunidades: Campanha com espaco para expansao controlada; Regiao vencedora com potencial adicional.',
  executive_summary_example:
    'Os principais pontos que estao travando resultado hoje sao Pesquisa Servico Principal, Conta consolidada. As melhores oportunidades de crescimento estao em Pesquisa Premium, Sao Paulo Capital.',
} as const;
