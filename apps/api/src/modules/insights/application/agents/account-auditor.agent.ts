import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentInput,
  PerformanceAgentEvidenceItem,
} from '@googleads/shared';

import type { PerformanceAnalysisAgent } from '../../domain/agents/performance-analysis-agent.interface';
import {
  readAccountWindowComparisons,
  readCampaignSnapshots,
  readMetricsSnapshot,
  readSyncHealth,
} from '../../domain/agents/performance-agent-feature-readers';
import type {
  AccountWindowComparison,
  PerformanceMetricsSnapshot,
  SyncHealthSnapshot,
} from '../../domain/agents/performance-agent.types';
import {
  buildAction,
  buildAgentOutput,
  buildFinding,
  calculateConfidenceScore,
  clampNumber,
  percentageDelta,
} from '../../domain/agents/performance-agent.utils';

type AccountWindowLabel = AccountWindowComparison['windowLabel'] | 'analysis_run';

interface AccountTrendSignal {
  readonly windowLabel: AccountWindowLabel;
  readonly sampleDays: number;
  readonly current: PerformanceMetricsSnapshot;
  readonly baseline: PerformanceMetricsSnapshot;
  readonly cpaDeltaPct: number | null;
  readonly roasDeltaPct: number | null;
  readonly conversionDeltaPct: number | null;
  readonly spendDeltaPct: number | null;
  readonly clickDeltaPct: number | null;
}

@Injectable()
export class AccountAuditorAgent implements PerformanceAnalysisAgent {
  public readonly agentName = 'account_auditor' as const;
  public readonly isRequired = true;

  private readonly logger = new Logger(AccountAuditorAgent.name);

  public async execute(input: AgentInput) {
    const current = readMetricsSnapshot(input.features.account_summary_current);
    const baseline = readMetricsSnapshot(input.features.account_summary_baseline);
    const syncHealth = readSyncHealth(input.features.sync_health);
    const windowComparisons = readAccountWindowComparisons(
      input.features.account_window_comparisons,
    );
    const candidateCampaignIds = readCampaignSnapshots(
      input.features.campaign_summaries_current,
    ).map((campaign) => campaign.campaignId);

    if (current === null || baseline === null) {
      this.logger.warn('Account Auditor without enough baseline data.');

      return buildAgentOutput({
        agentName: this.agentName,
        agentVersion: input.agent_version,
        executionContext: input.execution_context,
        analysisWindow: input.analysis_window,
        status: 'insufficient_data',
        priorityScore: 0,
        confidenceScore: 0.42,
        dataQuality: {
          ...input.data_quality,
          has_baseline: false,
        },
        summary:
          'Nao ha base suficiente para auditar a conta com seguranca nesta janela.',
        recommendedFocus:
          'Concluir mais historico local antes de fechar um diagnostico macro da conta.',
        candidateEntityIds: candidateCampaignIds,
        findings: [],
        entitiesEvaluated: 1,
        findingsSuppressed: 0,
      });
    }

    const thresholds = readThresholds(input.thresholds);
    const comparisonSignals = windowComparisons
      .map((comparison) => toTrendSignal(comparison))
      .filter((signal): signal is AccountTrendSignal => signal !== null);
    const analysisSignal = buildAnalysisRunSignal(input, current, baseline);
    const completeSignals = [...comparisonSignals, analysisSignal];
    const eligibleSignals = comparisonSignals.filter((signal) =>
      hasMinimumSample(signal, thresholds.minAccountClicks),
    );
    const dataGaps = collectDataGaps({
      comparisonSignals,
      expectedComparisonCount: 3,
      dataQualityWarnings: input.data_quality.warnings,
    });

    const findings = [
      this.buildEfficiencyDeteriorationFinding({
        current,
        baseline,
        signals: eligibleSignals,
        analysisSignal,
        syncHealth,
        thresholds,
        accountId:
          input.execution_context.account_id ?? input.execution_context.client_id,
        dataGaps,
      }),
      this.buildVolumePressureFinding({
        current,
        baseline,
        signals: eligibleSignals,
        analysisSignal,
        syncHealth,
        thresholds,
        accountId:
          input.execution_context.account_id ?? input.execution_context.client_id,
        dataGaps,
      }),
      this.buildScalingOpportunityFinding({
        current,
        baseline,
        signals: eligibleSignals,
        analysisSignal,
        syncHealth,
        thresholds,
        accountId:
          input.execution_context.account_id ?? input.execution_context.client_id,
        dataGaps,
      }),
      this.buildVolatilityFinding({
        current,
        baseline,
        signals: completeSignals,
        syncHealth,
        thresholds,
        accountId:
          input.execution_context.account_id ?? input.execution_context.client_id,
        dataGaps,
      }),
    ]
      .filter((finding): finding is NonNullable<typeof finding> => finding !== null)
      .sort((left, right) => right.priority_score - left.priority_score)
      .slice(0, 4);

    return buildAgentOutput({
      agentName: this.agentName,
      agentVersion: input.agent_version,
      executionContext: input.execution_context,
      analysisWindow: input.analysis_window,
      status: 'ready',
      priorityScore: findings[0]?.priority_score ?? 36,
      confidenceScore:
        findings.length > 0
          ? Math.max(...findings.map((finding) => finding.confidence_score))
          : calculateMacroConfidence(current, comparisonSignals.length, syncHealth),
      dataQuality: input.data_quality,
      summary: buildMacroSummary({
        findingsCount: findings.length,
        topFindingTitle: findings[0]?.title ?? null,
      }),
      recommendedFocus:
        findings[0]?.recommended_action.description ??
        'Manter monitoramento da conta e reavaliar os proximos ciclos locais.',
      candidateEntityIds: candidateCampaignIds,
      findings,
      entitiesEvaluated: comparisonSignals.length + 1,
      findingsSuppressed:
        findings.length === 0
          ? Math.max(comparisonSignals.length, 1)
          : Math.max(comparisonSignals.length + 1 - findings.length, 0),
    });
  }

