import { Injectable, Logger } from '@nestjs/common';
import type { AgentFinding, AgentInput, PerformanceAgentEvidenceItem } from '@googleads/shared';

import type { PerformanceAnalysisAgent } from '../../domain/agents/performance-analysis-agent.interface';
import {
  readMetricsSnapshot,
  readSearchTermSnapshots,
} from '../../domain/agents/performance-agent-feature-readers';
import type { SearchTermPerformanceSnapshot } from '../../domain/agents/performance-agent.types';
import {
  buildAction,
  buildAgentOutput,
  buildFinding,
  calculateConfidenceScore,
  clampNumber,
  percentageDelta,
} from '../../domain/agents/performance-agent.utils';

interface SearchTermThresholds {
  readonly minClicks: number;
  readonly minSpend: number;
  readonly wasteMinClicks: number;
  readonly wasteMinSpend: number;
  readonly explorationMaxClicks: number;
  readonly explorationMaxSpend: number;
  readonly irrelevantMinClicks: number;
  readonly irrelevantMinSpend: number;
  readonly opportunityMinClicks: number;
  readonly opportunityMinConversions: number;
  readonly opportunityRoasMultiplier: number;
  readonly opportunityCpaMultiplier: number;
  readonly concentrationTopSharePct: number;
  readonly concentrationMinWasteTerms: number;
  readonly irrelevantTokenPatterns: readonly string[];
}

interface SearchTermSignal {
  readonly row: SearchTermPerformanceSnapshot;
  readonly baseline: SearchTermPerformanceSnapshot | null;
  readonly cpaVsAccount: number | null;
  readonly roasVsAccount: number | null;
  readonly cpaDeltaPct: number | null;
  readonly roasDeltaPct: number | null;
  readonly conversionDeltaPct: number | null;
}

@Injectable()
export class SearchTermsSpecialistAgent implements PerformanceAnalysisAgent {
  public readonly agentName = 'search_terms_specialist' as const;
  public readonly isRequired = false;

  private readonly logger = new Logger(SearchTermsSpecialistAgent.name);

  public async execute(input: AgentInput) {
    const searchTermsAvailable = input.features.search_terms_available === true;
    const currentRows = readSearchTermSnapshots(input.features.search_term_rows_current);
    const baselineRows = readSearchTermSnapshots(input.features.search_term_rows_baseline);
    const accountCurrent = readMetricsSnapshot(input.features.account_summary_current);

    if (!searchTermsAvailable || currentRows.length === 0 || accountCurrent === null) {
      this.logger.warn('Search Terms Specialist without local search term data.');

      return buildAgentOutput({
        agentName: this.agentName,
        agentVersion: input.agent_version,
        executionContext: input.execution_context,
        analysisWindow: input.analysis_window,
        status: 'insufficient_data',
        priorityScore: 0,
        confidenceScore: 0.3,
        dataQuality: {
          ...input.data_quality,
          warnings: Array.from(
            new Set([...input.data_quality.warnings, 'search_terms_unavailable']),
          ),
        },
        summary:
          'O banco local ainda nao tem search terms suficientes para analise confiavel.',
        recommendedFocus:
          'Ativar coleta local de termos de pesquisa antes de usar este especialista.',
        candidateEntityIds: [],
        findings: [],
        entitiesEvaluated: 0,
        findingsSuppressed: 0,
      });
    }

    const thresholds = readThresholds(input.thresholds);
    const baselineMap = new Map(
      baselineRows.map((row) => [buildSearchTermKey(row), row] as const),
    );

    const signals = currentRows
      .filter((row) => row.clicks >= thresholds.minClicks || row.spend >= thresholds.minSpend)
      .map((row) =>
        buildSignal({
          row,
          baseline: baselineMap.get(buildSearchTermKey(row)) ?? null,
          accountCpa: accountCurrent.cpa,
          accountRoas: accountCurrent.roas,
        }),
      );

    const wasteSignals = signals.filter((signal) =>
      isWasteWithoutConversion(signal, thresholds),
    );

    const findings = dedupeFindings([
      ...signals.flatMap((signal) => this.buildTermFindings(signal, thresholds)),
      ...this.buildConcentrationFindings({
        wasteSignals,
        thresholds,
        accountId: input.execution_context.account_id ?? input.execution_context.client_id,
      }),
    ])
      .sort((left, right) => right.priority_score - left.priority_score)
      .slice(0, 10);

    return buildAgentOutput({
      agentName: this.agentName,
      agentVersion: input.agent_version,
      executionContext: input.execution_context,
      analysisWindow: input.analysis_window,
      status: findings.length > 0 ? 'ready' : 'skipped',
      priorityScore: findings[0]?.priority_score ?? 30,
      confidenceScore:
        findings.length > 0
          ? Math.max(...findings.map((finding) => finding.confidence_score))
          : 0.5,
      dataQuality: input.data_quality,
      summary:
        findings.length > 0
          ? 'Os termos de pesquisa mostram focos claros de desperdicio, negativas potenciais e oportunidades de expansao.'
          : 'Nenhum termo de pesquisa mostrou desvio forte o suficiente para acao imediata nesta janela.',
      recommendedFocus:
        findings[0]?.recommended_action.description ??
        'Seguir monitorando consultas com mais gasto e mais conversao.',
      candidateEntityIds: currentRows.map((row) => row.searchTerm),
      findings,
      entitiesEvaluated: currentRows.length,
      findingsSuppressed: Math.max(currentRows.length - findings.length, 0),
    });
  }

