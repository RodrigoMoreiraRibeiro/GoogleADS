import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentFinding,
  AgentInput,
  PerformanceAgentCategory,
  PerformanceAgentEvidenceItem,
} from '@googleads/shared';

import type { PerformanceAnalysisAgent } from '../../domain/agents/performance-analysis-agent.interface';
import {
  readMetricsSnapshot,
  readSegmentationSnapshots,
} from '../../domain/agents/performance-agent-feature-readers';
import type {
  PerformanceMetricsSnapshot,
  SegmentationPerformanceSnapshot,
} from '../../domain/agents/performance-agent.types';
import {
  buildAction,
  buildAgentOutput,
  buildFinding,
  calculateConfidenceScore,
  clampNumber,
  percentageDelta,
} from '../../domain/agents/performance-agent.utils';

type SupportedDimension = SegmentationPerformanceSnapshot['dimension'];

interface SegmentationThresholds {
  readonly spendFloor: number;
  readonly minClicks: number;
  readonly minConversions: number;
  readonly timeWasteCpaGapMultiplier: number;
  readonly timeWasteCvrRatio: number;
  readonly timeWinnerRoasMultiplier: number;
  readonly timeWinnerCpaMultiplier: number;
  readonly geoHighCpaMultiplier: number;
  readonly geoOpportunityRoasMultiplier: number;
  readonly geoOpportunityCpaMultiplier: number;
  readonly deviceLowCvrRatio: number;
  readonly deviceHighClicksMin: number;
  readonly deviceWinnerRoasMultiplier: number;
  readonly deviceWinnerCvrRatio: number;
  readonly trendCpaGrowthPct: number;
  readonly trendConversionDropPct: number;
}

interface SegmentationSignal {
  readonly row: SegmentationPerformanceSnapshot;
  readonly baseline: SegmentationPerformanceSnapshot | null;
  readonly spendSharePct: number;
  readonly cvr: number | null;
  readonly accountCvr: number | null;
  readonly cpaVsAccount: number | null;
  readonly roasVsAccount: number | null;
  readonly cvrVsAccount: number | null;
  readonly cpaDeltaPct: number | null;
  readonly roasDeltaPct: number | null;
  readonly conversionDeltaPct: number | null;
  accountCpa(): number | null;
  accountRoas(): number | null;
}

const EXPECTED_DIMENSIONS: readonly SupportedDimension[] = [
  'schedule',
  'day_of_week',
  'geo',
  'device',
];

@Injectable()
export class SegmentationSpecialistAgent implements PerformanceAnalysisAgent {
  public readonly agentName = 'segmentation_specialist' as const;
  public readonly isRequired = false;

  private readonly logger = new Logger(SegmentationSpecialistAgent.name);

  public async execute(input: AgentInput) {
    const currentRows = readSegmentationSnapshots(
      input.features.segmentation_rows_current,
    );
    const baselineRows = readSegmentationSnapshots(
      input.features.segmentation_rows_baseline,
    );
    const accountCurrent = readMetricsSnapshot(input.features.account_summary_current);

    if (currentRows.length === 0 || accountCurrent === null) {
      this.logger.warn('Segmentation Specialist without segmentation rows.');

      return buildAgentOutput({
        agentName: this.agentName,
        agentVersion: input.agent_version,
        executionContext: input.execution_context,
        analysisWindow: input.analysis_window,
        status: 'insufficient_data',
        priorityScore: 0,
        confidenceScore: 0.35,
        dataQuality: {
          ...input.data_quality,
          has_minimum_volume: false,
        },
        summary:
          'Nao ha granularidade suficiente de horario, dia da semana, regiao ou dispositivo nesta janela.',
        recommendedFocus:
          'Concluir sincronizacao detalhada local antes de concluir por segmentacao.',
        candidateEntityIds: [],
        findings: [],
        entitiesEvaluated: 0,
        findingsSuppressed: 0,
      });
    }

    const thresholds = readThresholds(input.thresholds);
    const baselineMap = new Map(
      baselineRows.map((row) => [buildSegmentationKey(row), row] as const),
    );
    const presentDimensions = new Set(currentRows.map((row) => row.dimension));
    const missingDimensionWarnings = EXPECTED_DIMENSIONS.filter(
      (dimension) => !presentDimensions.has(dimension),
    ).map((dimension) => `segmentation_${dimension}_unavailable`);

    const signals = currentRows
      .filter((row) =>
        hasMinimumSample(row, thresholds.spendFloor, thresholds.minClicks),
      )
      .map((row) =>
        buildSignal({
          row,
          baseline: baselineMap.get(buildSegmentationKey(row)) ?? null,
          accountCurrent,
        }),
      );

    const findings = dedupeFindings(
      signals.flatMap((signal) => this.buildFindingsForSignal(signal, thresholds)),
    )
      .sort((left, right) => right.priority_score - left.priority_score)
      .slice(0, 10);

    const dataQuality = {
      ...input.data_quality,
      warnings: Array.from(
        new Set([...input.data_quality.warnings, ...missingDimensionWarnings]),
      ),
    };

    return buildAgentOutput({
      agentName: this.agentName,
      agentVersion: input.agent_version,
      executionContext: input.execution_context,
      analysisWindow: input.analysis_window,
      status: findings.length > 0 ? 'ready' : 'skipped',
      priorityScore: findings[0]?.priority_score ?? 34,
      confidenceScore:
        findings.length > 0
          ? Math.max(...findings.map((finding) => finding.confidence_score))
          : 0.5,
      dataQuality,
      summary: buildSegmentationSummary(findings, missingDimensionWarnings),
      recommendedFocus:
        findings[0]?.recommended_action.description ??
        'Seguir monitorando os recortes de maior gasto enquanto mais historico local e consolidado.',
      candidateEntityIds: Array.from(
        new Set(currentRows.map((row) => row.campaignId)),
      ),
      findings,
      entitiesEvaluated: signals.length,
      findingsSuppressed: Math.max(signals.length - findings.length, 0),
    });
  }