  private buildEfficiencyDeteriorationFinding(input: {
    readonly current: PerformanceMetricsSnapshot;
    readonly baseline: PerformanceMetricsSnapshot;
    readonly signals: readonly AccountTrendSignal[];
    readonly analysisSignal: AccountTrendSignal;
    readonly syncHealth: SyncHealthSnapshot | null;
    readonly thresholds: ReturnType<typeof readThresholds>;
    readonly accountId: string;
    readonly dataGaps: readonly string[];
  }) {
    const deteriorationSignals = input.signals.filter(
      (signal) =>
        signal.current.conversions >= input.thresholds.minAccountConversions &&
        signal.cpaDeltaPct !== null &&
        signal.roasDeltaPct !== null &&
        signal.cpaDeltaPct >= input.thresholds.accountCpaWarningDeltaPct &&
        signal.roasDeltaPct <= input.thresholds.accountRoasWarningDeltaPct &&
        ((signal.conversionDeltaPct !== null &&
          signal.conversionDeltaPct <=
            input.thresholds.accountConversionDropPct) ||
          (signal.spendDeltaPct !== null &&
            signal.spendDeltaPct >= input.thresholds.accountSpendGrowthGuardPct)),
    );

    if (
      deteriorationSignals.length < input.thresholds.accountMinConsistentWindows
    ) {
      return null;
    }

    const avgCpaDelta = average(
      deteriorationSignals.map((signal) => signal.cpaDeltaPct ?? 0),
    );
    const avgRoasDelta = average(
      deteriorationSignals.map((signal) => Math.abs(signal.roasDeltaPct ?? 0)),
    );
    const avgConversionDelta = average(
      deteriorationSignals.map((signal) => signal.conversionDeltaPct ?? 0),
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'account',
      entityId: input.accountId,
      entityLabel: 'Conta consolidada',
      category: 'account_health',
      severity:
        deteriorationSignals.length >= 3 || avgCpaDelta >= 25
          ? 'critical'
          : 'warning',
      priorityScore: clampNumber(
        62 +
          avgCpaDelta * 0.5 +
          avgRoasDelta * 0.35 +
          Math.abs(Math.min(avgConversionDelta, 0)) * 0.2 +
          (deteriorationSignals.length - 1) * 5,
        0,
        98,
      ),
      confidenceScore: calculateMacroConfidence(
        input.current,
        deteriorationSignals.length,
        input.syncHealth,
      ),
      riskLevel: input.syncHealth?.overallStatus === 'stale' ? 'high' : 'medium',
      title: 'Macro da conta perdeu eficiencia em multiplas janelas',
      summary:
        'Os comparativos 7d, 14d e 30d mostram piora consistente de custo e retorno na visao consolidada da conta.',
      diagnosis:
        'A conta esta gastando mais para gerar resultado e essa deterioracao aparece de forma repetida em mais de uma janela, o que reduz a chance de ser ruido pontual.',
      primaryHypothesis:
        'Existe distribuicao de verba desequilibrada ou degradacao recente em campanhas relevantes puxando a media consolidada para baixo.',
      alternativeHypotheses: [
        'Mudanca de comportamento de demanda pode ter pressionado a eficiencia da conta.',
        'Parte da piora pode refletir delay de conversao em janelas muito recentes.',
      ],
      recommendedAction: buildAction(
        'investigate',
        'Revisar as campanhas de maior gasto, reduzir frentes menos eficientes e priorizar redistribuicao de verba antes de escalar a conta.',
        {
          actionTarget: 'account',
        },
      ),
      expectedImpact:
        'Conter desperdicio no curto prazo e recuperar a eficiencia media da conta.',
      technicalExplanation: `Sinais consistentes de piora em ${formatWindowList(deteriorationSignals)}. Baseline do periodo: CPA ${formatSignedPercent(input.analysisSignal.cpaDeltaPct)}, ROAS ${formatSignedPercent(input.analysisSignal.roasDeltaPct)} e conversoes ${formatSignedPercent(input.analysisSignal.conversionDeltaPct)}.`,
      executiveExplanation:
        'A conta segue entregando resultado, mas ficou menos eficiente em mais de uma leitura de tempo. O passo certo agora e revisar a distribuicao do investimento antes de ampliar verba.',
      evidence: [
        buildSignalEvidence(
          input.analysisSignal,
          'cpa',
          input.thresholds.accountCpaWarningDeltaPct,
          'O baseline principal da conta confirma piora de custo no periodo analisado.',
        ),
        ...deteriorationSignals.slice(0, 3).flatMap((signal) => [
          buildSignalEvidence(
            signal,
            'cpa',
            input.thresholds.accountCpaWarningDeltaPct,
            `A janela ${formatWindowLabel(signal.windowLabel)} confirma aumento de CPA na conta.`,
          ),
          buildSignalEvidence(
            signal,
            'roas',
            Math.abs(input.thresholds.accountRoasWarningDeltaPct),
            `A janela ${formatWindowLabel(signal.windowLabel)} tambem mostra queda de ROAS.`,
          ),
        ]),
      ].slice(0, 6),
      dataGaps: input.dataGaps,
      tags: [
        'macro',
        'account',
        'efficiency',
        ...deteriorationSignals.map((signal) => signal.windowLabel),
      ],
    });
  }

  private buildVolumePressureFinding(input: {
    readonly current: PerformanceMetricsSnapshot;
    readonly baseline: PerformanceMetricsSnapshot;
    readonly signals: readonly AccountTrendSignal[];
    readonly analysisSignal: AccountTrendSignal;
    readonly syncHealth: SyncHealthSnapshot | null;
    readonly thresholds: ReturnType<typeof readThresholds>;
    readonly accountId: string;
    readonly dataGaps: readonly string[];
  }) {
    const volumePressureSignals = input.signals.filter(
      (signal) =>
        signal.baseline.conversions >= input.thresholds.minAccountConversions &&
        signal.conversionDeltaPct !== null &&
        signal.conversionDeltaPct <= input.thresholds.accountVolumeDropPct &&
        signal.clickDeltaPct !== null &&
        signal.clickDeltaPct >= -8 &&
        signal.spendDeltaPct !== null &&
        signal.spendDeltaPct >= -5,
    );

    if (
      volumePressureSignals.length < input.thresholds.accountMinConsistentWindows
    ) {
      return null;
    }

    const avgConversionDelta = average(
      volumePressureSignals.map((signal) => signal.conversionDeltaPct ?? 0),
    );
    const avgClickDelta = average(
      volumePressureSignals.map((signal) => signal.clickDeltaPct ?? 0),
    );
    const avgSpendDelta = average(
      volumePressureSignals.map((signal) => signal.spendDeltaPct ?? 0),
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'account',
      entityId: input.accountId,
      entityLabel: 'Conta consolidada',
      category: 'account_health',
      severity: 'warning',
      priorityScore: clampNumber(
        56 +
          Math.abs(avgConversionDelta) * 0.45 +
          Math.max(avgSpendDelta, 0) * 0.15 +
          Math.max(avgClickDelta, 0) * 0.05,
        0,
        94,
      ),
      confidenceScore: calculateMacroConfidence(
        input.current,
        volumePressureSignals.length,
        input.syncHealth,
      ),
      riskLevel: 'medium',
      title: 'Conta perdeu volume sem alivio proporcional de entrada ou gasto',
      summary:
        'As conversoes cairam de forma relevante, mas clique e investimento nao recuaram no mesmo ritmo.',
      diagnosis:
        'O topo do funil da conta continua ativo, porem o volume final de resultado cedeu. Isso indica pressao no meio ou no fundo do funil, nao apenas falta de investimento.',
      primaryHypothesis:
        'A queda de resultado pode estar ligada a mudanca de qualidade do trafego, oferta menos aderente ou friccao maior na etapa final de conversao.',
      alternativeHypotheses: [
        'Parte da queda pode refletir atraso de atribuicao em uma janela recente.',
      ],
      recommendedAction: buildAction(
        'review_landing_page',
        'Revisar landing pages, tracking e campanhas de maior gasto para entender onde a conta perdeu capacidade de converter.',
        {
          actionTarget: 'account',
        },
      ),
      expectedImpact:
        'Recuperar volume de conversao e evitar continuar alimentando um funil menos eficiente.',
      technicalExplanation: `Conversoes ${formatSignedPercent(avgConversionDelta)} em media nas janelas com clique ${formatSignedPercent(avgClickDelta)} e gasto ${formatSignedPercent(avgSpendDelta)}.`,
      executiveExplanation:
        'A conta continua atraindo trafego e consumindo verba, mas esse trafego esta fechando menos resultado. Vale revisar a experiencia e os pontos de conversao.',
      evidence: [
        buildSignalEvidence(
          input.analysisSignal,
          'conversions',
          Math.abs(input.thresholds.accountVolumeDropPct),
          'O baseline principal ja mostra queda relevante de conversoes.',
        ),
        ...volumePressureSignals.slice(0, 3).map((signal) =>
          buildSignalEvidence(
            signal,
            'conversions',
            Math.abs(input.thresholds.accountVolumeDropPct),
            `A janela ${formatWindowLabel(signal.windowLabel)} confirma perda de volume final da conta.`,
          ),
        ),
      ],
      dataGaps: input.dataGaps,
      tags: ['macro', 'account', 'volume', 'conversion-drop'],
    });
  }

  private buildScalingOpportunityFinding(input: {
    readonly current: PerformanceMetricsSnapshot;
    readonly baseline: PerformanceMetricsSnapshot;
    readonly signals: readonly AccountTrendSignal[];
    readonly analysisSignal: AccountTrendSignal;
    readonly syncHealth: SyncHealthSnapshot | null;
    readonly thresholds: ReturnType<typeof readThresholds>;
    readonly accountId: string;
    readonly dataGaps: readonly string[];
  }) {
    const opportunitySignals = input.signals.filter(
      (signal) =>
        signal.current.conversions >= input.thresholds.minAccountConversions &&
        signal.current.cpa !== null &&
        signal.current.roas !== null &&
        signal.baseline.cpa !== null &&
        signal.baseline.roas !== null &&
        signal.current.cpa <=
          signal.baseline.cpa * input.thresholds.accountScaleCpaMultiplier &&
        signal.current.roas >=
          signal.baseline.roas * input.thresholds.accountScaleRoasMultiplier &&
        (signal.conversionDeltaPct ?? 0) >=
          input.thresholds.accountScaleConversionGrowthPct,
    );

    if (
      opportunitySignals.length < input.thresholds.accountMinConsistentWindows
    ) {
      return null;
    }

    const avgCpaDelta = average(
      opportunitySignals.map((signal) => Math.abs(signal.cpaDeltaPct ?? 0)),
    );
    const avgRoasDelta = average(
      opportunitySignals.map((signal) => signal.roasDeltaPct ?? 0),
    );
    const avgConversionDelta = average(
      opportunitySignals.map((signal) => signal.conversionDeltaPct ?? 0),
    );

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'account',
      entityId: input.accountId,
      entityLabel: 'Conta consolidada',
      category: 'budget_allocation',
      severity: 'info',
      priorityScore: clampNumber(
        48 +
          avgCpaDelta * 0.25 +
          avgRoasDelta * 0.3 +
          avgConversionDelta * 0.18 +
          (opportunitySignals.length - 1) * 4,
        0,
        90,
      ),
      confidenceScore: calculateMacroConfidence(
        input.current,
        opportunitySignals.length,
        input.syncHealth,
      ),
      riskLevel: 'low',
      title: 'Conta com espaco para escala controlada',
      summary:
        'As leituras recentes mostram melhora consistente de eficiencia e crescimento de resultado na visao consolidada da conta.',
      diagnosis:
        'A conta esta convertendo melhor do que a base anterior em mais de uma janela, o que sugere espaco para aumentar investimento de forma controlada.',
      primaryHypothesis:
        'A combinacao atual de campanhas, segmentacao e oferta esta mais aderente ao mercado recente.',
      alternativeHypotheses: [
        'A melhora pode estar concentrada em poucas campanhas e precisa de validacao antes de escalar forte.',
      ],
      recommendedAction: buildAction(
        'scale',
        'Aumentar investimento gradualmente e manter monitoramento diario de CPA e ROAS para sustentar a escala.',
        {
          actionTarget: 'account',
        },
      ),
      expectedImpact:
        'Capturar mais volume mantendo a conta concentrada em um momento de melhor eficiencia.',
      technicalExplanation: `Melhora sustentada em ${formatWindowList(opportunitySignals)} com CPA ${formatSignedPercent(input.analysisSignal.cpaDeltaPct)} vs baseline, ROAS ${formatSignedPercent(input.analysisSignal.roasDeltaPct)} e conversoes ${formatSignedPercent(input.analysisSignal.conversionDeltaPct)}.`,
      executiveExplanation:
        'A conta esta mais saudavel e eficiente do que na base anterior. Existe espaco para crescer com cautela e acompanhamento proximo.',
      evidence: [
        buildSignalEvidence(
          input.analysisSignal,
          'roas',
          input.thresholds.accountScaleRoasMultiplier,
          'O baseline principal confirma retorno melhor do que a conta tinha antes.',
        ),
        ...opportunitySignals.slice(0, 3).flatMap((signal) => [
          buildSignalEvidence(
            signal,
            'cpa',
            input.thresholds.accountScaleCpaMultiplier,
            `A janela ${formatWindowLabel(signal.windowLabel)} confirma melhora de custo na conta.`,
          ),
          buildSignalEvidence(
            signal,
            'conversions',
            input.thresholds.accountScaleConversionGrowthPct,
            `A janela ${formatWindowLabel(signal.windowLabel)} tambem mostra crescimento de conversoes.`,
          ),
        ]),
      ].slice(0, 6),
      dataGaps: input.dataGaps,
      tags: ['macro', 'account', 'scale', 'opportunity'],
    });
  }

  private buildVolatilityFinding(input: {
    readonly current: PerformanceMetricsSnapshot;
    readonly baseline: PerformanceMetricsSnapshot;
    readonly signals: readonly AccountTrendSignal[];
    readonly syncHealth: SyncHealthSnapshot | null;
    readonly thresholds: ReturnType<typeof readThresholds>;
    readonly accountId: string;
    readonly dataGaps: readonly string[];
  }) {
    const cpaValues = input.signals
      .map((signal) => signal.current.cpa)
      .filter((value): value is number => value !== null && value > 0);
    const roasValues = input.signals
      .map((signal) => signal.current.roas)
      .filter((value): value is number => value !== null && value > 0);

    if (cpaValues.length < 3 || roasValues.length < 3) {
      return null;
    }

    const cpaSpreadPct = spreadPct(cpaValues);
    const roasSpreadPct = spreadPct(roasValues);

    if (
      cpaSpreadPct < input.thresholds.accountVolatilityCpaSpreadPct &&
      roasSpreadPct < input.thresholds.accountVolatilityRoasSpreadPct
    ) {
      return null;
    }

    return buildFinding({
      sourceAgent: this.agentName,
      entityType: 'account',
      entityId: input.accountId,
      entityLabel: 'Conta consolidada',
      category: 'account_health',
      severity: cpaSpreadPct >= 30 || roasSpreadPct >= 28 ? 'warning' : 'info',
      priorityScore: clampNumber(
        44 + cpaSpreadPct * 0.45 + roasSpreadPct * 0.35,
        0,
        88,
      ),
      confidenceScore: calculateMacroConfidence(
        input.current,
        3,
        input.syncHealth,
      ),
      riskLevel: input.syncHealth?.overallStatus === 'stale' ? 'high' : 'medium',
      title: 'Conta com sinal de instabilidade entre janelas recentes',
      summary:
        'Os indicadores macro oscilam demais entre 7d, 14d e 30d, o que pede leitura cuidadosa antes de mudar verba de forma agressiva.',
      diagnosis:
        'A conta nao apresenta comportamento linear entre as janelas recentes. Isso sugere volatilidade operacional ou mudanca recente ainda nao estabilizada.',
      primaryHypothesis:
        'Existe concentracao de performance em poucos dias ou campanhas, o que deixa a leitura macro mais instavel.',
      alternativeHypotheses: [
        'Parte da oscilacao pode vir de sazonalidade curta ou delay de conversao.',
      ],
      recommendedAction: buildAction(
        'monitor',
        'Monitorar a conta por mais um ciclo curto, validar campanhas de maior peso e evitar mudancas bruscas de verba ate a leitura estabilizar.',
        {
          actionTarget: 'account',
        },
      ),
      expectedImpact:
        'Reduzir o risco de reagir a oscilacoes temporarias e tomar decisoes com base mais estavel.',
      technicalExplanation: `Spread atual entre janelas: CPA ${cpaSpreadPct.toFixed(1)}% e ROAS ${roasSpreadPct.toFixed(1)}%.`,
      executiveExplanation:
        'A conta esta oscilando bastante entre leituras curtas e longas. O melhor caminho agora e acompanhar mais de perto antes de fazer ajustes grandes.',
      evidence: [
        buildWindowMetricEvidence(
          'volatility_cpa_7d_30d',
          'cpa',
          findSignal(input.signals, 'last_7d')?.current.cpa ?? null,
          findSignal(input.signals, 'last_30d')?.current.cpa ?? null,
          percentageDelta(
            findSignal(input.signals, 'last_7d')?.current.cpa ?? null,
            findSignal(input.signals, 'last_30d')?.current.cpa ?? null,
          ),
          input.thresholds.accountVolatilityCpaSpreadPct,
          'Conta consolidada',
          'A diferenca de CPA entre as janelas curta e longa esta acima do nivel de conforto.',
        ),
        buildWindowMetricEvidence(
          'volatility_roas_7d_30d',
          'roas',
          findSignal(input.signals, 'last_7d')?.current.roas ?? null,
          findSignal(input.signals, 'last_30d')?.current.roas ?? null,
          percentageDelta(
            findSignal(input.signals, 'last_7d')?.current.roas ?? null,
            findSignal(input.signals, 'last_30d')?.current.roas ?? null,
          ),
          input.thresholds.accountVolatilityRoasSpreadPct,
          'Conta consolidada',
          'O retorno recente esta bem diferente da referencia mais longa da conta.',
        ),
      ],
      dataGaps: input.dataGaps,
      tags: ['macro', 'account', 'volatility', 'stability'],
    });
  }
}

