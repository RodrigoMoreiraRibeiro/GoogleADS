import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type {
  LocalWorkspacePeriod,
  OptimizationAgentView,
  OptimizationPriority,
  OptimizationRecommendation,
  OptimizationRiskLevel,
} from '@googleads/shared';

import { PrismaService } from '../../../common/database/prisma.service';

type NumericLike =
  | number
  | string
  | bigint
  | {
      toNumber(): number;
    }
  | null;

interface AccountWindowMetrics {
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly conversionValue: number;
  readonly ctr: number | null;
  readonly cpa: number | null;
  readonly roas: number | null;
}

interface CampaignWindowMetrics extends AccountWindowMetrics {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly status: string;
  readonly searchImpressionShare: number | null;
}

@Injectable()
export class LocalOptimizationAgentService {
  public constructor(private readonly prismaService: PrismaService) {}

  public async buildAgentView(input: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly clientName: string;
    readonly period: LocalWorkspacePeriod;
    readonly periodWindow: {
      readonly start: string;
      readonly end: string;
    };
    readonly previousWindow: {
      readonly start: string;
      readonly end: string;
    };
  }): Promise<OptimizationAgentView> {
    const [currentAccount, previousAccount, currentCampaigns, previousCampaigns] =
      await Promise.all([
        this.getAccountMetrics(input.tenantId, input.clientId, input.periodWindow),
        this.getAccountMetrics(input.tenantId, input.clientId, input.previousWindow),
        this.getCampaignMetrics(input.tenantId, input.clientId, input.periodWindow),
        this.getCampaignMetrics(input.tenantId, input.clientId, input.previousWindow),
      ]);

    if (
      currentAccount === null ||
      previousAccount === null ||
      currentCampaigns.length === 0
    ) {
      return {
        status: 'insufficient_data',
        generatedAt: new Date().toISOString(),
        summary:
          'O agente ainda nao tem dados suficientes no banco local para sugerir otimizacoes com seguranca.',
        recommendedFocus:
          'Mantenha a coleta e reavalie quando houver duas janelas comparaveis com volume consistente.',
        recommendations: [],
      };
    }

    const previousCampaignMap = new Map(
      previousCampaigns.map((campaign) => [campaign.campaignId, campaign]),
    );

    const recommendations = [
      this.buildAccountEfficiencyRecommendation(
        input,
        currentAccount,
        previousAccount,
      ),
      ...currentCampaigns.flatMap((campaign) =>
        this.buildCampaignRecommendations(
          input,
          campaign,
          previousCampaignMap.get(campaign.campaignId) ?? null,
          currentAccount,
          previousAccount,
        ),
      ),
    ]
      .filter(
        (
          recommendation,
        ): recommendation is OptimizationRecommendation => recommendation !== null,
      )
      .sort(compareRecommendations)
      .slice(0, 5);

    if (recommendations.length === 0) {
      return {
        status: 'ready',
        generatedAt: new Date().toISOString(),
        summary:
          'O agente nao encontrou desvios fortes o suficiente para recomendar mudancas imediatas nesta leitura.',
        recommendedFocus:
          'Manter monitoramento e revisar os proximos ciclos antes de mexer na distribuicao de verba.',
        recommendations: [],
      };
    }

    return {
      status: 'ready',
      generatedAt: new Date().toISOString(),
      summary: buildAgentSummary(input.clientName, recommendations),
      recommendedFocus: buildRecommendedFocus(recommendations[0]),
      recommendations,
    };
  }

  private async getAccountMetrics(
    tenantId: string,
    clientId: string,
    periodWindow: { readonly start: string; readonly end: string },
  ): Promise<AccountWindowMetrics | null> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        spend: NumericLike;
        impressions: bigint | null;
        clicks: bigint | null;
        conversions: NumericLike;
        conversionValue: NumericLike;
      }>
    >`
      SELECT
        SUM(spend) AS spend,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(conversions) AS conversions,
        SUM(conversions_value) AS conversionValue
      FROM agg_client_kpi_daily
      WHERE tenant_id = ${Number(tenantId)}
        AND client_id = ${Number(clientId)}
        AND report_date BETWEEN ${periodWindow.start} AND ${periodWindow.end}
    `;

    const row = rows[0];

    if (row === undefined || row.spend === null) {
      return null;
    }

    return buildWindowMetrics({
      spend: decimalToNumber(row.spend),
      impressions: bigintToNumber(row.impressions),
      clicks: bigintToNumber(row.clicks),
      conversions: decimalToNumber(row.conversions),
      conversionValue: decimalToNumber(row.conversionValue),
    });
  }

  private async getCampaignMetrics(
    tenantId: string,
    clientId: string,
    periodWindow: { readonly start: string; readonly end: string },
  ): Promise<CampaignWindowMetrics[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        campaignId: bigint;
        campaignName: string;
        status: string;
        spend: NumericLike;
        impressions: bigint | null;
        clicks: bigint | null;
        conversions: NumericLike;
        conversionValue: NumericLike;
        searchImpressionShare: NumericLike;
      }>
    >`
      SELECT
        d.google_campaign_id AS campaignId,
        d.name AS campaignName,
        d.status AS status,
        SUM(f.cost_micros) / 1000000 AS spend,
        SUM(f.impressions) AS impressions,
        SUM(f.clicks) AS clicks,
        SUM(f.conversions) AS conversions,
        SUM(f.conversions_value) AS conversionValue,
        AVG(f.search_impression_share) AS searchImpressionShare
      FROM fact_google_ads_campaign_daily f
      INNER JOIN dim_campaigns d
        ON d.tenant_id = f.tenant_id
       AND d.google_ads_account_id = f.google_ads_account_id
       AND d.google_campaign_id = f.google_campaign_id
      WHERE f.tenant_id = ${Number(tenantId)}
        AND f.client_id = ${Number(clientId)}
        AND f.report_date BETWEEN ${periodWindow.start} AND ${periodWindow.end}
      GROUP BY d.google_campaign_id, d.name, d.status
      ORDER BY SUM(f.cost_micros) DESC
      LIMIT 12
    `;

    return rows.map((row) => ({
      campaignId: String(Number(row.campaignId)),
      campaignName: row.campaignName,
      status: row.status,
      ...buildWindowMetrics({
        spend: decimalToNumber(row.spend),
        impressions: bigintToNumber(row.impressions),
        clicks: bigintToNumber(row.clicks),
        conversions: decimalToNumber(row.conversions),
        conversionValue: decimalToNumber(row.conversionValue),
      }),
      searchImpressionShare: decimalOrNull(row.searchImpressionShare),
    }));
  }

  private buildAccountEfficiencyRecommendation(
    input: {
      readonly tenantId: string;
      readonly clientId: string;
      readonly period: LocalWorkspacePeriod;
    },
    currentAccount: AccountWindowMetrics,
    previousAccount: AccountWindowMetrics,
  ): OptimizationRecommendation | null {
    if (
      currentAccount.cpa === null ||
      previousAccount.cpa === null ||
      currentAccount.roas === null ||
      previousAccount.roas === null ||
      previousAccount.conversions < 8
    ) {
      return null;
    }

    const cpaDeltaPct = percentageDelta(currentAccount.cpa, previousAccount.cpa);
    const roasDeltaPct = percentageDelta(currentAccount.roas, previousAccount.roas);
    const conversionDeltaPct = percentageDelta(
      currentAccount.conversions,
      previousAccount.conversions,
    );

    if (
      cpaDeltaPct === null ||
      roasDeltaPct === null ||
      conversionDeltaPct === null ||
      cpaDeltaPct < 18 ||
      roasDeltaPct > -12 ||
      conversionDeltaPct > -8
    ) {
      return null;
    }

    const confidenceScore = calculateConfidenceScore({
      clicks: currentAccount.clicks + previousAccount.clicks,
      conversions: currentAccount.conversions + previousAccount.conversions,
      spend: currentAccount.spend + previousAccount.spend,
    });
    const priorityScore = clampNumber(
      66 + cpaDeltaPct * 0.45 + Math.abs(roasDeltaPct) * 0.35,
      0,
      97,
    );

    return {
      recommendationId: buildRecommendationId(
        input.tenantId,
        input.clientId,
        'account_efficiency_drop',
        'account',
      ),
      ruleCode: 'account_efficiency_drop',
      entityType: 'account',
      entityId: input.clientId,
      entityLabel: 'Conta consolidada',
      priority: scoreToPriority(priorityScore),
      priorityScore: roundNumber(priorityScore, 0),
      confidenceScore,
      riskLevel: 'medium',
      title: 'A eficiencia da conta piorou na janela atual',
      summary:
        'O custo para gerar resultado subiu enquanto o retorno da conta cedeu frente a janela anterior.',
      diagnosis:
        'A leitura consolidada aponta perda de eficiencia. Isso sugere que a distribuicao atual de verba e criativos precisa de revisao antes de ampliar investimento.',
      recommendedAction:
        'Revisar campanhas com maior gasto, segurar expansao de verba no curto prazo e realocar budget para os conjuntos com melhor ROAS.',
      expectedImpact:
        'Conter desperdicio no curto prazo e recuperar retorno medio da conta nas proximas janelas.',
      technicalExplanation:
        `CPA ${formatSignedPercent(cpaDeltaPct)} vs janela anterior, ROAS ${formatSignedPercent(roasDeltaPct)} e conversoes ${formatSignedPercent(conversionDeltaPct)}.`,
      executiveExplanation:
        'Nesta leitura, a conta ficou mais cara para gerar resultado. Antes de investir mais, vale corrigir onde o dinheiro esta perdendo eficiencia.',
      evidence: [
        buildEvidence(
          'CPA consolidado',
          'cpa',
          currentAccount.cpa,
          previousAccount.cpa,
          cpaDeltaPct,
          'O custo por aquisicao subiu no recorte atual.',
        ),
        buildEvidence(
          'ROAS consolidado',
          'roas',
          currentAccount.roas,
          previousAccount.roas,
          roasDeltaPct,
          'O retorno por real investido caiu no mesmo intervalo.',
        ),
        buildEvidence(
          'Conversoes consolidadas',
          'conversions',
          currentAccount.conversions,
          previousAccount.conversions,
          conversionDeltaPct,
          'A conta nao compensou o gasto adicional com mais volume.',
        ),
      ],
    };
  }

  private buildCampaignRecommendations(
    input: {
      readonly tenantId: string;
      readonly clientId: string;
      readonly period: LocalWorkspacePeriod;
    },
    campaign: CampaignWindowMetrics,
    previousCampaign: CampaignWindowMetrics | null,
    currentAccount: AccountWindowMetrics,
    previousAccount: AccountWindowMetrics,
  ): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    const zeroConversionLoss = this.buildZeroConversionRecommendation(
      input,
      campaign,
    );

    if (zeroConversionLoss !== null) {
      recommendations.push(zeroConversionLoss);
    }

    const inefficientCampaign = this.buildInefficientCampaignRecommendation(
      input,
      campaign,
      currentAccount,
    );

    if (inefficientCampaign !== null) {
      recommendations.push(inefficientCampaign);
    }

    const scaleWinner = this.buildScaleWinnerRecommendation(
      input,
      campaign,
      previousCampaign,
      currentAccount,
    );

    if (scaleWinner !== null) {
      recommendations.push(scaleWinner);
    }

    const deterioratingCampaign = this.buildDeterioratingCampaignRecommendation(
      input,
      campaign,
      previousCampaign,
      currentAccount,
      previousAccount,
    );

    if (deterioratingCampaign !== null) {
      recommendations.push(deterioratingCampaign);
    }

    return recommendations;
  }

  private buildZeroConversionRecommendation(
    input: {
      readonly tenantId: string;
      readonly clientId: string;
    },
    campaign: CampaignWindowMetrics,
  ): OptimizationRecommendation | null {
    if (campaign.conversions > 0 || campaign.clicks < 35 || campaign.spend < 180) {
      return null;
    }

    const confidenceScore = calculateConfidenceScore(campaign);
    const priorityScore = clampNumber(
      74 + campaign.clicks * 0.18 + campaign.spend * 0.02,
      0,
      99,
    );

    return {
      recommendationId: buildRecommendationId(
        input.tenantId,
        input.clientId,
        'campaign_zero_conversion_bleed',
        campaign.campaignId,
      ),
      ruleCode: 'campaign_zero_conversion_bleed',
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      priority: scoreToPriority(priorityScore),
      priorityScore: roundNumber(priorityScore, 0),
      confidenceScore,
      riskLevel: 'medium',
      title: 'Campanha consome verba sem gerar conversao',
      summary:
        'A campanha acumulou cliques e gasto suficientes para teste, mas ainda nao entregou conversoes no periodo.',
      diagnosis:
        'O volume atual sugere desperdicio. O problema pode estar na aderencia da palavra-chave, no criativo, na oferta ou na pagina de destino.',
      recommendedAction:
        'Reduzir fortemente a verba ou pausar a campanha ate revisar termos, correspondencias, anuncio e experiencia da landing page.',
      expectedImpact:
        'Interromper gasto improdutivo e liberar verba para conjuntos com sinal real de resultado.',
      technicalExplanation: `${campaign.clicks} cliques, ${formatCurrency(campaign.spend)} investidos e 0 conversoes na janela atual.`,
      executiveExplanation:
        'Essa campanha esta consumindo parte do investimento sem trazer resultado concreto. Vale frear agora e revisar antes de continuar.',
      evidence: [
        buildEvidence(
          'Investimento da campanha',
          'spend',
          campaign.spend,
          null,
          null,
          'Ja existe gasto suficiente para validar a primeira leitura.',
        ),
        buildEvidence(
          'Cliques acumulados',
          'clicks',
          campaign.clicks,
          null,
          null,
          'A campanha recebeu trafego relevante e ainda nao converteu.',
        ),
        buildEvidence(
          'Conversoes',
          'conversions',
          campaign.conversions,
          null,
          null,
          'O periodo atual ainda nao mostrou resposta do usuario final.',
        ),
      ],
    };
  }

  private buildInefficientCampaignRecommendation(
    input: {
      readonly tenantId: string;
      readonly clientId: string;
    },
    campaign: CampaignWindowMetrics,
    currentAccount: AccountWindowMetrics,
  ): OptimizationRecommendation | null {
    if (
      campaign.conversions < 3 ||
      campaign.cpa === null ||
      currentAccount.cpa === null ||
      campaign.roas === null ||
      currentAccount.roas === null
    ) {
      return null;
    }

    const accountSpendFloor = Math.max(180, currentAccount.spend * 0.08);

    if (
      campaign.spend < accountSpendFloor ||
      campaign.cpa < currentAccount.cpa * 1.25 ||
      campaign.roas > currentAccount.roas * 0.78
    ) {
      return null;
    }

    const cpaDeltaPct = percentageDelta(campaign.cpa, currentAccount.cpa);
    const roasDeltaPct = percentageDelta(campaign.roas, currentAccount.roas);
    const confidenceScore = calculateConfidenceScore(campaign);
    const priorityScore = clampNumber(
      62 +
        (cpaDeltaPct ?? 0) * 0.35 +
        Math.abs(roasDeltaPct ?? 0) * 0.28 +
        campaign.spend * 0.015,
      0,
      96,
    );

    return {
      recommendationId: buildRecommendationId(
        input.tenantId,
        input.clientId,
        'campaign_cost_efficiency_gap',
        campaign.campaignId,
      ),
      ruleCode: 'campaign_cost_efficiency_gap',
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      priority: scoreToPriority(priorityScore),
      priorityScore: roundNumber(priorityScore, 0),
      confidenceScore,
      riskLevel: 'medium',
      title: 'Campanha acima do custo medio da conta',
      summary:
        'A campanha continua investindo com volume relevante, mas ficou claramente menos eficiente do que a media atual da conta.',
      diagnosis:
        'Existe um gap de eficiencia suficiente para justificar corte seletivo de verba e revisao de segmentacao, anuncio e busca que esta entrando.',
      recommendedAction:
        'Reduzir 10% a 20% da verba desta campanha no curto prazo e revisar termos, correspondencias, anuncios e landing page antes de reexpandir.',
      expectedImpact:
        'Proteger o budget da conta e redistribuir investimento para campanhas mais saudaveis.',
      technicalExplanation:
        `CPA ${formatCurrency(campaign.cpa)} vs ${formatCurrency(currentAccount.cpa)} da conta, com ROAS ${campaign.roas.toFixed(2)}x vs ${currentAccount.roas.toFixed(2)}x.`,
      executiveExplanation:
        'Essa frente esta mais cara do que o restante da conta para gerar resultado. Vamos aliviar o investimento nela e corrigir a origem da perda.',
      evidence: [
        buildEvidence(
          'CPA da campanha',
          'cpa',
          campaign.cpa,
          currentAccount.cpa,
          cpaDeltaPct,
          'O custo por aquisicao ja abriu distancia relevante da media da conta.',
        ),
        buildEvidence(
          'ROAS da campanha',
          'roas',
          campaign.roas,
          currentAccount.roas,
          roasDeltaPct,
          'O retorno nao acompanha o nivel de gasto atual.',
        ),
        buildEvidence(
          'Investimento atual',
          'spend',
          campaign.spend,
          currentAccount.spend,
          shareDeltaPct(campaign.spend, currentAccount.spend),
          'A campanha recebe verba suficiente para merecer correcoes prioritarias.',
        ),
      ],
    };
  }

  private buildScaleWinnerRecommendation(
    input: {
      readonly tenantId: string;
      readonly clientId: string;
    },
    campaign: CampaignWindowMetrics,
    previousCampaign: CampaignWindowMetrics | null,
    currentAccount: AccountWindowMetrics,
  ): OptimizationRecommendation | null {
    if (
      campaign.conversions < 6 ||
      campaign.cpa === null ||
      currentAccount.cpa === null ||
      campaign.roas === null ||
      currentAccount.roas === null ||
      campaign.searchImpressionShare === null
    ) {
      return null;
    }

    const isImprovingVsAccount =
      campaign.cpa <= currentAccount.cpa * 0.92 &&
      campaign.roas >= currentAccount.roas * 1.03;
    const hasRoomToGrow = campaign.searchImpressionShare <= 0.72;
    const isStableOrGrowing =
      previousCampaign === null ||
      previousCampaign.conversions < 4 ||
      campaign.conversions >= previousCampaign.conversions * 0.92;

    if (!isImprovingVsAccount || !hasRoomToGrow || !isStableOrGrowing) {
      return null;
    }

    const cpaDeltaPct = percentageDelta(campaign.cpa, currentAccount.cpa);
    const roasDeltaPct = percentageDelta(campaign.roas, currentAccount.roas);
    const confidenceScore = calculateConfidenceScore(campaign);
    const priorityScore = clampNumber(
      60 +
        Math.abs(cpaDeltaPct ?? 0) * 0.24 +
        Math.abs(roasDeltaPct ?? 0) * 0.32 +
        (1 - campaign.searchImpressionShare) * 28,
      0,
      94,
    );

    return {
      recommendationId: buildRecommendationId(
        input.tenantId,
        input.clientId,
        'campaign_scale_winner',
        campaign.campaignId,
      ),
      ruleCode: 'campaign_scale_winner',
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      priority: scoreToPriority(priorityScore),
      priorityScore: roundNumber(priorityScore, 0),
      confidenceScore,
      riskLevel: 'low',
      title: 'Campanha vencedora com espaco para ganhar mais volume',
      summary:
        'A campanha entrega melhor eficiencia do que a media da conta e ainda nao captura todo o potencial de impressao.',
      diagnosis:
        'O conjunto mostra sinal de vencedor. Existe margem para crescer com cautela antes de mexer em campanhas menos estaveis.',
      recommendedAction:
        'Testar aumento controlado de 10% a 15% no orçamento ou lance, monitorando CPA e share de impressao por alguns ciclos.',
      expectedImpact:
        'Ganhar mais volume em uma campanha ja eficiente, preservando o retorno medio da conta.',
      technicalExplanation:
        `CPA ${formatCurrency(campaign.cpa)} vs ${formatCurrency(currentAccount.cpa)} da conta, ROAS ${campaign.roas.toFixed(2)}x e share de impressao em ${(campaign.searchImpressionShare * 100).toFixed(0)}%.`,
      executiveExplanation:
        'Aqui temos uma frente que ja performa bem e ainda pode aparecer mais. Vale direcionar parte do investimento para aumentar esse ganho.',
      evidence: [
        buildEvidence(
          'CPA da campanha',
          'cpa',
          campaign.cpa,
          currentAccount.cpa,
          cpaDeltaPct,
          'A campanha gera resultado por um custo abaixo da media da conta.',
        ),
        buildEvidence(
          'ROAS da campanha',
          'roas',
          campaign.roas,
          currentAccount.roas,
          roasDeltaPct,
          'O retorno por real investido supera o consolidado atual.',
        ),
        buildEvidence(
          'Share de impressao',
          'search_impression_share',
          campaign.searchImpressionShare,
          0.72,
          percentageDelta(campaign.searchImpressionShare, 0.72),
          'Ainda existe espaco de exposicao para capturar mais demanda.',
        ),
      ],
    };
  }

  private buildDeterioratingCampaignRecommendation(
    input: {
      readonly tenantId: string;
      readonly clientId: string;
    },
    campaign: CampaignWindowMetrics,
    previousCampaign: CampaignWindowMetrics | null,
    currentAccount: AccountWindowMetrics,
    previousAccount: AccountWindowMetrics,
  ): OptimizationRecommendation | null {
    if (
      previousCampaign === null ||
      previousCampaign.conversions < 3 ||
      campaign.cpa === null ||
      previousCampaign.cpa === null ||
      currentAccount.cpa === null ||
      previousAccount.cpa === null
    ) {
      return null;
    }

    const cpaDeltaPct = percentageDelta(campaign.cpa, previousCampaign.cpa);
    const ctrDeltaPct =
      campaign.ctr === null || previousCampaign.ctr === null
        ? null
        : percentageDelta(campaign.ctr, previousCampaign.ctr);

    if (
      cpaDeltaPct === null ||
      cpaDeltaPct < 22 ||
      ctrDeltaPct === null ||
      ctrDeltaPct > -10
    ) {
      return null;
    }

    const accountCpaTrend = percentageDelta(currentAccount.cpa, previousAccount.cpa);
    const confidenceScore = calculateConfidenceScore({
      clicks: campaign.clicks + previousCampaign.clicks,
      conversions: campaign.conversions + previousCampaign.conversions,
      spend: campaign.spend + previousCampaign.spend,
    });
    const priorityScore = clampNumber(
      58 +
        cpaDeltaPct * 0.32 +
        Math.abs(ctrDeltaPct) * 0.22 +
        Math.max(accountCpaTrend ?? 0, 0) * 0.18,
      0,
      95,
    );

    return {
      recommendationId: buildRecommendationId(
        input.tenantId,
        input.clientId,
        'campaign_deteriorating_signal',
        campaign.campaignId,
      ),
      ruleCode: 'campaign_deteriorating_signal',
      entityType: 'campaign',
      entityId: campaign.campaignId,
      entityLabel: campaign.campaignName,
      priority: scoreToPriority(priorityScore),
      priorityScore: roundNumber(priorityScore, 0),
      confidenceScore,
      riskLevel: 'medium',
      title: 'Campanha perdeu aderencia na comparacao com a janela anterior',
      summary:
        'A taxa de resposta caiu e o custo para converter subiu na comparacao direta com a janela anterior.',
      diagnosis:
        'O problema parece mais ligado a mensagem, segmentacao ou saturacao da busca do que apenas a variacao natural da conta.',
      recommendedAction:
        'Revisar termos e anuncios desta campanha, testar novas mensagens e reduzir ritmo de verba enquanto o CPA continua acima do nivel anterior.',
      expectedImpact:
        'Interromper a deterioracao da campanha antes que ela contamine mais fortemente o resultado total.',
      technicalExplanation:
        `CPA ${formatSignedPercent(cpaDeltaPct)} vs janela anterior da campanha e CTR ${formatSignedPercent(ctrDeltaPct)} no mesmo recorte.`,
      executiveExplanation:
        'Essa campanha piorou na comparacao com ela mesma. O sinal indica desgaste de mensagem ou publico, e vale corrigir antes de seguir acelerando.',
      evidence: [
        buildEvidence(
          'CPA da campanha',
          'cpa',
          campaign.cpa,
          previousCampaign.cpa,
          cpaDeltaPct,
          'O custo por conversao abriu distancia relevante da propria base anterior.',
        ),
        buildEvidence(
          'CTR da campanha',
          'ctr',
          campaign.ctr,
          previousCampaign.ctr,
          ctrDeltaPct,
          'Menos cliques por impressao sugerem perda de aderencia no anuncio ou na busca.',
        ),
        buildEvidence(
          'CPA da conta',
          'account_cpa',
          currentAccount.cpa,
          previousAccount.cpa,
          accountCpaTrend,
          'A conta tambem piorou, reforcando que a campanha deve ser tratada cedo.',
        ),
      ],
    };
  }
}

