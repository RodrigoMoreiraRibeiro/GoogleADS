import { Injectable, Logger } from '@nestjs/common';
import type { AgentFinding, AgentInput, PerformanceAgentEvidenceItem } from '@googleads/shared';

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

interface CreativeThresholds {
  readonly minClicks: number;
  readonly minImpressions: number;
  readonly minSpend: number;
  readonly ctrDropPct: number;
  readonly cvrDropPct: number;
  readonly cpaGrowthPct: number;
  readonly lowCtrRatioVsAccount: number;
  readonly lowCtrRatioVsBaseline: number;
  readonly misalignmentMinClicks: number;
  readonly misalignmentCtrRatioVsAccount: number;
  readonly misalignmentCvrRatioVsAccount: number;
  readonly misalignmentCpaMultiplier: number;
  readonly refreshCtrRatioVsAccount: number;
  readonly refreshCvrRatioVsBaseline: number;
  readonly refreshMinSpend: number;
}

interface CreativeSignal {
  readonly current: CampaignPerformanceSnapshot;
  readonly baseline: CampaignPerformanceSnapshot;
  readonly accountCurrent: PerformanceMetricsSnapshot;
  readonly accountBaseline: PerformanceMetricsSnapshot | null;
  readonly currentCvr: number | null;
  readonly baselineCvr: number | null;
  readonly accountCurrentCvr: number | null;
  readonly accountBaselineCvr: number | null;
  readonly ctrDeltaPct: number | null;
  readonly cvrDeltaPct: number | null;
  readonly cpaDeltaPct: number | null;
  readonly ctrVsAccount: number | null;
  readonly cvrVsAccount: number | null;
  readonly cpaVsAccount: number | null;
  readonly cvrVsBaseline: number | null;
}

@Injectable()
export class CreativePerformanceAgent implements PerformanceAnalysisAgent {
  public readonly agentName = 'creative_performance' as const;
  public readonly isRequired = false;

  private readonly logger = new Logger(CreativePerformanceAgent.name);

