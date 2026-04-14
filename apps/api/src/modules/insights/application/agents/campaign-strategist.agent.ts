import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentInput,
  AgentFinding,
  PerformanceAgentActionType,
  PerformanceAgentEvidenceItem,
} from '@googleads/shared';

import type { PerformanceAnalysisAgent } from '../../domain/agents/performance-analysis-agent.interface';
import {
  readCampaignSnapshots,
  readMetricsSnapshot,
} from '../../domain/agents/performance-agent-feature-readers';
import type {
  CampaignPerformanceSnapshot,
  PerformanceMetricsSnapshot,
} from '../../domain/agents/performance-agent.types';
import {
  buildAction,
  buildAgentOutput,
  buildFinding,
  calculateConfidenceScore,
  clampNumber,
  percentageDelta,
} from '../../domain/agents/performance-agent.utils';

interface CampaignSignal {
  readonly campaign: CampaignPerformanceSnapshot;
  readonly baseline: CampaignPerformanceSnapshot | null;
  readonly spendSharePct: number;
  readonly conversionSharePct: number | null;
  readonly cpaVsAccount: number | null;
  readonly roasVsAccount: number | null;
  readonly cpaVsPeerMedian: number | null;
  readonly roasVsPeerMedian: number | null;
  readonly cpaDeltaPct: number | null;
  readonly roasDeltaPct: number | null;
  readonly conversionDeltaPct: number | null;
  readonly spendDeltaPct: number | null;
}

interface CampaignThresholds {
  readonly minCampaignClicks: number;
  readonly minCampaignConversions: number;
  readonly minCampaignSpend: number;
  readonly campaignCpaGapMultiplier: number;
  readonly campaignRoasGapMultiplier: number;
  readonly campaignPeerCpaGapMultiplier: number;
  readonly campaignPeerRoasGapMultiplier: number;
  readonly campaignScaleCpaMultiplier: number;
  readonly campaignScaleRoasMultiplier: number;
  readonly campaignScaleMinConversionGrowthPct: number;
  readonly campaignContainMinSpendSharePct: number;
  readonly campaignPauseMinClicks: number;
  readonly campaignPauseMaxConversions: number;
  readonly campaignPauseMinSpendBrl: number;
  readonly campaignPauseRoasMax: number;
  readonly campaignPauseMinSpendSharePct: number;
  readonly campaignInvestigateCpaGrowthPct: number;
  readonly campaignInvestigateConversionDropPct: number;
  readonly campaignConcentrationWarnSpendSharePct: number;
  readonly campaignConcentrationHighSpendSharePct: number;
  readonly campaignBudgetLimitedSearchImpressionSharePct: number;
  readonly campaignBudgetLimitedMinConversions: number;
}

interface CampaignPeerBenchmark {
  readonly medianCpa: number | null;
  readonly medianRoas: number | null;
}

@Injectable()
export class CampaignStrategistAgent implements PerformanceAnalysisAgent {
  public readonly agentName = 'campaign_strategist' as const;
  public readonly isRequired = true;

  private readonly logger = new Logger(CampaignStrategistAgent.name);

  public async execute(input: AgentInput) {
    const currentCampaigns = readCampaignSnapshots(
      input.features.campaign_summaries_current,
    );
    const baselineCampaigns = readCampaignSnapshots(
      input.features.campaign_summaries_baseline,
    );
    const accountCurrent = readMetricsSnapshot(input.features.account_summary_current);

    if (currentCampaigns.length === 0 || accountCurrent === null) {
      this.logger.warn('Campaign Strategist without enough campaign data.');

      return buildAgentOutput({
        agentName: this.agentName,
        agentVersion: input.agent_version,
        executionContext: input.execution_context,
        analysisWindow: input.analysis_window,
        status: 'insufficient_data',
        priorityScore: 0,
        confidenceScore: 0.4,
        dataQuality: {
          ...input.data_quality,
          has_minimum_volume: false,
        },
        summary:
          'Ainda nao ha dados suficientes para recomendar redistribuicao entre campanhas.',
        recommendedFocus: 'Aguardar mais volume e baseline comparavel.',
        candidateEntityIds: [],
        findings: [],
        entitiesEvaluated: 0,
        findingsSuppressed: 0,
      });
    }

    const thresholds = readThresholds(input.thresholds);
    const baselineMap = new Map(
      baselineCampaigns.map((campaign) => [campaign.campaignId, campaign] as const),
    );
    const peerBenchmark = buildPeerBenchmark(currentCampaigns, thresholds);
    const signals = currentCampaigns
      .filter((campaign) =>
        hasCampaignSample(
          campaign,
          thresholds.minCampaignSpend,
          thresholds.minCampaignClicks,
        ),
      )
      .map((campaign) =>
        buildCampaignSignal({
          campaign,
          baseline: baselineMap.get(campaign.campaignId) ?? null,
          accountCurrent,
          peerBenchmark,
        }),
      );

    const findings = dedupeFindings(
      signals.flatMap((signal) =>
        this.buildCampaignFindings(signal, thresholds, accountCurrent),
      ),
    )
      .sort((left, right) => right.priority_score - left.priority_score)
      .slice(0, 8);

    const campaignsWithFinding = new Set(findings.map((finding) => finding.entity_id)).size;

    return buildAgentOutput({
      agentName: this.agentName,
      agentVersion: input.agent_version,
      executionContext: input.execution_context,
      analysisWindow: input.analysis_window,
      status: 'ready',
      priorityScore: findings[0]?.priority_score ?? 42,
      confidenceScore:
        findings.length > 0
          ? Math.max(...findings.map((finding) => finding.confidence_score))
          : 0.56,
      dataQuality: input.data_quality,
      summary: buildCampaignSummary(findings),
      recommendedFocus:
        findings[0]?.recommended_action.description ??
        'Manter revisao tatica das campanhas de maior investimento.',
      candidateEntityIds: currentCampaigns.map((campaign) => campaign.campaignId),
      findings,
      entitiesEvaluated: signals.length,
      findingsSuppressed: Math.max(signals.length - campaignsWithFinding, 0),
    });
  }