function buildWindowMetrics(input: {
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly conversionValue: number;
}): AccountWindowMetrics {
  const ctr =
    input.impressions > 0 ? roundNumber(input.clicks / input.impressions, 4) : null;
  const cpa =
    input.conversions > 0 ? roundNumber(input.spend / input.conversions, 2) : null;
  const roas =
    input.spend > 0
      ? roundNumber(input.conversionValue / input.spend, 2)
      : null;

  return {
    ...input,
    ctr,
    cpa,
    roas,
  };
}

function buildEvidence(
  label: string,
  metric: string,
  currentValue: number | null,
  baselineValue: number | null,
  deltaPct: number | null,
  note: string,
) {
  return {
    label,
    metric,
    currentValue: currentValue === null ? null : roundNumber(currentValue, 4),
    baselineValue: baselineValue === null ? null : roundNumber(baselineValue, 4),
    deltaPct: deltaPct === null ? null : roundNumber(deltaPct, 1),
    note,
  };
}

function buildAgentSummary(
  clientName: string,
  recommendations: readonly OptimizationRecommendation[],
): string {
  const highPriorityCount = recommendations.filter(
    (recommendation) =>
      recommendation.priority === 'high' || recommendation.priority === 'critical',
  ).length;

  if (highPriorityCount >= 2) {
    return `${clientName} tem ${highPriorityCount} recomendacoes urgentes para proteger eficiencia e redistribuir verba no curto prazo.`;
  }

  if (recommendations[0] !== undefined) {
    return `${clientName} tem ${recommendations.length} frentes claras de otimizacao, com destaque para ${recommendations[0].entityLabel}.`;
  }

  return `${clientName} possui recomendacoes prontas para revisao manual.`;
}