  public async execute(input: AgentInput) {
    const currentCampaigns = readCampaignSnapshots(input.features.campaign_summaries_current);
    const baselineCampaigns = readCampaignSnapshots(input.features.campaign_summaries_baseline);
    const accountCurrent = readMetricsSnapshot(input.features.account_summary_current);
    const accountBaseline = readMetricsSnapshot(input.features.account_summary_baseline);

    if (currentCampaigns.length === 0 || baselineCampaigns.length === 0 || accountCurrent === null) {
      this.logger.warn('Creative Performance without enough local baseline.');

      return buildAgentOutput({
        agentName: this.agentName,
        agentVersion: input.agent_version,
        executionContext: input.execution_context,
        analysisWindow: input.analysis_window,
        status: 'insufficient_data',
        priorityScore: 0,
        confidenceScore: 0.38,
        dataQuality: {
          ...input.data_quality,
          has_baseline: false,
          warnings: Array.from(new Set([...input.data_quality.warnings, 'creative_baseline_missing'])),
        },
        summary:
          'Nao existe baseline suficiente para inferir perda criativa com seguranca.',
        recommendedFocus:
          'Aguardar mais historico ou coletar detalhe por anuncio antes de usar este especialista.',
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

    const findings = currentCampaigns
      .flatMap((campaign) => {
        const baseline = baselineMap.get(campaign.campaignId);

        if (baseline === undefined || !hasMinimumCreativeSample(campaign, thresholds)) {
          return [];
        }

        const signal = buildSignal({
          current: campaign,
          baseline,
          accountCurrent,
          accountBaseline,
        });

        return dedupeFindings([
          this.buildFatigueFinding(signal, thresholds),
          this.buildClickConversionGapFinding(signal, thresholds),
          this.buildLowAttractivenessFinding(signal, thresholds),
          this.buildCopyReviewFinding(signal, thresholds),
        ]);
      })
      .filter((finding): finding is AgentFinding => finding !== null)
      .sort((left, right) => right.priority_score - left.priority_score)
      .slice(0, 8);

    return buildAgentOutput({
      agentName: this.agentName,
      agentVersion: input.agent_version,
      executionContext: input.execution_context,
      analysisWindow: input.analysis_window,
      status: findings.length > 0 ? 'ready' : 'skipped',
      priorityScore: findings[0]?.priority_score ?? 28,
      confidenceScore:
        findings.length > 0
          ? Math.max(...findings.map((finding) => finding.confidence_score))
          : 0.5,
      dataQuality: input.data_quality,
      summary:
        findings.length > 0
          ? 'Ha sinais de criativo com perda de atratividade, fadiga ou desalinhamento entre clique e conversao.'
          : 'Nao apareceu deterioracao criativa forte o suficiente para alerta nesta janela.',
      recommendedFocus:
        findings[0]?.recommended_action.description ??
        'Seguir monitorando campanhas com oscilacao de CTR e taxa de conversao.',
      candidateEntityIds: currentCampaigns.map((campaign) => campaign.campaignId),
      findings,
      entitiesEvaluated: currentCampaigns.length,
      findingsSuppressed: Math.max(currentCampaigns.length - findings.length, 0),
    });
  }

  private buildFatigueFinding(
    signal: CreativeSignal,
    thresholds: CreativeThresholds,
  ): AgentFinding | null {
    if (
      signal.ctrDeltaPct === null ||
      signal.cvrDeltaPct === null ||
      signal.cpaDeltaPct === null ||
      signal.ctrDeltaPct > thresholds.ctrDropPct ||
      (signal.cvrDeltaPct > thresholds.cvrDropPct &&
        signal.cpaDeltaPct < thresholds.cpaGrowthPct)
    ) {
      return null;
    }

    const current = signal.current;
    const priorityScore = clampNumber(
      60 + Math.abs(signal.ctrDeltaPct) * 0.4 + Math.max(signal.cpaDeltaPct, 0) * 0.35,
      0,
      95,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: current.campaignId,
      entityLabel: current.campaignName,
      category: 'creative',
      severity:
        signal.ctrDeltaPct <= thresholds.ctrDropPct * 1.35 &&
        signal.cpaDeltaPct >= thresholds.cpaGrowthPct * 1.15
          ? 'critical'
          : 'warning',
      priorityScore,
      confidenceScore: calculateCreativeConfidence(signal, true),
      riskLevel: 'medium',
      title: 'Sinal de fadiga criativa ou perda de atratividade',
      summary:
        'A campanha perdeu forca de clique e ficou menos eficiente para converter na comparacao com a janela anterior.',
      diagnosis:
        'A combinacao de queda de CTR com piora de CVR ou aumento de CPA sugere desgaste da mensagem criativa ou perda de relevancia da proposta atual.',
      primaryHypothesis:
        'Os anuncios dominantes perderam apelo frente ao publico atual ou estao com mensagem saturada.',
      alternativeHypotheses: [
        'Mudanca competitiva pode ter reduzido a atratividade relativa do anuncio.',
        'A mesma criacao pode estar atraindo buscas mais amplas e menos qualificadas.',
      ],
      recommendedAction: buildAction(
        'review_creative',
        'Renovar titulo, proposta principal e chamada de acao da campanha antes de aumentar investimento.',
        {
          actionTarget: `campaign:${current.campaignId}`,
        },
      ),
      expectedImpact:
        'Recuperar taxa de clique e reduzir a pressao de custo causada por criativos com sinal de saturacao.',
      technicalExplanation: `CTR ${formatSignedPercent(signal.ctrDeltaPct)} e CVR ${formatSignedPercent(signal.cvrDeltaPct)} na comparacao com a janela anterior, enquanto o CPA variou ${formatSignedPercent(signal.cpaDeltaPct)}.`,
      executiveExplanation:
        'Os anuncios dessa campanha parecem ter perdido forca. Atualizar a mensagem pode ajudar a voltar a atrair cliques mais qualificados.',
      evidence: [
        buildEvidence(
          'creative_fatigue_ctr_delta',
          'ctr',
          current.ctr,
          signal.baseline.ctr,
          signal.ctrDeltaPct,
          Math.abs(thresholds.ctrDropPct),
          current.campaignName,
          'A taxa de clique caiu acima do limite configurado para fadiga criativa.',
        ),
        buildEvidence(
          'creative_fatigue_cvr_delta',
          'conversion_rate',
          signal.currentCvr,
          signal.baselineCvr,
          signal.cvrDeltaPct,
          Math.abs(thresholds.cvrDropPct),
          current.campaignName,
          'A taxa de conversao piorou junto com a atratividade do clique.',
        ),
        buildEvidence(
          'creative_fatigue_cpa_delta',
          'cpa',
          current.cpa,
          signal.baseline.cpa,
          signal.cpaDeltaPct,
          thresholds.cpaGrowthPct,
          current.campaignName,
          'O custo para converter aumentou na mesma janela em que o criativo perdeu atratividade.',
        ),
      ],
      dataGaps: baseDataGaps(signal),
      tags: ['creative', 'fatigue', 'ctr_drop'],
    });
  }

  private buildClickConversionGapFinding(
    signal: CreativeSignal,
    thresholds: CreativeThresholds,
  ): AgentFinding | null {
    if (
      signal.current.clicks < thresholds.misalignmentMinClicks ||
      signal.ctrVsAccount === null ||
      signal.cvrVsAccount === null ||
      signal.cpaVsAccount === null ||
      signal.accountCurrentCvr === null ||
      signal.ctrVsAccount < thresholds.misalignmentCtrRatioVsAccount ||
      signal.cvrVsAccount > thresholds.misalignmentCvrRatioVsAccount ||
      signal.cpaVsAccount < thresholds.misalignmentCpaMultiplier
    ) {
      return null;
    }

    const current = signal.current;
    const priorityScore = clampNumber(
      56 +
        Math.max(signal.ctrVsAccount - thresholds.misalignmentCtrRatioVsAccount, 0) * 18 +
        Math.max(thresholds.misalignmentCvrRatioVsAccount - signal.cvrVsAccount, 0) * 38 +
        Math.max(signal.cpaVsAccount - thresholds.misalignmentCpaMultiplier, 0) * 18,
      0,
      92,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: current.campaignId,
      entityLabel: current.campaignName,
      category: 'creative',
      severity: signal.cvrVsAccount <= 0.5 ? 'critical' : 'warning',
      priorityScore,
      confidenceScore: calculateCreativeConfidence(signal, true),
      riskLevel: 'medium',
      title: 'CTR aceitavel, mas baixa conversao apos o clique',
      summary:
        'A campanha continua atraindo clique em nivel competitivo, mas a conversao nao acompanha esse interesse.',
      diagnosis:
        'Existe desalinhamento entre a promessa do anuncio e o que acontece depois do clique, o que sugere revisar copy, oferta ou mensagem de entrada.',
      primaryHypothesis:
        'O criativo desperta curiosidade, mas nao qualifica bem a intencao de conversao.',
      alternativeHypotheses: [
        'A landing page pode nao sustentar a promessa do anuncio.',
        'A campanha pode estar atraindo consultas informacionais demais para a oferta.',
      ],
      recommendedAction: buildAction(
        'review_creative',
        'Revisar a copy principal, alinhar promessa e oferta do anuncio e checar se o texto esta qualificando melhor o clique.',
        {
          actionTarget: `campaign:${current.campaignId}`,
        },
      ),
      expectedImpact:
        'Reduzir cliques de curiosidade e aumentar a proporcao de visitas com intencao real de converter.',
      technicalExplanation: `CTR da campanha em ${formatRatio(signal.ctrVsAccount)} da conta, mas CVR em apenas ${formatRatio(signal.cvrVsAccount)} do consolidado e CPA em ${formatRatio(signal.cpaVsAccount)} da media.`,
      executiveExplanation:
        'A campanha ainda chama atencao, mas os cliques nao estao virando resultado na mesma proporcao. A mensagem pode estar atraindo gente curiosa, nao necessariamente a mais pronta para converter.',
      evidence: [
        buildEvidence(
          'creative_gap_ctr_vs_account',
          'ctr',
          current.ctr,
          signal.accountCurrent.ctr,
          percentageDelta(current.ctr, signal.accountCurrent.ctr),
          thresholds.misalignmentCtrRatioVsAccount,
          current.campaignName,
          'A atratividade do clique continua em linha com a conta.',
        ),
        buildEvidence(
          'creative_gap_cvr_vs_account',
          'conversion_rate',
          signal.currentCvr,
          signal.accountCurrentCvr,
          percentageDelta(signal.currentCvr, signal.accountCurrentCvr),
          thresholds.misalignmentCvrRatioVsAccount,
          current.campaignName,
          'A taxa de conversao ficou abaixo do esperado para o volume de clique gerado.',
        ),
        buildEvidence(
          'creative_gap_cpa_vs_account',
          'cpa',
          current.cpa,
          signal.accountCurrent.cpa,
          percentageDelta(current.cpa, signal.accountCurrent.cpa),
          thresholds.misalignmentCpaMultiplier,
          current.campaignName,
          'O custo por aquisicao ficou acima da media da conta apesar de CTR competitivo.',
        ),
      ],
      dataGaps: baseDataGaps(signal),
      tags: ['creative', 'click_conversion_gap', 'copy_review'],
    });
  }

  private buildLowAttractivenessFinding(
    signal: CreativeSignal,
    thresholds: CreativeThresholds,
  ): AgentFinding | null {
    if (
      signal.current.ctr === null ||
      signal.accountCurrent.ctr === null ||
      signal.baseline.ctr === null ||
      signal.ctrVsAccount === null ||
      signal.current.impressions < thresholds.minImpressions ||
      signal.ctrVsAccount > thresholds.lowCtrRatioVsAccount ||
      signal.current.ctr > signal.baseline.ctr * thresholds.lowCtrRatioVsBaseline
    ) {
      return null;
    }

    const current = signal.current;
    const priorityScore = clampNumber(
      50 +
        Math.max(thresholds.lowCtrRatioVsAccount - signal.ctrVsAccount, 0) * 42 +
        Math.abs(signal.ctrDeltaPct ?? 0) * 0.25,
      0,
      88,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: current.campaignId,
      entityLabel: current.campaignName,
      category: 'creative',
      severity: signal.ctrVsAccount <= 0.6 ? 'warning' : 'info',
      priorityScore,
      confidenceScore: calculateCreativeConfidence(signal, false),
      riskLevel: 'low',
      title: 'Baixa atratividade criativa frente a conta',
      summary:
        'A campanha esta abaixo da media de clique da conta e do proprio historico recente.',
      diagnosis:
        'O criativo atual parece menos atrativo do que o restante da conta, o que limita a capacidade de capturar clique qualificado.',
      primaryHypothesis:
        'Titulo, promessa ou angulo criativo estao com baixa competitividade para o inventario atual.',
      alternativeHypotheses: [
        'A campanha pode estar em uma consulta mais concorrida e exigir uma proposta mais forte.',
      ],
      recommendedAction: buildAction(
        'review_creative',
        'Revisar angulo de copy, proposta de valor e teste de novos titulos para recuperar atratividade.',
        {
          actionTarget: `campaign:${current.campaignId}`,
        },
      ),
      expectedImpact:
        'Melhorar a taxa de clique e aumentar a eficiencia do investimento sem depender apenas de mais verba.',
      technicalExplanation: `CTR da campanha em ${formatRatio(signal.ctrVsAccount)} da conta e abaixo do baseline proprio, com volume suficiente de impressoes para leitura confiavel.`,
      executiveExplanation:
        'Essa campanha esta chamando menos atencao do que o restante da conta. Ajustar a mensagem pode ajudar a recuperar interesse e qualidade do trafego.',
      evidence: [
        buildEvidence(
          'creative_low_attr_ctr_vs_account',
          'ctr',
          current.ctr,
          signal.accountCurrent.ctr,
          percentageDelta(current.ctr, signal.accountCurrent.ctr),
          thresholds.lowCtrRatioVsAccount,
          current.campaignName,
          'A taxa de clique ficou abaixo do nivel esperado para a conta.',
        ),
        buildEvidence(
          'creative_low_attr_ctr_vs_baseline',
          'ctr',
          current.ctr,
          signal.baseline.ctr,
          signal.ctrDeltaPct,
          1 - thresholds.lowCtrRatioVsBaseline,
          current.campaignName,
          'A atratividade tambem caiu na comparacao com o proprio baseline da campanha.',
        ),
        buildEvidence(
          'creative_low_attr_impressions',
          'impressions',
          current.impressions,
          signal.baseline.impressions,
          percentageDelta(current.impressions, signal.baseline.impressions),
          thresholds.minImpressions,
          current.campaignName,
          'Ha exposicao suficiente para tratar o sinal como consistente.',
        ),
      ],
      dataGaps: baseDataGaps(signal),
      tags: ['creative', 'low_ctr', 'attractiveness'],
    });
  }