function buildAnalysisRunSignal(
  input: AgentInput,
  current: PerformanceMetricsSnapshot,
  baseline: PerformanceMetricsSnapshot,
): AccountTrendSignal {
  return {
    windowLabel: 'analysis_run',
    sampleDays: calculateAnalysisWindowDays(input.analysis_window),
    current,
    baseline,
    cpaDeltaPct: percentageDelta(current.cpa, baseline.cpa),
    roasDeltaPct: percentageDelta(current.roas, baseline.roas),
    conversionDeltaPct: percentageDelta(current.conversions, baseline.conversions),
    spendDeltaPct: percentageDelta(current.spend, baseline.spend),
    clickDeltaPct: percentageDelta(current.clicks, baseline.clicks),
  };
}

function toTrendSignal(
  comparison: AccountWindowComparison,
): AccountTrendSignal | null {
  if (comparison.current === null || comparison.baseline === null) {
    return null;
  }

  return {
    windowLabel: comparison.windowLabel,
    sampleDays: comparison.sampleDays,
    current: comparison.current,
    baseline: comparison.baseline,
    cpaDeltaPct: percentageDelta(comparison.current.cpa, comparison.baseline.cpa),
    roasDeltaPct: percentageDelta(
      comparison.current.roas,
      comparison.baseline.roas,
    ),
    conversionDeltaPct: percentageDelta(
      comparison.current.conversions,
      comparison.baseline.conversions,
    ),
    spendDeltaPct: percentageDelta(
      comparison.current.spend,
      comparison.baseline.spend,
    ),
    clickDeltaPct: percentageDelta(
      comparison.current.clicks,
      comparison.baseline.clicks,
    ),
  };
}