  private buildFindingsForSignal(
    signal: SegmentationSignal,
    thresholds: SegmentationThresholds,
  ): AgentFinding[] {
    switch (signal.row.dimension) {
      case 'schedule':
      case 'day_of_week':
        return [
          this.buildTimeWasteFinding(signal, thresholds),
          this.buildTimeWinnerFinding(signal, thresholds),
        ].filter((finding): finding is AgentFinding => finding !== null);
      case 'geo':
        return [
          this.buildGeoCostFinding(signal, thresholds),
          this.buildGeoExpansionFinding(signal, thresholds),
        ].filter((finding): finding is AgentFinding => finding !== null);
      case 'device':
        return [
          this.buildDeviceFrictionFinding(signal, thresholds),
          this.buildDeviceWinnerFinding(signal, thresholds),
        ].filter((finding): finding is AgentFinding => finding !== null);
    }
  }

  private buildTimeWasteFinding(
    signal: SegmentationSignal,
    thresholds: SegmentationThresholds,
  ): AgentFinding | null {
    if (
      signal.row.cpa === null ||
      signal.cpaVsAccount === null ||
      signal.accountCvr === null ||
      signal.cvr === null
    ) {
      return null;
    }

    const lowConversion = signal.row.conversions < thresholds.minConversions;
    const poorEfficiency =
      signal.cpaVsAccount >= thresholds.timeWasteCpaGapMultiplier ||
      (signal.cvrVsAccount !== null &&
        signal.cvrVsAccount <= thresholds.timeWasteCvrRatio);
    const deterioratingTrend =
      signal.baseline === null ||
      (signal.cpaDeltaPct ?? 0) >= thresholds.trendCpaGrowthPct ||
      (signal.conversionDeltaPct ?? 0) <= thresholds.trendConversionDropPct;

    if (!lowConversion || !poorEfficiency || !deterioratingTrend) {
      return null;
    }

    const priorityScore = clampNumber(
      56 +
        signal.spendSharePct * 0.45 +
        Math.max((signal.cpaVsAccount - 1) * 18, 0) +
        Math.max((1 - (signal.cvrVsAccount ?? 1)) * 26, 0),
      0,
      96,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: signal.row.dimension,
      entityId: buildSegmentationEntityId(signal.row),
      entityLabel: buildEntityLabel(signal.row),
      category: mapDimensionToCategory(signal.row.dimension),
      severity:
        signal.cpaVsAccount >= thresholds.timeWasteCpaGapMultiplier * 1.1
          ? 'critical'
          : 'warning',
      priorityScore,
      confidenceScore: calculateSegmentationConfidence(signal, true),
      riskLevel: 'medium',
      title:
        signal.row.dimension === 'day_of_week'
          ? 'Dia da semana com desperdicio acima do esperado'
          : 'Faixa horaria com desperdicio acima do esperado',
      summary:
        'O recorte temporal esta consumindo verba com baixa conversao e eficiencia abaixo da media da conta.',
      diagnosis:
        'A leitura temporal mostra um bloco que segue recebendo investimento sem entregar resposta proporcional na etapa final de conversao.',
      primaryHypothesis:
        signal.row.dimension === 'day_of_week'
          ? 'Esse dia concentra menor aderencia de demanda ou menor qualidade de trafego do que o restante da semana.'
          : 'Esse horario concentra trafego menos qualificado ou menor intencao de conversao do que outras faixas.',
      alternativeHypotheses:
        signal.baseline === null
          ? ['Ainda nao existe baseline temporal completo para medir consistencia longa.']
          : ['Parte da piora pode refletir variacao curta de leilao ou atraso de atribuicao.'],
      recommendedAction: buildAction(
        'adjust_schedule',
        signal.row.dimension === 'day_of_week'
          ? `Reduzir presenca em ${signal.row.dimensionValue} e concentrar verba nos dias com melhor resposta.`
          : `Reduzir programacao em ${signal.row.dimensionValue} e concentrar verba nas faixas que convertem melhor.`,
        {
          actionTarget: `${signal.row.dimension}:${signal.row.dimensionValue}`,
        },
      ),
      expectedImpact:
        'Cortar desperdicio temporal e proteger verba para janelas de maior propensao a conversao.',
      technicalExplanation: `${humanizeDimension(signal.row.dimension)} com CPA em ${formatRatio(signal.cpaVsAccount)} da conta, CVR em ${formatRatio(signal.cvrVsAccount)} e ${signal.row.conversions.toFixed(1)} conversoes na janela.`,
      executiveExplanation:
        'Esse recorte de tempo esta gastando mais do que deveria para o retorno que traz. Vale reduzir presenca nele e priorizar os horarios ou dias mais fortes.',
      evidence: [
        buildEvidence({
          evidenceId: `${signal.row.dimension}_waste_cpa`,
          metric: 'cpa',
          currentValue: signal.row.cpa,
          baselineValue: signal.accountCpa(),
          deltaPct: percentageDelta(signal.row.cpa, signal.accountCpa()),
          thresholdValue: thresholds.timeWasteCpaGapMultiplier,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'O custo do recorte temporal esta acima da media da conta.',
          dimension: signal.row.dimension,
        }),
        buildEvidence({
          evidenceId: `${signal.row.dimension}_waste_cvr`,
          metric: 'conversion_rate',
          currentValue: signal.cvr,
          baselineValue: signal.accountCvr,
          deltaPct: percentageDelta(signal.cvr, signal.accountCvr),
          thresholdValue: thresholds.timeWasteCvrRatio,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'A taxa de conversao desse recorte temporal esta abaixo da referencia da conta.',
          dimension: signal.row.dimension,
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['segmentation', signal.row.dimension, 'waste', 'schedule'],
    });
  }

  private buildTimeWinnerFinding(
    signal: SegmentationSignal,
    thresholds: SegmentationThresholds,
  ): AgentFinding | null {
    if (
      signal.row.roas === null ||
      signal.row.cpa === null ||
      signal.roasVsAccount === null ||
      signal.cpaVsAccount === null
    ) {
      return null;
    }

    const goodVolume = signal.row.conversions >= thresholds.minConversions;
    const winner =
      signal.roasVsAccount >= thresholds.timeWinnerRoasMultiplier &&
      signal.cpaVsAccount <= thresholds.timeWinnerCpaMultiplier;

    if (!goodVolume || !winner) {
      return null;
    }

    const priorityScore = clampNumber(
      48 +
        signal.spendSharePct * 0.25 +
        Math.max(signal.roasVsAccount - 1, 0) * 28 +
        Math.max(1 - signal.cpaVsAccount, 0) * 24,
      0,
      88,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: signal.row.dimension,
      entityId: buildSegmentationEntityId(signal.row),
      entityLabel: buildEntityLabel(signal.row),
      category: mapDimensionToCategory(signal.row.dimension),
      severity: 'info',
      priorityScore,
      confidenceScore: calculateSegmentationConfidence(signal, true),
      riskLevel: 'low',
      title:
        signal.row.dimension === 'day_of_week'
          ? 'Dia da semana com desempenho acima da media'
          : 'Horario vencedor com desempenho acima da media',
      summary:
        'O recorte temporal entrega retorno melhor do que a media da conta e pode receber concentracao controlada de verba.',
      diagnosis:
        'Existe uma janela temporal clara de melhor resposta, com eficiencia acima da media e volume minimo validado.',
      primaryHypothesis:
        signal.row.dimension === 'day_of_week'
          ? 'Esse dia concentra demanda mais qualificada para a oferta atual.'
          : 'Esse horario concentra maior intencao e melhor aderencia para a oferta atual.',
      alternativeHypotheses:
        signal.baseline === null
          ? []
          : ['A vantagem pode diminuir se o aumento de verba for muito acelerado.'],
      recommendedAction: buildAction(
        'adjust_schedule',
        signal.row.dimension === 'day_of_week'
          ? `Concentrar mais verba em ${signal.row.dimensionValue} com monitoramento de CPA e volume.`
          : `Concentrar mais investimento em ${signal.row.dimensionValue}, mantendo acompanhamento proximo de CPA e ROAS.`,
        {
          actionTarget: `${signal.row.dimension}:${signal.row.dimensionValue}`,
        },
      ),
      expectedImpact:
        'Canalizar mais verba para janelas temporais que entregam resposta acima da media atual.',
      technicalExplanation: `${humanizeDimension(signal.row.dimension)} com ROAS em ${formatRatio(signal.roasVsAccount)} da conta e CPA em ${formatRatio(signal.cpaVsAccount)} da referencia consolidada.`,
      executiveExplanation:
        'Esse recorte de tempo esta respondendo melhor que a media. Vale concentrar mais investimento nele com crescimento controlado.',
      evidence: [
        buildEvidence({
          evidenceId: `${signal.row.dimension}_winner_roas`,
          metric: 'roas',
          currentValue: signal.row.roas,
          baselineValue: signal.accountRoas(),
          deltaPct: percentageDelta(signal.row.roas, signal.accountRoas()),
          thresholdValue: thresholds.timeWinnerRoasMultiplier,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'O retorno desse recorte temporal supera o consolidado da conta.',
          dimension: signal.row.dimension,
        }),
        buildEvidence({
          evidenceId: `${signal.row.dimension}_winner_cpa`,
          metric: 'cpa',
          currentValue: signal.row.cpa,
          baselineValue: signal.accountCpa(),
          deltaPct: percentageDelta(signal.row.cpa, signal.accountCpa()),
          thresholdValue: thresholds.timeWinnerCpaMultiplier,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'O custo desse recorte temporal esta melhor do que a referencia da conta.',
          dimension: signal.row.dimension,
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['segmentation', signal.row.dimension, 'winner', 'schedule'],
    });
  }

  private buildGeoCostFinding(
    signal: SegmentationSignal,
    thresholds: SegmentationThresholds,
  ): AgentFinding | null {
    if (
      signal.row.dimension !== 'geo' ||
      signal.row.cpa === null ||
      signal.cpaVsAccount === null
    ) {
      return null;
    }

    const enoughExposure =
      signal.row.spend >= thresholds.spendFloor && signal.row.clicks >= thresholds.minClicks;
    const highCpa = signal.cpaVsAccount >= thresholds.geoHighCpaMultiplier;

    if (!enoughExposure || !highCpa) {
      return null;
    }

    const priorityScore = clampNumber(
      60 +
        signal.spendSharePct * 0.55 +
        Math.max(signal.cpaVsAccount - 1, 0) * 22 +
        Math.abs(Math.min(signal.conversionDeltaPct ?? 0, 0)) * 0.18,
      0,
      97,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'geo',
      entityId: buildSegmentationEntityId(signal.row),
      entityLabel: buildEntityLabel(signal.row),
      category: 'geo',
      severity:
        signal.cpaVsAccount >= thresholds.geoHighCpaMultiplier * 1.15
          ? 'critical'
          : 'warning',
      priorityScore,
      confidenceScore: calculateSegmentationConfidence(signal, true),
      riskLevel: 'medium',
      title: 'Regiao com CPA muito acima da media',
      summary:
        'A regiao esta consumindo verba com custo bem acima da referencia da conta.',
      diagnosis:
        'O recorte geografico perdeu eficiencia e hoje exige mais investimento por resultado do que o padrao consolidado.',
      primaryHypothesis:
        'A oferta ou a intencao local dessa regiao esta menos aderente do que no restante da conta.',
      alternativeHypotheses:
        signal.baseline === null
          ? []
          : ['Parte da piora pode refletir competitividade local mais agressiva ou mudanca recente de mix.'],
      recommendedAction: buildAction(
        'adjust_geo',
        `Revisar a regiao ${signal.row.dimensionValue} e reduzir lance ou verba local se a ineficiencia persistir.`,
        {
          actionTarget: `geo:${signal.row.dimensionValue}`,
        },
      ),
      expectedImpact:
        'Conter desperdicio geografico e abrir espaco para regioes com retorno melhor.',
      technicalExplanation: `CPA da regiao em ${formatRatio(signal.cpaVsAccount)} do CPA da conta com share de gasto de ${signal.spendSharePct.toFixed(1)}%.`,
      executiveExplanation:
        'Essa regiao esta mais cara do que a media da conta. Vale revisar e reduzir exposicao se o custo continuar alto.',
      evidence: [
        buildEvidence({
          evidenceId: 'geo_cpa_vs_account',
          metric: 'cpa',
          currentValue: signal.row.cpa,
          baselineValue: signal.accountCpa(),
          deltaPct: percentageDelta(signal.row.cpa, signal.accountCpa()),
          thresholdValue: thresholds.geoHighCpaMultiplier,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'O CPA geografico esta acima da referencia consolidada.',
          dimension: signal.row.dimension,
        }),
        buildEvidence({
          evidenceId: 'geo_cpa_vs_baseline',
          metric: 'cpa',
          currentValue: signal.row.cpa,
          baselineValue: signal.baseline?.cpa ?? null,
          deltaPct: signal.cpaDeltaPct,
          thresholdValue: thresholds.trendCpaGrowthPct,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'A tendencia recente reforca a pressao de custo nessa regiao.',
          dimension: signal.row.dimension,
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['segmentation', 'geo', 'cpa', 'waste'],
    });
  }

  private buildGeoExpansionFinding(
    signal: SegmentationSignal,
    thresholds: SegmentationThresholds,
  ): AgentFinding | null {
    if (
      signal.row.dimension !== 'geo' ||
      signal.row.roas === null ||
      signal.row.cpa === null ||
      signal.roasVsAccount === null ||
      signal.cpaVsAccount === null
    ) {
      return null;
    }

    const winner =
      signal.row.conversions >= thresholds.minConversions &&
      signal.roasVsAccount >= thresholds.geoOpportunityRoasMultiplier &&
      signal.cpaVsAccount <= thresholds.geoOpportunityCpaMultiplier;

    if (!winner) {
      return null;
    }

    const priorityScore = clampNumber(
      52 +
        signal.spendSharePct * 0.2 +
        Math.max(signal.roasVsAccount - 1, 0) * 24 +
        Math.max(1 - signal.cpaVsAccount, 0) * 20,
      0,
      90,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'geo',
      entityId: buildSegmentationEntityId(signal.row),
      entityLabel: buildEntityLabel(signal.row),
      category: 'geo',
      severity: 'info',
      priorityScore,
      confidenceScore: calculateSegmentationConfidence(signal, true),
      riskLevel: 'low',
      title: 'Regiao com oportunidade de expansao',
      summary:
        'A regiao entrega retorno acima da media da conta e pode receber mais investimento de forma controlada.',
      diagnosis:
        'Esse recorte geografico responde melhor do que a media atual, com custo competitivo e volume minimo validado.',
      primaryHypothesis:
        'A oferta atual esta mais aderente nessa regiao do que no restante da cobertura.',
      alternativeHypotheses:
        signal.baseline === null
          ? []
          : ['O ganho pode diminuir se a escala for muito rapida sem monitoramento.'],
      recommendedAction: buildAction(
        'adjust_geo',
        `Avaliar redistribuicao de verba para ${signal.row.dimensionValue}, que esta acima da media atual.`,
        {
          actionTarget: `geo:${signal.row.dimensionValue}`,
        },
      ),
      expectedImpact:
        'Aumentar concentracao em regioes mais eficientes e capturar volume incremental com melhor retorno.',
      technicalExplanation: `ROAS da regiao em ${formatRatio(signal.roasVsAccount)} da conta e CPA em ${formatRatio(signal.cpaVsAccount)} do consolidado.`,
      executiveExplanation:
        'Essa regiao esta respondendo melhor que a media. Vale considerar mais verba nela com acompanhamento proximo.',
      evidence: [
        buildEvidence({
          evidenceId: 'geo_roas_vs_account',
          metric: 'roas',
          currentValue: signal.row.roas,
          baselineValue: signal.accountRoas(),
          deltaPct: percentageDelta(signal.row.roas, signal.accountRoas()),
          thresholdValue: thresholds.geoOpportunityRoasMultiplier,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'O retorno geografico supera o consolidado da conta.',
          dimension: signal.row.dimension,
        }),
        buildEvidence({
          evidenceId: 'geo_cpa_vs_account_winner',
          metric: 'cpa',
          currentValue: signal.row.cpa,
          baselineValue: signal.accountCpa(),
          deltaPct: percentageDelta(signal.row.cpa, signal.accountCpa()),
          thresholdValue: thresholds.geoOpportunityCpaMultiplier,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'O custo geografico esta abaixo da referencia da conta.',
          dimension: signal.row.dimension,
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['segmentation', 'geo', 'winner', 'expansion'],
    });
  }

  private buildDeviceFrictionFinding(
    signal: SegmentationSignal,
    thresholds: SegmentationThresholds,
  ): AgentFinding | null {
    if (
      signal.row.dimension !== 'device' ||
      signal.accountCvr === null ||
      signal.cvr === null
    ) {
      return null;
    }

    const clickHeavy = signal.row.clicks >= thresholds.deviceHighClicksMin;
    const lowConversion =
      signal.cvrVsAccount !== null &&
      signal.cvrVsAccount <= thresholds.deviceLowCvrRatio &&
      signal.row.conversions < thresholds.minConversions;

    if (!clickHeavy || !lowConversion) {
      return null;
    }

    const priorityScore = clampNumber(
      58 +
        Math.min(signal.row.clicks, 200) * 0.08 +
        Math.max(1 - (signal.cvrVsAccount ?? 1), 0) * 28,
      0,
      95,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'device',
      entityId: buildSegmentationEntityId(signal.row),
      entityLabel: buildEntityLabel(signal.row),
      category: 'device',
      severity: 'warning',
      priorityScore,
      confidenceScore: calculateSegmentationConfidence(signal, true),
      riskLevel: 'medium',
      title: 'Dispositivo com muito clique e baixa conversao',
      summary:
        'O dispositivo atrai volume, mas transforma pouco desse trafego em resultado final.',
      diagnosis:
        'Existe um descompasso entre entrada de clique e conversao final nesse dispositivo, o que sugere friccao operacional ou menor aderencia.',
      primaryHypothesis:
        'A experiencia do usuario nesse dispositivo pode estar pior do que nos demais, reduzindo a taxa de conversao.',
      alternativeHypotheses:
        signal.baseline === null
          ? []
          : ['Parte da queda pode refletir mudanca recente de mix de trafego dentro do dispositivo.'],
      recommendedAction: buildAction(
        'adjust_device',
        `Revisar a experiencia em ${signal.row.dimensionValue} e reduzir verba desse recorte se a baixa conversao persistir.`,
        {
          actionTarget: `device:${signal.row.dimensionValue}`,
        },
      ),
      expectedImpact:
        'Reduzir desperdicio de clique em dispositivo menos aderente e recuperar eficiencia da conta.',
      technicalExplanation: `CVR do dispositivo em ${formatRatio(signal.cvrVsAccount)} da conta com ${signal.row.clicks} cliques e apenas ${signal.row.conversions.toFixed(1)} conversoes.`,
      executiveExplanation:
        'Esse dispositivo traz trafego, mas converte mal. Vale revisar a experiencia nele e reduzir peso se a baixa resposta continuar.',
      evidence: [
        buildEvidence({
          evidenceId: 'device_cvr_vs_account',
          metric: 'conversion_rate',
          currentValue: signal.cvr,
          baselineValue: signal.accountCvr,
          deltaPct: percentageDelta(signal.cvr, signal.accountCvr),
          thresholdValue: thresholds.deviceLowCvrRatio,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'A taxa de conversao do dispositivo esta abaixo da referencia da conta.',
          dimension: signal.row.dimension,
        }),
        buildEvidence({
          evidenceId: 'device_click_volume',
          metric: 'clicks',
          currentValue: signal.row.clicks,
          baselineValue: null,
          deltaPct: null,
          thresholdValue: thresholds.deviceHighClicksMin,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'O recorte ja tem volume de clique suficiente para uma leitura confiavel.',
          dimension: signal.row.dimension,
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['segmentation', 'device', 'friction', 'conversion-rate'],
    });
  }

  private buildDeviceWinnerFinding(
    signal: SegmentationSignal,
    thresholds: SegmentationThresholds,
  ): AgentFinding | null {
    if (
      signal.row.dimension !== 'device' ||
      signal.row.roas === null ||
      signal.roasVsAccount === null ||
      signal.cvrVsAccount === null
    ) {
      return null;
    }

    const winner =
      signal.row.conversions >= thresholds.minConversions &&
      signal.roasVsAccount >= thresholds.deviceWinnerRoasMultiplier &&
      signal.cvrVsAccount >= thresholds.deviceWinnerCvrRatio;

    if (!winner) {
      return null;
    }

    const priorityScore = clampNumber(
      50 +
        signal.spendSharePct * 0.25 +
        Math.max(signal.roasVsAccount - 1, 0) * 24 +
        Math.max(signal.cvrVsAccount - 1, 0) * 22,
      0,
      88,
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'device',
      entityId: buildSegmentationEntityId(signal.row),
      entityLabel: buildEntityLabel(signal.row),
      category: 'device',
      severity: 'info',
      priorityScore,
      confidenceScore: calculateSegmentationConfidence(signal, true),
      riskLevel: 'low',
      title: 'Dispositivo com desempenho acima da media',
      summary:
        'O dispositivo responde melhor do que a media da conta e pode receber mais concentracao de verba.',
      diagnosis:
        'Existe vantagem operacional clara desse dispositivo, com eficiencia acima da media e volume minimo validado.',
      primaryHypothesis:
        'A experiencia e a intencao do usuario nesse dispositivo estao mais aderentes para a oferta atual.',
      alternativeHypotheses:
        signal.baseline === null
          ? []
          : ['A vantagem pode se reduzir se a redistribuicao for muito brusca.'],
      recommendedAction: buildAction(
        'adjust_device',
        `Concentrar mais verba no dispositivo ${signal.row.dimensionValue} com aumento gradual e monitoramento de CPA.`,
        {
          actionTarget: `device:${signal.row.dimensionValue}`,
        },
      ),
      expectedImpact:
        'Direcionar mais verba para o dispositivo com melhor capacidade de transformar clique em resultado.',
      technicalExplanation: `Dispositivo com ROAS em ${formatRatio(signal.roasVsAccount)} da conta e CVR em ${formatRatio(signal.cvrVsAccount)} da referencia atual.`,
      executiveExplanation:
        'Esse dispositivo esta performando melhor do que a media. Vale concentrar mais investimento nele com cuidado.',
      evidence: [
        buildEvidence({
          evidenceId: 'device_roas_vs_account',
          metric: 'roas',
          currentValue: signal.row.roas,
          baselineValue: signal.accountRoas(),
          deltaPct: percentageDelta(signal.row.roas, signal.accountRoas()),
          thresholdValue: thresholds.deviceWinnerRoasMultiplier,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'O retorno do dispositivo esta acima da media da conta.',
          dimension: signal.row.dimension,
        }),
        buildEvidence({
          evidenceId: 'device_cvr_vs_account_winner',
          metric: 'conversion_rate',
          currentValue: signal.cvr,
          baselineValue: signal.accountCvr,
          deltaPct: percentageDelta(signal.cvr, signal.accountCvr),
          thresholdValue: thresholds.deviceWinnerCvrRatio,
          scopeLabel: buildEntityLabel(signal.row),
          note: 'A taxa de conversao do dispositivo supera a referencia consolidada.',
          dimension: signal.row.dimension,
        }),
      ],
      dataGaps: collectDataGaps(signal),
      tags: ['segmentation', 'device', 'winner', 'expansion'],
    });
  }
}

function readThresholds(thresholds: AgentInput['thresholds']): SegmentationThresholds {
  return {
    spendFloor: Number(thresholds.segmentation_spend_floor_brl ?? 120),
    minClicks: Number(thresholds.segmentation_min_clicks ?? 25),
    minConversions: Number(thresholds.segmentation_min_conversions ?? 2),
    timeWasteCpaGapMultiplier: Number(
      thresholds.segmentation_time_waste_cpa_gap_multiplier ?? 1.35,
    ),
    timeWasteCvrRatio: Number(
      thresholds.segmentation_time_waste_cvr_ratio ?? 0.65,
    ),
    timeWinnerRoasMultiplier: Number(
      thresholds.segmentation_time_winner_roas_multiplier ?? 1.18,
    ),
    timeWinnerCpaMultiplier: Number(
      thresholds.segmentation_time_winner_cpa_multiplier ?? 0.85,
    ),
    geoHighCpaMultiplier: Number(
      thresholds.segmentation_geo_high_cpa_multiplier ?? 1.45,
    ),
    geoOpportunityRoasMultiplier: Number(
      thresholds.segmentation_geo_opportunity_roas_multiplier ?? 1.15,
    ),
    geoOpportunityCpaMultiplier: Number(
      thresholds.segmentation_geo_opportunity_cpa_multiplier ?? 0.9,
    ),
    deviceLowCvrRatio: Number(
      thresholds.segmentation_device_low_cvr_ratio ?? 0.55,
    ),
    deviceHighClicksMin: Number(
      thresholds.segmentation_device_high_clicks_min ?? 60,
    ),
    deviceWinnerRoasMultiplier: Number(
      thresholds.segmentation_device_winner_roas_multiplier ?? 1.12,
    ),
    deviceWinnerCvrRatio: Number(
      thresholds.segmentation_device_winner_cvr_ratio ?? 1.12,
    ),
    trendCpaGrowthPct: Number(
      thresholds.segmentation_trend_cpa_growth_pct ?? 15,
    ),
    trendConversionDropPct: Number(
      thresholds.segmentation_trend_conversion_drop_pct ?? -15,
    ),
  };
}

function hasMinimumSample(
  row: SegmentationPerformanceSnapshot,
  spendFloor: number,
  minClicks: number,
): boolean {
  return row.spend >= spendFloor && row.clicks >= minClicks;
}

function buildSignal(input: {
  readonly row: SegmentationPerformanceSnapshot;
  readonly baseline: SegmentationPerformanceSnapshot | null;
  readonly accountCurrent: PerformanceMetricsSnapshot;
}): SegmentationSignal {
  const accountCvr =
    input.accountCurrent.clicks > 0
      ? roundNumber(input.accountCurrent.conversions / input.accountCurrent.clicks, 4)
      : null;
  const rowCvr =
    input.row.clicks > 0
      ? roundNumber(input.row.conversions / input.row.clicks, 4)
      : null;

  return {
    row: input.row,
    baseline: input.baseline,
    spendSharePct:
      input.accountCurrent.spend > 0
        ? roundNumber((input.row.spend / input.accountCurrent.spend) * 100, 1)
        : 0,
    cvr: rowCvr,
    accountCvr,
    cpaVsAccount: ratio(input.row.cpa, input.accountCurrent.cpa),
    roasVsAccount: ratio(input.row.roas, input.accountCurrent.roas),
    cvrVsAccount: ratio(rowCvr, accountCvr),
    cpaDeltaPct: percentageDelta(input.row.cpa, input.baseline?.cpa ?? null),
    roasDeltaPct: percentageDelta(input.row.roas, input.baseline?.roas ?? null),
    conversionDeltaPct: percentageDelta(
      input.row.conversions,
      input.baseline?.conversions ?? null,
    ),
    accountCpa: () => input.accountCurrent.cpa,
    accountRoas: () => input.accountCurrent.roas,
  };
}

function calculateSegmentationConfidence(
  signal: SegmentationSignal,
  baselineBoost: boolean,
): number {
  let score = calculateConfidenceScore(signal.row);

  if (baselineBoost && signal.baseline !== null) {
    score += 0.04;
  }

  if (signal.spendSharePct >= 6) {
    score += 0.02;
  }

  if (signal.spendSharePct >= 12) {
    score += 0.03;
  }

  return clampNumber(score, 0.42, 0.98);
}

function mapDimensionToCategory(dimension: SupportedDimension): PerformanceAgentCategory {
  switch (dimension) {
    case 'device':
      return 'device';
    case 'geo':
      return 'geo';
    case 'schedule':
    case 'day_of_week':
      return 'schedule';
  }
}

function buildSegmentationKey(row: SegmentationPerformanceSnapshot): string {
  return `${row.dimension}:${row.campaignId}:${row.dimensionValue}`;
}

function buildSegmentationEntityId(row: SegmentationPerformanceSnapshot): string {
  return `${row.campaignId}:${row.dimension}:${row.dimensionValue}`;
}

function buildEntityLabel(row: SegmentationPerformanceSnapshot): string {
  return `${row.campaignName} - ${row.dimensionValue}`;
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
  readonly dimension: SupportedDimension;
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
    source_table: mapDimensionToSourceTable(input.dimension),
    note: input.note,
  };
}

function collectDataGaps(signal: SegmentationSignal): string[] {
  const gaps = new Set<string>();

  if (signal.baseline === null) {
    gaps.add('segmentation_baseline_missing');
  }

  if (signal.row.dimension === 'day_of_week') {
    gaps.add('day_of_week_support_depends_on_local_ingestion');
  }

  return Array.from(gaps);
}

function mapDimensionToSourceTable(dimension: SupportedDimension): string {
  switch (dimension) {
    case 'device':
      return 'fact_google_ads_campaign_device_daily';
    case 'geo':
      return 'fact_google_ads_campaign_geo_daily';
    case 'schedule':
      return 'fact_google_ads_campaign_hourly';
    case 'day_of_week':
      return 'fact_google_ads_campaign_day_of_week_daily';
  }
}

function buildSegmentationSummary(
  findings: readonly AgentFinding[],
  missingWarnings: readonly string[],
): string {
  if (findings.length === 0) {
    return missingWarnings.length > 0
      ? 'Nao houve anomalia forte por segmentacao nesta janela, mas ainda faltam alguns recortes locais para leitura completa.'
      : 'A leitura por horario, dia da semana, regiao e dispositivo nao encontrou desvio forte nesta janela.';
  }

  const counts = {
    schedule: findings.filter((finding) => finding.category === 'schedule').length,
    geo: findings.filter((finding) => finding.category === 'geo').length,
    device: findings.filter((finding) => finding.category === 'device').length,
  };

  return `${findings.length} insight(s) de segmentacao. Horario/semana: ${counts.schedule}, regiao: ${counts.geo}, dispositivo: ${counts.device}.`;
}

function dedupeFindings(findings: readonly AgentFinding[]): AgentFinding[] {
  return Array.from(
    new Map(findings.map((finding) => [finding.finding_key, finding] as const)).values(),
  );
}

function humanizeDimension(dimension: SupportedDimension): string {
  switch (dimension) {
    case 'device':
      return 'Dispositivo';
    case 'geo':
      return 'Regiao';
    case 'schedule':
      return 'Faixa horaria';
    case 'day_of_week':
      return 'Dia da semana';
  }
}

function ratio(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline === 0) {
    return null;
  }

  return roundNumber(current / baseline, 4);
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