  private buildCampaignFindings(
    signal: CampaignSignal,
    thresholds: CampaignThresholds,
    accountCurrent: PerformanceMetricsSnapshot,
  ): AgentFinding[] {
    const primaryFinding =
      this.buildPauseFinding(signal, thresholds) ??
      this.buildContainFinding(signal, thresholds) ??
      this.buildScaleFinding(signal, thresholds) ??
      this.buildInvestigatePerformanceFinding(signal, thresholds);

    const primaryActionType = primaryFinding?.recommended_action.action_type ?? null;
    const findings: AgentFinding[] = [];

    if (primaryFinding !== null) {
      findings.push(primaryFinding);
    }

    const budgetFinding = this.buildBudgetLimitationFinding(
      signal,
      thresholds,
      primaryActionType,
    );

    if (budgetFinding !== null) {
      findings.push(budgetFinding);
    }

    const concentrationFinding = this.buildConcentrationFinding(
      signal,
      thresholds,
      accountCurrent,
      primaryActionType,
    );

    if (concentrationFinding !== null) {
      findings.push(concentrationFinding);
    }

    return findings;
  }

  private buildScaleFinding(
    signal: CampaignSignal,
    thresholds: CampaignThresholds,
  ): AgentFinding | null {
    const campaign = signal.campaign;

    if (
      campaign.conversions < thresholds.minCampaignConversions ||
      campaign.cpa === null ||
      campaign.roas === null ||
      signal.cpaVsAccount === null ||
      signal.roasVsAccount === null
    ) {
      return null;
    }

    const beatsAccount =
      signal.cpaVsAccount <= thresholds.campaignScaleCpaMultiplier &&
      signal.roasVsAccount >= thresholds.campaignScaleRoasMultiplier;
    const beatsPeers =
      (signal.cpaVsPeerMedian === null ||
        signal.cpaVsPeerMedian <= thresholds.campaignScaleCpaMultiplier) &&
      (signal.roasVsPeerMedian === null ||
        signal.roasVsPeerMedian >= thresholds.campaignScaleRoasMultiplier);
    const supportsGrowth =
      signal.baseline === null ||
      signal.conversionDeltaPct === null ||
      signal.conversionDeltaPct >= thresholds.campaignScaleMinConversionGrowthPct ||
      (signal.roasDeltaPct ?? 0) >= 0;
    const notOverconcentrated =
      signal.spendSharePct < thresholds.campaignConcentrationHighSpendSharePct;

    if (!beatsAccount || !beatsPeers || !supportsGrowth || !notOverconcentrated) {
      return null;
    }

    const opportunityScore = clampNumber(
      62 +
        (1 - signal.cpaVsAccount) * 42 +
        (signal.roasVsAccount - 1) * 24 +
        Math.max(signal.conversionDeltaPct ?? 0, 0) * 0.35,
      0,
      100,
    );
    const urgencyScore = clampNumber(
      32 +
        signal.spendSharePct * 0.3 +
        Math.max(
          0,
          thresholds.campaignConcentrationWarnSpendSharePct - signal.spendSharePct,
        ) * 0.25,
      0,
      100,
    );
    const priorityScore = combineScores({
      opportunityScore,
      urgencyScore,
      actionType: 'scale',
    });

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      category: 'campaign_scaling',
      severity: 'info',
      priorityScore,
      confidenceScore: calculateCampaignConfidence(signal, true),
      riskLevel:
        signal.spendSharePct >= thresholds.campaignConcentrationWarnSpendSharePct
          ? 'medium'
          : 'low',
      title: 'Campanha com espaco para expansao controlada',
      summary:
        'A campanha entrega eficiencia acima da conta e dos pares, com sinais consistentes para receber mais verba.',
      diagnosis:
        'A combinacao atual de custo, retorno e volume posiciona essa campanha como candidata forte para ganho incremental de investimento.',
      primaryHypothesis:
        'A campanha esta mais aderente do que as demais frentes da conta para a janela atual.',
      alternativeHypotheses:
        signal.baseline === null
          ? ['Ainda falta baseline proprio da campanha para confirmar tendencia longa.']
          : ['Parte do ganho pode refletir uma janela de demanda temporariamente mais favoravel.'],
      recommendedAction: buildAction(
        'scale',
        'Aumentar a verba de forma gradual e monitorar CPA, ROAS e share de gasto nos proximos ciclos antes de acelerar mais.',
        {
          actionTarget: `campaign:${campaign.campaignId}`,
        },
      ),
      expectedImpact:
        'Capturar mais volume mantendo o investimento concentrado em uma campanha que entrega acima da media.',
      technicalExplanation: `Opportunity ${opportunityScore.toFixed(0)} / urgencia ${urgencyScore.toFixed(0)}. CPA em ${formatRatio(signal.cpaVsAccount)} da conta, ROAS em ${formatRatio(signal.roasVsAccount)} e conversoes ${formatSignedPercent(signal.conversionDeltaPct)} vs baseline proprio.`,
      executiveExplanation:
        'Essa campanha esta performando melhor do que o restante da conta. Faz sentido aumentar verba com cautela para buscar mais resultado sem perder controle.',
      evidence: [
        buildEvidence(
          'campaign_scale_cpa_vs_account',
          'cpa',
          campaign.cpa,
          divideOrNull(campaign.cpa, signal.cpaVsAccount),
          percentageDelta(campaign.cpa, divideOrNull(campaign.cpa, signal.cpaVsAccount)),
          thresholds.campaignScaleCpaMultiplier,
          campaign.campaignName,
          'O custo da campanha esta abaixo do consolidado da conta.',
        ),
        buildEvidence(
          'campaign_scale_roas_vs_account',
          'roas',
          campaign.roas,
          divideOrNull(campaign.roas, signal.roasVsAccount),
          percentageDelta(campaign.roas, divideOrNull(campaign.roas, signal.roasVsAccount)),
          thresholds.campaignScaleRoasMultiplier,
          campaign.campaignName,
          'O retorno da campanha supera a media atual da conta.',
        ),
        buildEvidence(
          'campaign_scale_conversions_vs_baseline',
          'conversions',
          campaign.conversions,
          signal.baseline?.conversions ?? null,
          signal.conversionDeltaPct,
          thresholds.campaignScaleMinConversionGrowthPct,
          campaign.campaignName,
          'O volume recente sustenta a recomendacao de expansao controlada.',
        ),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['campaign', 'scale', 'budget_allocation', 'opportunity'],
    });
  }

  private buildContainFinding(
    signal: CampaignSignal,
    thresholds: CampaignThresholds,
  ): AgentFinding | null {
    const campaign = signal.campaign;

    if (
      campaign.conversions < thresholds.minCampaignConversions ||
      campaign.cpa === null ||
      campaign.roas === null ||
      signal.cpaVsAccount === null ||
      signal.roasVsAccount === null
    ) {
      return null;
    }

    const weakAgainstAccount =
      signal.cpaVsAccount >= thresholds.campaignCpaGapMultiplier &&
      signal.roasVsAccount <= thresholds.campaignRoasGapMultiplier;
    const weakAgainstPeers =
      (signal.cpaVsPeerMedian === null ||
        signal.cpaVsPeerMedian >= thresholds.campaignPeerCpaGapMultiplier) &&
      (signal.roasVsPeerMedian === null ||
        signal.roasVsPeerMedian <= thresholds.campaignPeerRoasGapMultiplier);
    const meaningfulExposure =
      signal.spendSharePct >= thresholds.campaignContainMinSpendSharePct ||
      campaign.spend >= thresholds.campaignPauseMinSpendBrl;
    const worseningTrend =
      signal.baseline === null ||
      (signal.cpaDeltaPct ?? 0) >= thresholds.campaignInvestigateCpaGrowthPct ||
      (signal.conversionDeltaPct ?? 0) <= thresholds.campaignInvestigateConversionDropPct ||
      (signal.roasDeltaPct ?? 0) <= -10;

    if (!weakAgainstAccount || !weakAgainstPeers || !meaningfulExposure || !worseningTrend) {
      return null;
    }

    const opportunityScore = clampNumber(
      38 +
        signal.spendSharePct * 0.9 +
        Math.max((signal.cpaVsAccount - 1) * 28, 0) +
        Math.max((1 - signal.roasVsAccount) * 32, 0),
      0,
      100,
    );
    const urgencyScore = clampNumber(
      56 +
        signal.spendSharePct * 0.65 +
        Math.max(signal.cpaDeltaPct ?? 0, 0) * 0.4 +
        Math.abs(Math.min(signal.conversionDeltaPct ?? 0, 0)) * 0.25,
      0,
      100,
    );
    const priorityScore = combineScores({
      opportunityScore,
      urgencyScore,
      actionType: 'reduce',
    });

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      category: 'campaign_efficiency',
      severity:
        signal.spendSharePct >= thresholds.campaignConcentrationWarnSpendSharePct
          ? 'critical'
          : 'warning',
      priorityScore,
      confidenceScore: calculateCampaignConfidence(signal, true),
      riskLevel: 'medium',
      title: 'Campanha para conter e redistribuir verba',
      summary:
        'A campanha esta consumindo uma fatia relevante do investimento com eficiencia abaixo da conta e dos pares.',
      diagnosis:
        'O peso dessa campanha no orcamento nao esta sendo compensado por retorno proporcional, o que pede contencao e realocacao de verba.',
      primaryHypothesis:
        'A campanha perdeu aderencia recente em segmentacao, termos predominantes ou proposta de valor.',
      alternativeHypotheses:
        signal.baseline === null
          ? ['Ainda nao ha baseline proprio suficiente para medir tendencia longa da campanha.']
          : ['Mudanca recente de concorrencia pode ter pressionado custo e reduzido eficiencia.'],
      recommendedAction: buildAction(
        'reduce',
        'Reduzir a verba incremental desta campanha e priorizar redistribuicao para frentes mais eficientes enquanto a causa e revisada.',
        {
          actionTarget: `campaign:${campaign.campaignId}`,
        },
      ),
      expectedImpact:
        'Conter desperdicio no curto prazo e abrir espaco para campanhas com melhor retorno.',
      technicalExplanation: `Opportunity ${opportunityScore.toFixed(0)} / urgencia ${urgencyScore.toFixed(0)}. Share de gasto ${signal.spendSharePct.toFixed(1)}%, CPA em ${formatRatio(signal.cpaVsAccount)} da conta e ROAS em ${formatRatio(signal.roasVsAccount)}.`,
      executiveExplanation:
        'Essa campanha esta puxando verba demais para um retorno abaixo do restante da conta. O movimento mais seguro agora e reduzir exposicao e revisar a estrategia.',
      evidence: [
        buildEvidence(
          'campaign_contain_cpa_vs_account',
          'cpa',
          campaign.cpa,
          divideOrNull(campaign.cpa, signal.cpaVsAccount),
          percentageDelta(campaign.cpa, divideOrNull(campaign.cpa, signal.cpaVsAccount)),
          thresholds.campaignCpaGapMultiplier,
          campaign.campaignName,
          'O CPA da campanha esta acima da referencia consolidada da conta.',
        ),
        buildEvidence(
          'campaign_contain_roas_vs_account',
          'roas',
          campaign.roas,
          divideOrNull(campaign.roas, signal.roasVsAccount),
          percentageDelta(campaign.roas, divideOrNull(campaign.roas, signal.roasVsAccount)),
          thresholds.campaignRoasGapMultiplier,
          campaign.campaignName,
          'O retorno da campanha esta abaixo da media da conta.',
        ),
        buildEvidence(
          'campaign_contain_spend_share',
          'spend_share_pct',
          signal.spendSharePct,
          signal.conversionSharePct,
          percentageDelta(signal.spendSharePct, signal.conversionSharePct),
          thresholds.campaignContainMinSpendSharePct,
          campaign.campaignName,
          'O peso da campanha no orcamento supera o ganho proporcional em conversoes.',
        ),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['campaign', 'contain', 'efficiency', 'budget_allocation'],
    });
  }

  private buildPauseFinding(
    signal: CampaignSignal,
    thresholds: CampaignThresholds,
  ): AgentFinding | null {
    const campaign = signal.campaign;
    const poorHistory =
      signal.baseline === null ||
      (signal.baseline.conversions <= thresholds.campaignPauseMaxConversions &&
        (signal.baseline.roas === null ||
          signal.baseline.roas <= thresholds.campaignPauseRoasMax));

    if (
      campaign.status !== 'ENABLED' ||
      campaign.spend < thresholds.campaignPauseMinSpendBrl ||
      campaign.clicks < thresholds.campaignPauseMinClicks ||
      campaign.conversions > thresholds.campaignPauseMaxConversions ||
      (campaign.roas !== null && campaign.roas > thresholds.campaignPauseRoasMax) ||
      signal.spendSharePct < thresholds.campaignPauseMinSpendSharePct ||
      !poorHistory
    ) {
      return null;
    }

    const opportunityScore = clampNumber(
      44 +
        signal.spendSharePct * 0.75 +
        campaign.clicks * 0.05 +
        campaign.spend * 0.015,
      0,
      100,
    );
    const urgencyScore = clampNumber(
      72 +
        signal.spendSharePct * 0.55 +
        Math.max(thresholds.campaignPauseMinSpendBrl - campaign.spend, 0) * -0.01,
      0,
      100,
    );
    const priorityScore = combineScores({
      opportunityScore,
      urgencyScore,
      actionType: 'pause',
    });

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      category: 'campaign_efficiency',
      severity: 'critical',
      priorityScore,
      confidenceScore: calculateCampaignConfidence(signal, true),
      riskLevel: 'high',
      title: 'Campanha com sinal forte para pausa',
      summary:
        'A campanha consumiu verba relevante e gerou conversao insuficiente para justificar continuidade sem revisao.',
      diagnosis:
        'O volume de cliques e gasto ja e suficiente para indicar que a campanha esta queimando verba sem retorno proporcional.',
      primaryHypothesis:
        'A proposta da campanha pode estar desalinhada com a intencao do publico ou com a etapa final de conversao.',
      alternativeHypotheses: [
        'Pode haver problema de tracking ou uma queda forte de aderencia recente que pede revisao manual.',
      ],
      recommendedAction: buildAction(
        'pause',
        'Pausar temporariamente a campanha, preservar verba e revisar publico, oferta, termo dominante e tracking antes de reativar.',
        {
          actionTarget: `campaign:${campaign.campaignId}`,
        },
      ),
      expectedImpact:
        'Interromper desperdicio imediato e evitar continuar alimentando uma campanha sem retorno.',
      technicalExplanation: `Opportunity ${opportunityScore.toFixed(0)} / urgencia ${urgencyScore.toFixed(0)}. Gasto ${formatCurrency(campaign.spend)}, ${campaign.clicks} cliques e apenas ${campaign.conversions.toFixed(0)} conversao(oes) na janela.`,
      executiveExplanation:
        'Essa campanha ja consumiu verba suficiente para mostrar que, do jeito atual, nao esta se pagando. O mais seguro e pausar e revisar antes de insistir.',
      evidence: [
        buildEvidence(
          'campaign_pause_spend',
          'spend',
          campaign.spend,
          null,
          null,
          thresholds.campaignPauseMinSpendBrl,
          campaign.campaignName,
          'O gasto ja ultrapassou o piso minimo definido para decisao de pausa.',
        ),
        buildEvidence(
          'campaign_pause_clicks',
          'clicks',
          campaign.clicks,
          null,
          null,
          thresholds.campaignPauseMinClicks,
          campaign.campaignName,
          'A campanha ja recebeu cliques suficientes para uma leitura mais confiavel.',
        ),
        buildEvidence(
          'campaign_pause_conversions',
          'conversions',
          campaign.conversions,
          signal.baseline?.conversions ?? null,
          signal.conversionDeltaPct,
          thresholds.campaignPauseMaxConversions,
          campaign.campaignName,
          'O volume de conversao segue muito baixo para sustentar permanencia ativa.',
        ),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['campaign', 'pause', 'waste', 'urgent'],
    });
  }

  private buildInvestigatePerformanceFinding(
    signal: CampaignSignal,
    thresholds: CampaignThresholds,
  ): AgentFinding | null {
    const campaign = signal.campaign;

    if (
      signal.baseline === null ||
      campaign.conversions < thresholds.minCampaignConversions ||
      campaign.cpa === null ||
      campaign.roas === null
    ) {
      return null;
    }

    const deteriorating =
      ((signal.cpaDeltaPct ?? 0) >= thresholds.campaignInvestigateCpaGrowthPct &&
        ((signal.conversionDeltaPct ?? 0) <= -5 || (signal.roasDeltaPct ?? 0) <= -10)) ||
      ((signal.conversionDeltaPct ?? 0) <= thresholds.campaignInvestigateConversionDropPct &&
        (signal.spendDeltaPct ?? 0) >= -5);

    if (!deteriorating) {
      return null;
    }

    const opportunityScore = clampNumber(
      34 +
        Math.max(signal.spendSharePct, 8) * 0.5 +
        Math.abs(Math.min(signal.conversionDeltaPct ?? 0, 0)) * 0.4,
      0,
      100,
    );
    const urgencyScore = clampNumber(
      52 +
        Math.max(signal.cpaDeltaPct ?? 0, 0) * 0.45 +
        Math.abs(Math.min(signal.conversionDeltaPct ?? 0, 0)) * 0.35,
      0,
      100,
    );
    const priorityScore = combineScores({
      opportunityScore,
      urgencyScore,
      actionType: 'investigate',
    });

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      category: 'campaign_efficiency',
      severity: 'warning',
      priorityScore,
      confidenceScore: calculateCampaignConfidence(signal, true),
      riskLevel: 'medium',
      title: 'Campanha pede investigacao antes de nova decisao de verba',
      summary:
        'A campanha piorou frente ao proprio baseline, mas ainda nao atingiu nivel suficiente para pausa direta.',
      diagnosis:
        'Os sinais da campanha apontam perda recente de eficiencia ou volume, o que pede revisao antes de simplesmente escalar ou cortar forte.',
      primaryHypothesis:
        'Mudanca de segmentacao, busca dominante, criativo ou jornada final da campanha pode ter reduzido a aderencia recente.',
      alternativeHypotheses: [
        'Parte da piora pode refletir atraso de conversao em uma janela curta.',
      ],
      recommendedAction: buildAction(
        'investigate',
        'Investigar termos, criativos, segmentacao e landing page dessa campanha antes de redefinir a estrategia de investimento.',
        {
          actionTarget: `campaign:${campaign.campaignId}`,
        },
      ),
      expectedImpact:
        'Evitar ajuste cego de verba e encontrar a causa mais provavel da piora recente.',
      technicalExplanation: `Opportunity ${opportunityScore.toFixed(0)} / urgencia ${urgencyScore.toFixed(0)}. CPA ${formatSignedPercent(signal.cpaDeltaPct)}, ROAS ${formatSignedPercent(signal.roasDeltaPct)} e conversoes ${formatSignedPercent(signal.conversionDeltaPct)} vs baseline da propria campanha.`,
      executiveExplanation:
        'A campanha piorou em relacao ao que ela mesma vinha entregando. Antes de mexer forte na verba, vale revisar o que mudou dentro dela.',
      evidence: [
        buildEvidence(
          'campaign_investigate_cpa_baseline',
          'cpa',
          campaign.cpa,
          signal.baseline.cpa,
          signal.cpaDeltaPct,
          thresholds.campaignInvestigateCpaGrowthPct,
          campaign.campaignName,
          'O custo da campanha subiu de forma relevante frente ao baseline proprio.',
        ),
        buildEvidence(
          'campaign_investigate_conversions_baseline',
          'conversions',
          campaign.conversions,
          signal.baseline.conversions,
          signal.conversionDeltaPct,
          Math.abs(thresholds.campaignInvestigateConversionDropPct),
          campaign.campaignName,
          'O volume final caiu em relacao ao desempenho recente da campanha.',
        ),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['campaign', 'investigate', 'trend', 'baseline'],
    });
  }

  private buildBudgetLimitationFinding(
    signal: CampaignSignal,
    thresholds: CampaignThresholds,
    primaryActionType: PerformanceAgentActionType | null,
  ): AgentFinding | null {
    const campaign = signal.campaign;

    if (
      primaryActionType === 'reduce' ||
      primaryActionType === 'pause' ||
      primaryActionType === 'investigate' ||
      campaign.searchImpressionShare === null ||
      campaign.searchImpressionShare > thresholds.campaignBudgetLimitedSearchImpressionSharePct ||
      campaign.conversions < thresholds.campaignBudgetLimitedMinConversions ||
      signal.cpaVsAccount === null ||
      signal.roasVsAccount === null ||
      signal.cpaVsAccount > thresholds.campaignScaleCpaMultiplier ||
      signal.roasVsAccount < 1 ||
      signal.spendSharePct >= thresholds.campaignConcentrationHighSpendSharePct
    ) {
      return null;
    }

    const opportunityScore = clampNumber(
      58 +
        (1 - campaign.searchImpressionShare) * 42 +
        Math.max(1 - signal.cpaVsAccount, 0) * 26,
      0,
      100,
    );
    const urgencyScore = clampNumber(
      40 + signal.spendSharePct * 0.25 + campaign.conversions * 0.35,
      0,
      100,
    );
    const priorityScore = combineScores({
      opportunityScore,
      urgencyScore,
      actionType: 'investigate',
    });

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      category: 'budget_allocation',
      severity: 'info',
      priorityScore,
      confidenceScore: calculateCampaignConfidence(signal, false),
      riskLevel: 'low',
      title: 'Campanha eficiente com espaco de entrega para validar limitacao',
      summary:
        'A campanha esta eficiente, mas o alcance ainda parece contido. Vale validar se ha restricao de orcamento ou ranking.',
      diagnosis:
        'Com os dados locais atuais, existe sinal de cobertura abaixo do potencial da campanha, sem evidencia suficiente para afirmar se a limitacao vem de orcamento ou competitividade.',
      primaryHypothesis:
        'A campanha pode ter espaco para capturar mais demanda, mas precisa de validacao de cobertura antes de ampliar verba com forca.',
      alternativeHypotheses: [
        'A cobertura reduzida pode estar ligada a ranking, qualidade ou teto de mercado, nao necessariamente a orcamento.',
      ],
      recommendedAction: buildAction(
        'investigate',
        'Validar share de impressao, competitividade e configuracao de orcamento antes de ampliar a verba desta campanha.',
        {
          actionTarget: `campaign:${campaign.campaignId}`,
        },
      ),
      expectedImpact:
        'Confirmar se existe espaco real de escala e evitar aumento cego de verba.',
      technicalExplanation: `Opportunity ${opportunityScore.toFixed(0)} / urgencia ${urgencyScore.toFixed(0)}. Search impression share em ${(campaign.searchImpressionShare * 100).toFixed(1)}% com eficiencia acima da conta.`,
      executiveExplanation:
        'Essa campanha esta indo bem e ainda parece ter espaco para aparecer mais. Antes de aumentar verba, vale confirmar se o limite atual e de orcamento ou de competitividade.',
      evidence: [
        buildEvidence(
          'campaign_budget_search_impression_share',
          'search_impression_share',
          percentageFromRatio(campaign.searchImpressionShare),
          null,
          null,
          percentageFromRatio(thresholds.campaignBudgetLimitedSearchImpressionSharePct),
          campaign.campaignName,
          'A cobertura atual sugere espaco para entrega adicional, mas a causa ainda precisa de validacao.',
        ),
        buildEvidence(
          'campaign_budget_roas_vs_account',
          'roas',
          campaign.roas,
          divideOrNull(campaign.roas, signal.roasVsAccount),
          percentageDelta(campaign.roas, divideOrNull(campaign.roas, signal.roasVsAccount)),
          1,
          campaign.campaignName,
          'A campanha sustenta boa eficiencia mesmo com cobertura parcial.',
        ),
      ],
      dataGaps: [
        ...collectDataGaps(signal),
        'budget_lost_impression_share_unavailable',
      ],
      tags: ['campaign', 'budget', 'coverage', 'investigate'],
    });
  }

  private buildConcentrationFinding(
    signal: CampaignSignal,
    thresholds: CampaignThresholds,
    accountCurrent: PerformanceMetricsSnapshot,
    primaryActionType: PerformanceAgentActionType | null,
  ): AgentFinding | null {
    const campaign = signal.campaign;

    if (
      primaryActionType === 'reduce' ||
      primaryActionType === 'pause' ||
      signal.spendSharePct < thresholds.campaignConcentrationHighSpendSharePct
    ) {
      return null;
    }

    const underdelivering =
      (signal.conversionSharePct !== null &&
        signal.conversionSharePct < signal.spendSharePct * 0.8) ||
      (signal.cpaVsAccount !== null && signal.cpaVsAccount > 1.05) ||
      (signal.roasVsAccount !== null && signal.roasVsAccount < 0.95);

    if (!underdelivering) {
      return null;
    }

    const opportunityScore = clampNumber(
      42 +
        (signal.spendSharePct - thresholds.campaignConcentrationHighSpendSharePct) * 1.2 +
        Math.max(signal.spendSharePct - (signal.conversionSharePct ?? 0), 0) * 0.55,
      0,
      100,
    );
    const urgencyScore = clampNumber(
      60 +
        signal.spendSharePct * 0.5 +
        Math.max((signal.cpaVsAccount ?? 1) - 1, 0) * 20,
      0,
      100,
    );
    const priorityScore = combineScores({
      opportunityScore,
      urgencyScore,
      actionType: 'investigate',
    });

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      category: 'budget_allocation',
      severity: 'warning',
      priorityScore,
      confidenceScore: calculateCampaignConfidence(signal, false),
      riskLevel: 'medium',
      title: 'Concentracao excessiva de gasto em uma unica campanha',
      summary:
        'Uma parcela muito alta do investimento esta concentrada nesta campanha sem vantagem proporcional de resultado.',
      diagnosis:
        'A conta ficou dependente demais dessa campanha. Mesmo que ela siga ativa, o risco de concentracao pede revisao da distribuicao de verba.',
      primaryHypothesis:
        'A conta pode estar ficando vulneravel a variacao de um unico bloco de investimento.',
      alternativeHypotheses: [
        'Se houver estrategia deliberada de consolidacao, ainda assim vale validar se a concentracao continua racional frente aos pares.',
      ],
      recommendedAction: buildAction(
        'investigate',
        'Revisar a distribuicao de verba da conta e validar se parte do investimento pode ser redistribuida sem perder resultado.',
        {
          actionTarget: `campaign:${campaign.campaignId}`,
        },
      ),
      expectedImpact:
        'Reduzir risco operacional e equilibrar melhor o portifolio de campanhas.',
      technicalExplanation: `Opportunity ${opportunityScore.toFixed(0)} / urgencia ${urgencyScore.toFixed(0)}. Share de gasto ${signal.spendSharePct.toFixed(1)}% para ${formatNullablePercent(signal.conversionSharePct)} do volume de conversoes da conta.`,
      executiveExplanation:
        'Muito investimento ficou concentrado nessa campanha. Mesmo sem pausar, vale revisar se a conta nao ficou dependente demais de uma unica frente.',
      evidence: [
        buildEvidence(
          'campaign_concentration_spend_share',
          'spend_share_pct',
          signal.spendSharePct,
          signal.conversionSharePct,
          percentageDelta(signal.spendSharePct, signal.conversionSharePct),
          thresholds.campaignConcentrationHighSpendSharePct,
          campaign.campaignName,
          'O share de gasto da campanha esta acima do limite de conforto para concentracao.',
        ),
        buildEvidence(
          'campaign_concentration_roas_vs_account',
          'roas',
          campaign.roas,
          accountCurrent.roas,
          percentageDelta(campaign.roas, accountCurrent.roas),
          null,
          campaign.campaignName,
          'O retorno atual nao compensa totalmente a concentracao de verba.',
        ),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['campaign', 'concentration', 'portfolio', 'budget_allocation'],
    });
  }
}