function hasMinimumSample(
  signal: AccountTrendSignal,
  minAccountClicks: number,
): boolean {
  return signal.current.clicks >= minAccountClicks && signal.current.spend > 0;
}

function calculateMacroConfidence(
  current: PerformanceMetricsSnapshot,
  consistentWindowCount: number,
  syncHealth: SyncHealthSnapshot | null,
): number {
  let score = calculateConfidenceScore(current);

  if (consistentWindowCount >= 2) {
    score += 0.05;
  }

  if (consistentWindowCount >= 3) {
    score += 0.04;
  }

  if (syncHealth?.overallStatus === 'warning') {
    score -= 0.04;
  }

  if (syncHealth?.overallStatus === 'stale') {
    score -= 0.08;
  }

  return clampNumber(score, 0.35, 0.98);
}

function calculateAnalysisWindowDays(
  analysisWindow: AgentInput['analysis_window'],
): number {
  const start = new Date(`${analysisWindow.period_start}T00:00:00.000Z`);
  const end = new Date(`${analysisWindow.period_end}T00:00:00.000Z`);

  return (
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  );
}

function buildSignalEvidence(
  signal: AccountTrendSignal,
  metric: 'cpa' | 'roas' | 'conversions',
  thresholdValue: number,
  note: string,
): PerformanceAgentEvidenceItem {
  switch (metric) {
    case 'cpa':
      return buildWindowMetricEvidence(
        `account_${signal.windowLabel}_cpa`,
        'cpa',
        signal.current.cpa,
        signal.baseline.cpa,
        signal.cpaDeltaPct,
        thresholdValue,
        formatWindowLabel(signal.windowLabel),
        note,
      );
    case 'roas':
      return buildWindowMetricEvidence(
        `account_${signal.windowLabel}_roas`,
        'roas',
        signal.current.roas,
        signal.baseline.roas,
        signal.roasDeltaPct,
        thresholdValue,
        formatWindowLabel(signal.windowLabel),
        note,
      );
    case 'conversions':
      return buildWindowMetricEvidence(
        `account_${signal.windowLabel}_conversions`,
        'conversions',
        signal.current.conversions,
        signal.baseline.conversions,
        signal.conversionDeltaPct,
        thresholdValue,
        formatWindowLabel(signal.windowLabel),
        note,
      );
  }
}