  private buildCopyReviewFinding(
    signal: CreativeSignal,
    thresholds: CreativeThresholds,
  ): AgentFinding | null {
    if (
      signal.ctrVsAccount === null ||
      signal.cvrDeltaPct === null ||
      signal.cvrVsAccount === null ||
      signal.cvrVsBaseline === null ||
      signal.current.spend < thresholds.refreshMinSpend ||
      signal.ctrVsAccount > thresholds.refreshCtrRatioVsAccount ||
      signal.cvrDeltaPct > percentageThresholdToDrop(thresholds.refreshCvrRatioVsBaseline) ||
      signal.cvrVsAccount > thresholds.misalignmentCvrRatioVsAccount ||
      signal.cvrVsBaseline > thresholds.refreshCvrRatioVsBaseline
    ) {
      return null;
    }

    const current = signal.current;
    const priorityScore = clampNumber(
      58 +
        Math.max(thresholds.refreshCtrRatioVsAccount - signal.ctrVsAccount, 0) * 26 +
        Math.max(thresholds.refreshCvrRatioVsBaseline - signal.cvrVsBaseline, 0) * 34 +
        current.spend * 0.03,
      0,
      93,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'campaign',
      entityId: current.campaignId,
      entityLabel: current.campaignName,
      category: 'creative',
      severity: 'warning',
      priorityScore,
      confidenceScore: calculateCreativeConfidence(signal, true),
      riskLevel: 'medium',
      title: 'Necessidade de revisao de copy ou criativo',
      summary:
        'A campanha perdeu atratividade e a conversao tambem enfraqueceu, indicando necessidade de revisar mensagem e proposta criativa.',
      diagnosis:
        'Quando CTR e conversao se deterioram ao mesmo tempo, o problema tende a estar na forca da mensagem, no enquadramento da oferta ou no criativo dominante da campanha.',
      primaryHypothesis:
        'A copy atual nao esta mais sustentando interesse nem qualificando bem a intencao de conversao.',
      alternativeHypotheses: [
        'A combinacao anuncio + landing pode estar desalinhada na promessa principal.',
      ],
      recommendedAction: buildAction(
        'review_creative',
        'Preparar nova rodada de copy e criativos com proposta mais clara, prova e chamada de acao mais aderentes a intencao de compra.',
        {
          actionTarget: `campaign:${current.campaignId}`,
        },
      ),
      expectedImpact:
        'Recuperar qualidade do clique e reduzir perda de eficiencia causada por mensagem enfraquecida.',
      technicalExplanation: `CTR em ${formatRatio(signal.ctrVsAccount)} da conta e CVR ${formatSignedPercent(signal.cvrDeltaPct)} vs baseline, com gasto de ${current.spend.toFixed(2)} sustentando a leitura.`,
      executiveExplanation:
        'A campanha esta atraindo menos e convertendo pior. Isso costuma ser um bom sinal de que a mensagem precisa ser atualizada para voltar a convencer o publico certo.',
      evidence: [
        buildEvidence(
          'creative_refresh_ctr_vs_account',
          'ctr',
          current.ctr,
          signal.accountCurrent.ctr,
          percentageDelta(current.ctr, signal.accountCurrent.ctr),
          thresholds.refreshCtrRatioVsAccount,
          current.campaignName,
          'A campanha esta com atratividade abaixo do nivel saudavel da conta.',
        ),
        buildEvidence(
          'creative_refresh_cvr_vs_baseline',
          'conversion_rate',
          signal.currentCvr,
          signal.baselineCvr,
          signal.cvrDeltaPct,
          Math.abs(percentageThresholdToDrop(thresholds.refreshCvrRatioVsBaseline)),
          current.campaignName,
          'A conversao caiu frente ao proprio baseline criativo.',
        ),
        buildEvidence(
          'creative_refresh_spend',
          'spend',
          current.spend,
          signal.baseline.spend,
          percentageDelta(current.spend, signal.baseline.spend),
          thresholds.refreshMinSpend,
          current.campaignName,
          'Existe investimento suficiente para priorizar a revisao criativa.',
        ),
      ],
      dataGaps: baseDataGaps(signal),
      tags: ['creative', 'copy_review', 'message_refresh'],
    });
  }
}