function readThresholds(thresholds: AgentInput['thresholds']): CampaignThresholds {
  return {
    minCampaignClicks: Number(thresholds.min_campaign_clicks ?? 30),
    minCampaignConversions: Number(thresholds.min_campaign_conversions ?? 3),
    minCampaignSpend: Number(thresholds.min_campaign_spend_brl ?? 180),
    campaignCpaGapMultiplier: Number(
      thresholds.campaign_cpa_gap_multiplier ?? 1.25,
    ),
    campaignRoasGapMultiplier: Number(
      thresholds.campaign_roas_gap_multiplier ?? 0.8,
    ),
    campaignPeerCpaGapMultiplier: Number(
      thresholds.campaign_peer_cpa_gap_multiplier ?? 1.2,
    ),
    campaignPeerRoasGapMultiplier: Number(
      thresholds.campaign_peer_roas_gap_multiplier ?? 0.85,
    ),
    campaignScaleCpaMultiplier: Number(
      thresholds.campaign_scale_cpa_multiplier ?? 0.92,
    ),
    campaignScaleRoasMultiplier: Number(
      thresholds.campaign_scale_roas_multiplier ?? 1.03,
    ),
    campaignScaleMinConversionGrowthPct: Number(
      thresholds.campaign_scale_min_conversion_growth_pct ?? 8,
    ),
    campaignContainMinSpendSharePct: Number(
      thresholds.campaign_contain_min_spend_share_pct ?? 12,
    ),
    campaignPauseMinClicks: Number(thresholds.campaign_pause_min_clicks ?? 80),
    campaignPauseMaxConversions: Number(
      thresholds.campaign_pause_max_conversions ?? 1,
    ),
    campaignPauseMinSpendBrl: Number(
      thresholds.campaign_pause_min_spend_brl ?? 350,
    ),
    campaignPauseRoasMax: Number(thresholds.campaign_pause_roas_max ?? 0.7),
    campaignPauseMinSpendSharePct: Number(
      thresholds.campaign_pause_min_spend_share_pct ?? 8,
    ),
    campaignInvestigateCpaGrowthPct: Number(
      thresholds.campaign_investigate_cpa_growth_pct ?? 18,
    ),
    campaignInvestigateConversionDropPct: Number(
      thresholds.campaign_investigate_conversion_drop_pct ?? -18,
    ),
    campaignConcentrationWarnSpendSharePct: Number(
      thresholds.campaign_concentration_warn_spend_share_pct ?? 30,
    ),
    campaignConcentrationHighSpendSharePct: Number(
      thresholds.campaign_concentration_high_spend_share_pct ?? 45,
    ),
    campaignBudgetLimitedSearchImpressionSharePct: Number(
      thresholds.campaign_budget_limited_search_impression_share_pct ?? 0.55,
    ),
    campaignBudgetLimitedMinConversions: Number(
      thresholds.campaign_budget_limited_min_conversions ?? 8,
    ),
  };
}