function buildRecommendedFocus(
  recommendation: OptimizationRecommendation | undefined,
): string {
  if (recommendation === undefined) {
    return 'Manter monitoramento do consolidado local.';
  }

  switch (recommendation.ruleCode) {
    case 'campaign_scale_winner':
      return 'Concentrar verba incremental em campanhas com eficiencia acima da media e espaco real de impressao.';
    case 'campaign_zero_conversion_bleed':
      return 'Cortar gasto improdutivo rapidamente antes de ampliar novas frentes.';
    case 'campaign_cost_efficiency_gap':
    case 'campaign_deteriorating_signal':
      return 'Redistribuir budget das campanhas menos eficientes e atacar a causa do deterioro.';
    default:
      return 'Revisar a distribuicao atual de verba e priorizar correcoes antes de acelerar investimento.';
  }
}

function buildRecommendationId(
  tenantId: string,
  clientId: string,
  ruleCode: string,
  entityId: string,
): string {
  return createHash('sha256')
    .update(`${tenantId}:${clientId}:${ruleCode}:${entityId}`)
    .digest('hex')
    .slice(0, 24);
}

function scoreToPriority(score: number): OptimizationPriority {
  if (score >= 88) {
    return 'critical';
  }

  if (score >= 72) {
    return 'high';
  }

  if (score >= 52) {
    return 'medium';
  }

  return 'low';
}