function readThresholds(thresholds: AgentInput['thresholds']): CreativeThresholds {
  return {
    minClicks: Number(thresholds.creative_min_clicks ?? 35),
    minImpressions: Number(thresholds.creative_min_impressions ?? 5000),
    minSpend: Number(thresholds.creative_min_spend_brl ?? 180),
    ctrDropPct: Number(thresholds.creative_ctr_drop_pct ?? -15),
    cvrDropPct: Number(thresholds.creative_cvr_drop_pct ?? -18),
    cpaGrowthPct: Number(thresholds.creative_cpa_growth_pct ?? 15),
    lowCtrRatioVsAccount: Number(thresholds.creative_low_ctr_ratio_vs_account ?? 0.75),
    lowCtrRatioVsBaseline: Number(thresholds.creative_low_ctr_ratio_vs_baseline ?? 0.82),
    misalignmentMinClicks: Number(thresholds.creative_misalignment_min_clicks ?? 45),
    misalignmentCtrRatioVsAccount: Number(
      thresholds.creative_misalignment_ctr_ratio_vs_account ?? 0.9,
    ),
    misalignmentCvrRatioVsAccount: Number(
      thresholds.creative_misalignment_cvr_ratio_vs_account ?? 0.6,
    ),
    misalignmentCpaMultiplier: Number(
      thresholds.creative_misalignment_cpa_multiplier ?? 1.15,
    ),
    refreshCtrRatioVsAccount: Number(
      thresholds.creative_refresh_ctr_ratio_vs_account ?? 0.82,
    ),
    refreshCvrRatioVsBaseline: Number(
      thresholds.creative_refresh_cvr_ratio_vs_baseline ?? 0.7,
    ),
    refreshMinSpend: Number(thresholds.creative_refresh_min_spend_brl ?? 250),
  };
}