function hasCampaignSample(
  campaign: CampaignPerformanceSnapshot,
  minSpend: number,
  minClicks: number,
): boolean {
  return campaign.spend >= minSpend && campaign.clicks >= minClicks;
}

function buildPeerBenchmark(
  campaigns: readonly CampaignPerformanceSnapshot[],
  thresholds: CampaignThresholds,
): CampaignPeerBenchmark {
  const eligible = campaigns.filter(
    (campaign) =>
      hasCampaignSample(
        campaign,
        thresholds.minCampaignSpend,
        thresholds.minCampaignClicks,
      ) &&
      campaign.conversions >= thresholds.minCampaignConversions &&
      campaign.cpa !== null &&
      campaign.roas !== null,
  );

  return {
    medianCpa: median(
      eligible
        .map((campaign) => campaign.cpa)
        .filter((value): value is number => value !== null),
    ),
    medianRoas: median(
      eligible
        .map((campaign) => campaign.roas)
        .filter((value): value is number => value !== null),
    ),
  };
}

function buildCampaignSignal(input: {
  readonly campaign: CampaignPerformanceSnapshot;
  readonly baseline: CampaignPerformanceSnapshot | null;
  readonly accountCurrent: PerformanceMetricsSnapshot;
  readonly peerBenchmark: CampaignPeerBenchmark;
}): CampaignSignal {
  const totalSpend = input.accountCurrent.spend;
  const totalConversions = input.accountCurrent.conversions;

  return {
    campaign: input.campaign,
    baseline: input.baseline,
    spendSharePct:
      totalSpend > 0 ? roundNumber((input.campaign.spend / totalSpend) * 100, 1) : 0,
    conversionSharePct:
      totalConversions > 0
        ? roundNumber((input.campaign.conversions / totalConversions) * 100, 1)
        : null,
    cpaVsAccount: ratio(input.campaign.cpa, input.accountCurrent.cpa),
    roasVsAccount: ratio(input.campaign.roas, input.accountCurrent.roas),
    cpaVsPeerMedian: ratio(input.campaign.cpa, input.peerBenchmark.medianCpa),
    roasVsPeerMedian: ratio(input.campaign.roas, input.peerBenchmark.medianRoas),
    cpaDeltaPct: percentageDelta(input.campaign.cpa, input.baseline?.cpa ?? null),
    roasDeltaPct: percentageDelta(input.campaign.roas, input.baseline?.roas ?? null),
    conversionDeltaPct: percentageDelta(
      input.campaign.conversions,
      input.baseline?.conversions ?? null,
    ),
    spendDeltaPct: percentageDelta(input.campaign.spend, input.baseline?.spend ?? null),
  };
}