  private buildTermFindings(
    signal: SearchTermSignal,
    thresholds: SearchTermThresholds,
  ): AgentFinding[] {
    const findings: AgentFinding[] = [];

    const wasteFinding = this.buildWasteFinding(signal, thresholds);
    if (wasteFinding !== null) {
      findings.push(wasteFinding);
    }

    const irrelevantFinding = this.buildIrrelevantTermFinding(signal, thresholds);
    if (irrelevantFinding !== null) {
      findings.push(irrelevantFinding);
    }

    const opportunityFinding = this.buildSemanticOpportunityFinding(
      signal,
      thresholds,
    );
    if (opportunityFinding !== null) {
      findings.push(opportunityFinding);
    }

    return findings;
  }

  private buildWasteFinding(
    signal: SearchTermSignal,
    thresholds: SearchTermThresholds,
  ): AgentFinding | null {
    if (!isWasteWithoutConversion(signal, thresholds)) {
      return null;
    }

    const row = signal.row;
    const priorityScore = clampNumber(58 + row.spend * 0.12 + row.clicks * 0.1, 0, 96);

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'search_term',
      entityId: buildSearchTermEntityId(row),
      entityLabel: row.searchTerm,
      category: 'search_terms',
      severity: row.spend >= thresholds.wasteMinSpend * 1.5 ? 'critical' : 'warning',
      priorityScore,
      confidenceScore: calculateSearchTermConfidence(signal, true),
      riskLevel: 'medium',
      title: 'Termo com gasto relevante e sem conversao',
      summary:
        'O termo acumulou custo suficiente para analise e nao trouxe conversoes na janela atual.',
      diagnosis:
        'Esse termo ja saiu da fase de exploracao inicial e hoje representa desperdicio potencial no mix de buscas.',
      primaryHypothesis:
        'A consulta esta pouco aderente a intencao de compra ou precisa ser filtrada com negativas e correspondencias mais restritas.',
      alternativeHypotheses:
        signal.baseline === null
          ? ['Ainda falta um baseline maior para entender a recorrencia historica do termo.']
          : ['A perda recente pode ter relacao com mudanca de contexto competitivo ou de mensagem.'],
      recommendedAction: buildAction(
        'review_search_terms',
        'Revisar o termo, considerar negativa ou ajuste de correspondencia e manter monitoramento apos a mudanca.',
        {
          actionTarget: `search_term:${row.searchTerm}`,
        },
      ),
      expectedImpact:
        'Reduzir custo desperdicado em consultas que nao estao convertendo.',
      technicalExplanation: `Termo com ${row.clicks} cliques, gasto de ${row.spend.toFixed(2)} e 0 conversoes. O volume ja ultrapassa os pisos de exploracao valida definidos para a conta.`,
      executiveExplanation:
        'Esse termo ja gastou o bastante para mostrar que, do jeito atual, nao esta trazendo retorno. Vale revisar ou bloquear para evitar desperdicio.',
      evidence: [
        buildEvidence({
          evidenceId: 'search_term_waste_spend',
          metric: 'spend',
          currentValue: row.spend,
          baselineValue: signal.baseline?.spend ?? null,
          deltaPct: percentageDelta(row.spend, signal.baseline?.spend ?? null),
          thresholdValue: thresholds.wasteMinSpend,
          scopeLabel: row.searchTerm,
          note: 'O termo ultrapassou o piso de gasto para sair da categoria de exploracao valida.',
        }),
        buildEvidence({
          evidenceId: 'search_term_waste_clicks',
          metric: 'clicks',
          currentValue: row.clicks,
          baselineValue: signal.baseline?.clicks ?? null,
          deltaPct: percentageDelta(row.clicks, signal.baseline?.clicks ?? null),
          thresholdValue: thresholds.wasteMinClicks,
          scopeLabel: row.searchTerm,
          note: 'O volume de clique confirma que o termo ja teve exposicao suficiente para avaliacao.',
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['search_terms', 'waste', 'no-conversion'],
    });
  }

  private buildIrrelevantTermFinding(
    signal: SearchTermSignal,
    thresholds: SearchTermThresholds,
  ): AgentFinding | null {
    const row = signal.row;

    if (
      row.clicks < thresholds.irrelevantMinClicks ||
      row.spend < thresholds.irrelevantMinSpend ||
      !matchesIrrelevantPattern(row.searchTerm, thresholds.irrelevantTokenPatterns)
    ) {
      return null;
    }

    const priorityScore = clampNumber(54 + row.spend * 0.1 + row.clicks * 0.08, 0, 94);

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'search_term',
      entityId: buildSearchTermEntityId(row),
      entityLabel: row.searchTerm,
      category: 'search_terms',
      severity: row.conversions > 0 ? 'warning' : 'critical',
      priorityScore,
      confidenceScore: calculateSearchTermConfidence(signal, false),
      riskLevel: 'medium',
      title: 'Termo com sinal de irrelevancia para a oferta',
      summary:
        'O texto da consulta sugere baixa aderencia e o comportamento local reforca necessidade de revisao.',
      diagnosis:
        'A consulta tem tracos semanticos de baixa intencao ou desalinhamento com a oferta anunciada, o que aumenta a chance de desperdicio.',
      primaryHypothesis:
        'Esse termo deve entrar em revisao para negativa exata ou refinamento de correspondencia.',
      alternativeHypotheses: [
        'A irrelevancia precisa ser confirmada junto ao contexto comercial antes de bloquear definitivamente.',
      ],
      recommendedAction: buildAction(
        'review_search_terms',
        'Avaliar este termo como candidato a negativa e revisar se a correspondencia atual esta aberta demais para a oferta.',
        {
          actionTarget: `search_term:${row.searchTerm}`,
        },
      ),
      expectedImpact:
        'Limpar trafego de baixa aderencia e proteger investimento contra consultas desalinhadas.',
      technicalExplanation: `O termo acionou padroes semanticos classificados como pouco aderentes e ja acumulou ${row.clicks} cliques com gasto de ${row.spend.toFixed(2)}.`,
      executiveExplanation:
        'Esse termo parece pouco alinhado ao que a campanha quer atrair. Vale revisar e, se confirmar, bloquear para evitar custo desnecessario.',
      evidence: [
        buildEvidence({
          evidenceId: 'search_term_irrelevant_pattern',
          metric: 'irrelevant_pattern_match',
          currentValue: row.clicks,
          baselineValue: null,
          deltaPct: null,
          thresholdValue: thresholds.irrelevantMinClicks,
          scopeLabel: row.searchTerm,
          note: `O termo bateu em padroes semanticos configurados como potencialmente irrelevantes: ${findMatchedPatterns(row.searchTerm, thresholds.irrelevantTokenPatterns).join(', ')}`,
        }),
        buildEvidence({
          evidenceId: 'search_term_irrelevant_spend',
          metric: 'spend',
          currentValue: row.spend,
          baselineValue: signal.baseline?.spend ?? null,
          deltaPct: percentageDelta(row.spend, signal.baseline?.spend ?? null),
          thresholdValue: thresholds.irrelevantMinSpend,
          scopeLabel: row.searchTerm,
          note: 'O termo ja gerou exposicao suficiente para entrar em revisao semantica.',
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['search_terms', 'irrelevant', 'negative_candidate'],
    });
  }

  private buildSemanticOpportunityFinding(
    signal: SearchTermSignal,
    thresholds: SearchTermThresholds,
  ): AgentFinding | null {
    const row = signal.row;

    if (
      row.clicks < thresholds.opportunityMinClicks ||
      row.conversions < thresholds.opportunityMinConversions ||
      row.roas === null ||
      row.cpa === null ||
      signal.roasVsAccount === null ||
      signal.cpaVsAccount === null
    ) {
      return null;
    }

    const winner =
      signal.roasVsAccount >= thresholds.opportunityRoasMultiplier &&
      signal.cpaVsAccount <= thresholds.opportunityCpaMultiplier;

    if (!winner) {
      return null;
    }

    const priorityScore = clampNumber(
      50 +
        Math.max(signal.roasVsAccount - 1, 0) * 26 +
        Math.max(1 - signal.cpaVsAccount, 0) * 24 +
        row.conversions * 0.8,
      0,
      90,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'search_term',
      entityId: buildSearchTermEntityId(row),
      entityLabel: row.searchTerm,
      category: 'search_terms',
      severity: 'info',
      priorityScore,
      confidenceScore: calculateSearchTermConfidence(signal, true),
      riskLevel: 'low',
      title: 'Termo com oportunidade de expansao semantica',
      summary:
        'A consulta entrega resultado acima da media e pode inspirar expansao controlada de familias semanticas proximas.',
      diagnosis:
        'O termo mostra aderencia acima da media da conta e sugere espaco para ampliar cobertura em variantes semanticamente proximas.',
      primaryHypothesis:
        'Existe um grupo de intencao vencedor por tras desse termo que merece expansao controlada.',
      alternativeHypotheses:
        signal.baseline === null
          ? []
          : ['A vantagem precisa ser revalidada se a expansao aumentar muito a cobertura.'],
      recommendedAction: buildAction(
        'review_search_terms',
        'Mapear variantes proximas deste termo e testar expansao semantica com controle de correspondencia e monitoramento de CPA.',
        {
          actionTarget: `search_term:${row.searchTerm}`,
        },
      ),
      expectedImpact:
        'Capturar demanda adicional aproveitando uma familia de consultas que ja mostrou boa aderencia.',
      technicalExplanation: `ROAS do termo em ${formatRatio(signal.roasVsAccount)} da conta e CPA em ${formatRatio(signal.cpaVsAccount)} do consolidado, com ${row.conversions.toFixed(1)} conversoes na janela.`,
      executiveExplanation:
        'Esse termo esta funcionando bem acima da media. Vale usar esse aprendizado para testar variacoes parecidas e buscar mais resultado.',
      evidence: [
        buildEvidence({
          evidenceId: 'search_term_opportunity_roas',
          metric: 'roas',
          currentValue: row.roas,
          baselineValue: divideOrNull(row.roas, signal.roasVsAccount),
          deltaPct: percentageDelta(row.roas, divideOrNull(row.roas, signal.roasVsAccount)),
          thresholdValue: thresholds.opportunityRoasMultiplier,
          scopeLabel: row.searchTerm,
          note: 'O retorno do termo supera a media da conta.',
        }),
        buildEvidence({
          evidenceId: 'search_term_opportunity_cpa',
          metric: 'cpa',
          currentValue: row.cpa,
          baselineValue: divideOrNull(row.cpa, signal.cpaVsAccount),
          deltaPct: percentageDelta(row.cpa, divideOrNull(row.cpa, signal.cpaVsAccount)),
          thresholdValue: thresholds.opportunityCpaMultiplier,
          scopeLabel: row.searchTerm,
          note: 'O custo do termo esta abaixo da referencia consolidada.',
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['search_terms', 'semantic_opportunity', 'expansion'],
    });
  }

  private buildConcentrationFindings(input: {
    readonly wasteSignals: readonly SearchTermSignal[];
    readonly thresholds: SearchTermThresholds;
    readonly accountId: string;
  }): AgentFinding[] {
    if (input.wasteSignals.length < input.thresholds.concentrationMinWasteTerms) {
      return [];
    }

    const sortedBySpend = [...input.wasteSignals].sort(
      (left, right) => right.row.spend - left.row.spend,
    );
    const topWasteSignals = sortedBySpend.slice(0, 3);
    const totalWasteSpend = sortedBySpend.reduce((total, signal) => total + signal.row.spend, 0);
    const topSharePct =
      totalWasteSpend > 0
        ? roundNumber(
            (topWasteSignals.reduce((total, signal) => total + signal.row.spend, 0) /
              totalWasteSpend) *
              100,
            1,
          )
        : 0;

    if (topSharePct < input.thresholds.concentrationTopSharePct) {
      return [];
    }

    const priorityScore = clampNumber(
      62 + (topSharePct - input.thresholds.concentrationTopSharePct) * 0.7,
      0,
      94,
    );

    return [
      buildFinding({
        sourceAgent: this.agentName,
        entityType: 'account',
        entityId: input.accountId,
        entityLabel: 'Conta consolidada',
        category: 'search_terms',
        severity: topSharePct >= 75 ? 'critical' : 'warning',
        priorityScore,
        confidenceScore: clampNumber(
          average(topWasteSignals.map((signal) => calculateSearchTermConfidence(signal, true))),
          0.5,
          0.95,
        ),
        riskLevel: 'medium',
        title: 'Desperdicio concentrado em poucos termos',
        summary:
          'Uma pequena lista de termos concentra a maior parte do gasto desperdicado em search terms.',
        diagnosis:
          'O desperdicio de consultas nao esta pulverizado; ele se concentra em poucos termos, o que facilita acao corretiva mais objetiva.',
        primaryHypothesis:
          'A conta esta aberta demais para alguns grupos de consulta pouco aderentes e eles estao puxando a maior parte do custo inutil.',
        alternativeHypotheses: [
          'Parte da concentracao pode refletir um unico grupo de anuncios com correspondencia ampla demais.',
        ],
        recommendedAction: buildAction(
          'review_search_terms',
          `Priorizar revisao dos termos ${topWasteSignals
            .map((signal) => `"${signal.row.searchTerm}"`)
            .join(', ')} e aplicar negativas ou ajustes de correspondencia conforme contexto comercial.`,
          {
            actionTarget: 'account',
          },
        ),
        expectedImpact:
          'Reduzir rapidamente a maior parte do desperdicio em consultas com poucas acoes bem direcionadas.',
        technicalExplanation: `Os ${topWasteSignals.length} principais termos de desperdicio concentram ${topSharePct.toFixed(1)}% do gasto total desperdicado em search terms na janela.`,
        executiveExplanation:
          'A maior parte do desperdicio em buscas esta concentrada em poucos termos. Isso e bom para agir rapido, porque algumas correcoes podem cortar boa parte do custo ruim.',
        evidence: topWasteSignals.map((signal, index) =>
          buildEvidence({
            evidenceId: `search_term_concentration_${index + 1}`,
            metric: 'spend',
            currentValue: signal.row.spend,
            baselineValue: totalWasteSpend,
            deltaPct: percentageDelta(signal.row.spend, totalWasteSpend),
            thresholdValue: input.thresholds.concentrationTopSharePct,
            scopeLabel: signal.row.searchTerm,
            note: 'O termo esta entre os principais concentradores de desperdicio na conta.',
          }),
        ),
        dataGaps: Array.from(
          new Set(topWasteSignals.flatMap((signal) => collectDataGaps(signal))),
        ),
        tags: ['search_terms', 'waste_concentration', 'negative_candidate'],
      }),
    ];
  }
}

function readThresholds(thresholds: AgentInput['thresholds']): SearchTermThresholds {
  return {
    minClicks: Number(thresholds.search_terms_min_clicks ?? 8),
    minSpend: Number(thresholds.search_terms_min_spend_brl ?? 40),
    wasteMinClicks: Number(thresholds.search_terms_waste_min_clicks ?? 20),
    wasteMinSpend: Number(thresholds.search_terms_waste_min_spend_brl ?? 80),
    explorationMaxClicks: Number(thresholds.search_terms_exploration_max_clicks ?? 18),
    explorationMaxSpend: Number(thresholds.search_terms_exploration_max_spend_brl ?? 70),
    irrelevantMinClicks: Number(thresholds.search_terms_irrelevant_min_clicks ?? 12),
    irrelevantMinSpend: Number(thresholds.search_terms_irrelevant_min_spend_brl ?? 55),
    opportunityMinClicks: Number(thresholds.search_terms_opportunity_min_clicks ?? 15),
    opportunityMinConversions: Number(
      thresholds.search_terms_opportunity_min_conversions ?? 2,
    ),
    opportunityRoasMultiplier: Number(
      thresholds.search_terms_opportunity_roas_multiplier ?? 1.15,
    ),
    opportunityCpaMultiplier: Number(
      thresholds.search_terms_opportunity_cpa_multiplier ?? 0.9,
    ),
    concentrationTopSharePct: Number(
      thresholds.search_terms_concentration_top_share_pct ?? 65,
    ),
    concentrationMinWasteTerms: Number(
      thresholds.search_terms_concentration_min_waste_terms ?? 3,
    ),
    irrelevantTokenPatterns: String(
      thresholds.search_terms_irrelevant_token_patterns ??
        'gratis,free,emprego,vaga,curso,como fazer,manual,pdf,mercado livre,olx,reclame aqui,telefone,whatsapp',
    )
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
  };
}

function buildSignal(input: {
  readonly row: SearchTermPerformanceSnapshot;
  readonly baseline: SearchTermPerformanceSnapshot | null;
  readonly accountCpa: number | null;
  readonly accountRoas: number | null;
}): SearchTermSignal {
  return {
    row: input.row,
    baseline: input.baseline,
    cpaVsAccount: ratio(input.row.cpa, input.accountCpa),
    roasVsAccount: ratio(input.row.roas, input.accountRoas),
    cpaDeltaPct: percentageDelta(input.row.cpa, input.baseline?.cpa ?? null),
    roasDeltaPct: percentageDelta(input.row.roas, input.baseline?.roas ?? null),
    conversionDeltaPct: percentageDelta(input.row.conversions, input.baseline?.conversions ?? null),
  };
}

function isWasteWithoutConversion(
  signal: SearchTermSignal,
  thresholds: SearchTermThresholds,
): boolean {
  const row = signal.row;

  if (row.conversions > 0) {
    return false;
  }

  const stillExploring =
    row.clicks <= thresholds.explorationMaxClicks &&
    row.spend <= thresholds.explorationMaxSpend;

  if (stillExploring) {
    return false;
  }

  return row.clicks >= thresholds.wasteMinClicks && row.spend >= thresholds.wasteMinSpend;
}

function matchesIrrelevantPattern(searchTerm: string, patterns: readonly string[]): boolean {
  const normalized = normalizeTerm(searchTerm);
  return patterns.some((pattern) => normalized.includes(normalizeTerm(pattern)));
}

function findMatchedPatterns(searchTerm: string, patterns: readonly string[]): string[] {
  const normalized = normalizeTerm(searchTerm);
  return patterns.filter((pattern) => normalized.includes(normalizeTerm(pattern)));
}

function buildSearchTermKey(row: SearchTermPerformanceSnapshot): string {
  return `${row.campaignId}:${normalizeTerm(row.searchTerm)}`;
}

function buildSearchTermEntityId(row: SearchTermPerformanceSnapshot): string {
  return `${row.campaignId}:${normalizeTerm(row.searchTerm)}`;
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

function calculateSearchTermConfidence(
  signal: SearchTermSignal,
  baselineBoost: boolean,
): number {
  let score = calculateConfidenceScore(signal.row);

  if (baselineBoost && signal.baseline !== null) {
    score += 0.04;
  }

  if (signal.row.clicks >= 30) {
    score += 0.03;
  }

  if (signal.row.spend >= 120) {
    score += 0.03;
  }

  return clampNumber(score, 0.42, 0.98);
}

function buildEvidence(input: {
  readonly evidenceId: string;
  readonly metric: string;
  readonly currentValue: number | null;
  readonly baselineValue: number | null;
  readonly deltaPct: number | null;
  readonly thresholdValue: number | null;
  readonly scopeLabel: string;
  readonly note: string;
}): PerformanceAgentEvidenceItem {
  return {
    evidence_id: input.evidenceId,
    metric: input.metric,
    current_value: input.currentValue,
    baseline_value: input.baselineValue,
    delta_pct: input.deltaPct,
    threshold_value: input.thresholdValue,
    window: 'analysis_run',
    scope_label: input.scopeLabel,
    source_table: 'fact_google_ads_search_term_daily',
    note: input.note,
  };
}

function collectDataGaps(signal: SearchTermSignal): string[] {
  const gaps = new Set<string>();

  if (signal.baseline === null) {
    gaps.add('search_term_baseline_missing');
  }

  if (signal.row.conversions === 0) {
    gaps.add('search_term_no_conversion_signal');
  }

  return Array.from(gaps);
}

function dedupeFindings(findings: readonly AgentFinding[]): AgentFinding[] {
  return Array.from(
    new Map(findings.map((finding) => [finding.finding_key, finding] as const)).values(),
  );
}

function ratio(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline === 0) {
    return null;
  }

  return roundNumber(current / baseline, 4);
}

function divideOrNull(current: number | null, divisor: number | null): number | null {
  if (current === null || divisor === null || divisor === 0) {
    return null;
  }

  return roundNumber(current / divisor, 4);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatRatio(value: number | null): string {
  if (value === null) {
    return 'n/d';
  }

  return `${value.toFixed(2)}x`;
}