function buildWindowMetricEvidence(
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
    source_table: 'fact_google_ads_account_daily',
    note,
  };
}

function readThresholds(
  thresholds: AgentInput['thresholds'],
): {
  readonly minAccountConversions: number;
  readonly minAccountClicks: number;
  readonly accountCpaWarningDeltaPct: number;
  readonly accountRoasWarningDeltaPct: number;
  readonly accountConversionDropPct: number;
  readonly accountSpendGrowthGuardPct: number;
  readonly accountVolumeDropPct: number;
  readonly accountScaleCpaMultiplier: number;
  readonly accountScaleRoasMultiplier: number;
  readonly accountScaleConversionGrowthPct: number;
  readonly accountMinConsistentWindows: number;
  readonly accountVolatilityCpaSpreadPct: number;
  readonly accountVolatilityRoasSpreadPct: number;
} {
  return {
    minAccountConversions: Number(thresholds.min_account_conversions ?? 12),
    minAccountClicks: Number(thresholds.min_account_clicks ?? 120),
    accountCpaWarningDeltaPct: Number(
      thresholds.account_cpa_warning_delta_pct ?? 15,
    ),
    accountRoasWarningDeltaPct: Number(
      thresholds.account_roas_warning_delta_pct ?? -10,
    ),
    accountConversionDropPct: Number(
      thresholds.account_conversion_drop_pct ?? -12,
    ),
    accountSpendGrowthGuardPct: Number(
      thresholds.account_spend_growth_guard_pct ?? 5,
    ),
    accountVolumeDropPct: Number(thresholds.account_volume_drop_pct ?? -20),
    accountScaleCpaMultiplier: Number(
      thresholds.account_scale_cpa_multiplier ?? 0.9,
    ),
    accountScaleRoasMultiplier: Number(
      thresholds.account_scale_roas_multiplier ?? 1.1,
    ),
    accountScaleConversionGrowthPct: Number(
      thresholds.account_scale_conversion_growth_pct ?? 8,
    ),
    accountMinConsistentWindows: Number(
      thresholds.account_min_consistent_windows ?? 2,
    ),
    accountVolatilityCpaSpreadPct: Number(
      thresholds.account_volatility_cpa_spread_pct ?? 20,
    ),
    accountVolatilityRoasSpreadPct: Number(
      thresholds.account_volatility_roas_spread_pct ?? 18,
    ),
  };
}