function calculateCampaignConfidence(
  signal: CampaignSignal,
  requireBaselineBoost: boolean,
): number {
  let score = calculateConfidenceScore(signal.campaign);

  if (signal.baseline !== null && requireBaselineBoost) {
    score += 0.04;
  }

  if (signal.spendSharePct >= 20) {
    score += 0.03;
  }

  if (signal.spendSharePct >= 35) {
    score += 0.03;
  }

  if (signal.campaign.searchImpressionShare !== null) {
    score += 0.01;
  }

  return clampNumber(score, 0.42, 0.98);
}

function combineScores(input: {
  readonly opportunityScore: number;
  readonly urgencyScore: number;
  readonly actionType: PerformanceAgentActionType;
}): number {
  switch (input.actionType) {
    case 'scale':
      return clampNumber(
        input.opportunityScore * 0.65 + input.urgencyScore * 0.35,
        0,
        95,
      );
    case 'pause':
      return clampNumber(
        input.opportunityScore * 0.35 + input.urgencyScore * 0.65,
        0,
        99,
      );
    default:
      return clampNumber(
        input.opportunityScore * 0.45 + input.urgencyScore * 0.55,
        0,
        97,
      );
  }
}

function buildEvidence(
  evidenceId: string,
  metric: string,
  currentValue: number | null,
  baselineValue: number | null,
  deltaPct: number | null,
  thresholdValue: number | null,
  scopeLabel: string,
  note: string,
): PerformanceAgentEvidenceItem {
  return {
    evidence_id: evidenceId,
    metric,
    current_value: currentValue,
    baseline_value: baselineValue,
    delta_pct: deltaPct,
    threshold_value: thresholdValue,
    window: 'analysis_run',
    scope_label: scopeLabel,
    source_table: 'fact_google_ads_campaign_daily',
    note,
  };
}