function calculateConfidenceScore(input: {
  readonly clicks: number;
  readonly conversions: number;
  readonly spend: number;
}): number {
  let score = 0.48;

  if (input.clicks >= 35) {
    score += 0.08;
  }

  if (input.clicks >= 80) {
    score += 0.08;
  }

  if (input.conversions >= 3) {
    score += 0.1;
  }

  if (input.conversions >= 8) {
    score += 0.08;
  }

  if (input.conversions >= 15) {
    score += 0.05;
  }

  if (input.spend >= 250) {
    score += 0.05;
  }

  if (input.spend >= 700) {
    score += 0.03;
  }

  return roundNumber(clampNumber(score, 0.45, 0.95), 2);
}

function compareRecommendations(
  left: OptimizationRecommendation,
  right: OptimizationRecommendation,
): number {
  if (left.priorityScore !== right.priorityScore) {
    return right.priorityScore - left.priorityScore;
  }

  return right.confidenceScore - left.confidenceScore;
}

function percentageDelta(current: number, baseline: number | null): number | null {
  if (baseline === null || baseline === 0) {
    return null;
  }

  return roundNumber(((current - baseline) / baseline) * 100, 1);
}

function shareDeltaPct(part: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return roundNumber((part / total) * 100, 1);
}

function decimalToNumber(value: NumericLike): number {
  if (value === null) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return value.toNumber();
}

function decimalOrNull(value: NumericLike): number | null {
  return value === null ? null : roundNumber(decimalToNumber(value), 4);
}

function bigintToNumber(value: bigint | null): number {
  return value === null ? 0 : Number(value);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