function hasMinimumCreativeSample(
  campaign: CampaignPerformanceSnapshot,
  thresholds: CreativeThresholds,
): boolean {
  return (
    campaign.clicks >= thresholds.minClicks &&
    campaign.impressions >= thresholds.minImpressions &&
    campaign.spend >= thresholds.minSpend
  );
}

function buildSignal(input: {
  readonly current: CampaignPerformanceSnapshot;
  readonly baseline: CampaignPerformanceSnapshot;
  readonly accountCurrent: PerformanceMetricsSnapshot;
  readonly accountBaseline: PerformanceMetricsSnapshot | null;
}): CreativeSignal {
  const currentCvr = conversionRate(input.current);
  const baselineCvr = conversionRate(input.baseline);
  const accountCurrentCvr = conversionRate(input.accountCurrent);
  const accountBaselineCvr = conversionRate(input.accountBaseline);

  return {
    current: input.current,
    baseline: input.baseline,
    accountCurrent: input.accountCurrent,
    accountBaseline: input.accountBaseline,
    currentCvr,
    baselineCvr,
    accountCurrentCvr,
    accountBaselineCvr,
    ctrDeltaPct: percentageDelta(input.current.ctr, input.baseline.ctr),
    cvrDeltaPct: percentageDelta(currentCvr, baselineCvr),
    cpaDeltaPct: percentageDelta(input.current.cpa, input.baseline.cpa),
    ctrVsAccount: ratio(input.current.ctr, input.accountCurrent.ctr),
    cvrVsAccount: ratio(currentCvr, accountCurrentCvr),
    cpaVsAccount: ratio(input.current.cpa, input.accountCurrent.cpa),
    cvrVsBaseline: ratio(currentCvr, baselineCvr),
  };
}