function collectDataGaps(signal: CampaignSignal): string[] {
  const gaps = new Set<string>();

  if (signal.baseline === null) {
    gaps.add('campaign_baseline_missing');
  }

  if (signal.cpaVsPeerMedian === null || signal.roasVsPeerMedian === null) {
    gaps.add('campaign_peer_benchmark_partial');
  }

  if (signal.campaign.searchImpressionShare === null) {
    gaps.add('search_impression_share_unavailable');
  }

  return Array.from(gaps);
}

function buildCampaignSummary(findings: readonly AgentFinding[]): string {
  if (findings.length === 0) {
    return 'A carteira de campanhas nao mostrou desvio forte o suficiente para mexer no orcamento agora.';
  }

  const counts = {
    scale: findings.filter((finding) => finding.recommended_action.action_type === 'scale')
      .length,
    reduce: findings.filter((finding) => finding.recommended_action.action_type === 'reduce')
      .length,
    pause: findings.filter((finding) => finding.recommended_action.action_type === 'pause')
      .length,
    investigate: findings.filter(
      (finding) => finding.recommended_action.action_type === 'investigate',
    ).length,
  };

  return `${findings.length} insight(s) por campanha. Escalar: ${counts.scale}, conter: ${counts.reduce}, pausar: ${counts.pause}, investigar: ${counts.investigate}.`;
}

function dedupeFindings(findings: readonly AgentFinding[]): AgentFinding[] {
  return Array.from(
    new Map(findings.map((finding) => [finding.finding_key, finding] as const)).values(),
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1];
    const right = sorted[middle];

    if (left === undefined || right === undefined) {
      return null;
    }

    return roundNumber((left + right) / 2, 4);
  }

  const value = sorted[middle];
  return value === undefined ? null : roundNumber(value, 4);
}

function ratio(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline === 0) {
    return null;
  }

  return roundNumber(current / baseline, 4);
}

function divideOrNull(current: number | null, ratioValue: number | null): number | null {
  if (current === null || ratioValue === null || ratioValue === 0) {
    return null;
  }

  return roundNumber(current / ratioValue, 4);
}

function percentageFromRatio(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return roundNumber(value * 100, 2);
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(0)}`;
}

function formatRatio(value: number | null): string {
  if (value === null) {
    return 'n/d';
  }

  return `${value.toFixed(2)}x`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return 'n/d';
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatNullablePercent(value: number | null): string {
  if (value === null) {
    return 'n/d';
  }

  return `${value.toFixed(1)}%`;
}