function collectDataGaps(input: {
  readonly comparisonSignals: readonly AccountTrendSignal[];
  readonly expectedComparisonCount: number;
  readonly dataQualityWarnings: readonly string[];
}): string[] {
  const gaps = new Set<string>(input.dataQualityWarnings);

  if (input.comparisonSignals.length < input.expectedComparisonCount) {
    gaps.add('account_window_comparisons_incomplete');
  }

  return Array.from(gaps);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function spreadPct(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);

  if (min === 0) {
    return 0;
  }

  return ((max - min) / min) * 100;
}

function findSignal(
  signals: readonly AccountTrendSignal[],
  windowLabel: AccountWindowLabel,
): AccountTrendSignal | undefined {
  return signals.find((signal) => signal.windowLabel === windowLabel);
}

function formatWindowList(signals: readonly AccountTrendSignal[]): string {
  return signals.map((signal) => formatWindowLabel(signal.windowLabel)).join(', ');
}

function formatWindowLabel(windowLabel: AccountWindowLabel): string {
  switch (windowLabel) {
    case 'last_7d':
      return '7d';
    case 'last_14d':
      return '14d';
    case 'last_30d':
      return '30d';
    case 'analysis_run':
      return 'baseline do periodo';
  }
}

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return 'n/d';
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function buildMacroSummary(input: {
  readonly findingsCount: number;
  readonly topFindingTitle: string | null;
}): string {
  if (input.findingsCount === 0) {
    return 'A visao macro da conta nao encontrou desvio forte o suficiente para acao imediata.';
  }

  if (input.topFindingTitle === null) {
    return `${input.findingsCount} sinal(is) macro foram identificados para a conta.`;
  }

  return `${input.findingsCount} sinal(is) macro identificados. Principal destaque: ${input.topFindingTitle}.`;
}