function calculateCreativeConfidence(signal: CreativeSignal, baselineBoost: boolean): number {
  let score = calculateConfidenceScore(signal.current);

  if (baselineBoost) {
    score += 0.04;
  }

  if (signal.current.impressions >= 12000) {
    score += 0.04;
  }

  if (signal.current.clicks >= 90) {
    score += 0.03;
  }

  return clampNumber(score, 0.45, 0.97);
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

function baseDataGaps(signal: CreativeSignal): string[] {
  const gaps = new Set<string>(['creative_evaluated_at_campaign_level']);

  if (signal.accountBaseline === null) {
    gaps.add('account_baseline_missing');
  }

  if (signal.currentCvr === null || signal.baselineCvr === null) {
    gaps.add('conversion_rate_partial');
  }

  return Array.from(gaps);
}

function conversionRate(metrics: Pick<PerformanceMetricsSnapshot, 'clicks' | 'conversions'> | null): number | null {
  if (metrics === null || metrics.clicks === 0) {
    return null;
  }

  return roundNumber(metrics.conversions / metrics.clicks, 4);
}

function ratio(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline === 0) {
    return null;
  }

  return roundNumber(current / baseline, 4);
}

function dedupeFindings(
  findings: readonly (AgentFinding | null)[],
): AgentFinding[] {
  return Array.from(
    new Map(
      findings
        .filter((finding): finding is AgentFinding => finding !== null)
        .map((finding) => [finding.finding_key, finding] as const),
    ).values(),
  );
}

function percentageThresholdToDrop(ratioThreshold: number): number {
  return roundNumber((ratioThreshold - 1) * 100, 1);
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatRatio(value: number | null): string {
  if (value === null) {
    return 'n/d';
  }

  return `${value.toFixed(2)}x`;
}
