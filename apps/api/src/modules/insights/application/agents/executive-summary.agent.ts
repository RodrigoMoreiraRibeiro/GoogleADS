import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentFinding,
  AgentInput,
  ConsolidatedInsight,
  PerformanceAgentSummaryItem,
  PerformanceAgentSummarySlideOutlineItem,
} from '@googleads/shared';

import type { PerformanceAnalysisAgent } from '../../domain/agents/performance-analysis-agent.interface';
import {
  readConsolidatedInsights,
  readFindings,
} from '../../domain/agents/performance-agent-feature-readers';
import { buildAgentOutput } from '../../domain/agents/performance-agent.utils';

export interface ExecutiveSummaryProjection {
  readonly technical_headline: string;
  readonly executive_headline: string;
  readonly technical_bullets: readonly string[];
  readonly executive_bullets: readonly string[];
  readonly next_steps: readonly string[];
  readonly technical_summary: string;
  readonly executive_summary: string;
  readonly report_narrative: readonly string[];
  readonly top_problems: readonly PerformanceAgentSummaryItem[];
  readonly top_opportunities: readonly PerformanceAgentSummaryItem[];
  readonly slide_outline: readonly PerformanceAgentSummarySlideOutlineItem[];
}

@Injectable()
export class ExecutiveSummaryAgent implements PerformanceAnalysisAgent {
  public readonly agentName = 'executive_summary' as const;
  public readonly isRequired = true;

  private readonly logger = new Logger(ExecutiveSummaryAgent.name);

  public async execute(input: AgentInput) {
    const consolidatedInsights = readConsolidatedInsights(input.features.consolidated_insights);
    const reviewedFindings = readFindings(input.features.reviewed_findings);

    if (consolidatedInsights.length === 0) {
      this.logger.warn('Executive Summary without consolidated insights.');

      return buildAgentOutput({
        agentName: this.agentName,
        agentVersion: input.agent_version,
        executionContext: input.execution_context,
        analysisWindow: input.analysis_window,
        status: 'insufficient_data',
        priorityScore: 0,
        confidenceScore: 0.35,
        dataQuality: input.data_quality,
        summary:
          'Ainda nao ha insights consolidados suficientes para montar um resumo final.',
        recommendedFocus:
          'Gerar achados consolidados antes de produzir narrativa executiva.',
        candidateEntityIds: [],
        findings: [],
        entitiesEvaluated: 0,
        findingsSuppressed: 0,
      });
    }

    const projection = buildExecutiveSummaryProjection({
      consolidatedInsights,
      reviewedFindings,
    });
    const topInsight = consolidatedInsights[0];

    return buildAgentOutput({
      agentName: this.agentName,
      agentVersion: input.agent_version,
      executionContext: input.execution_context,
      analysisWindow: input.analysis_window,
      status: 'ready',
      priorityScore: topInsight?.priority_score ?? 40,
      confidenceScore: topInsight?.confidence_score ?? 0.55,
      dataQuality: input.data_quality,
      summary: projection.technical_headline,
      recommendedFocus: projection.executive_headline,
      candidateEntityIds: consolidatedInsights.map((insight) => insight.entity_id),
      findings: [],
      entitiesEvaluated: consolidatedInsights.length,
      findingsSuppressed: 0,
    });
  }
}

export function buildExecutiveSummaryProjection(input: {
  readonly consolidatedInsights: readonly ConsolidatedInsight[];
  readonly reviewedFindings: readonly AgentFinding[];
}): ExecutiveSummaryProjection {
  const sortedInsights = [...input.consolidatedInsights].sort((left, right) => {
    if (right.priority_score !== left.priority_score) {
      return right.priority_score - left.priority_score;
    }

    return right.confidence_score - left.confidence_score;
  });
  const topProblems = sortedInsights.filter((insight) => !isOpportunity(insight)).slice(0, 3);
  const topOpportunities = sortedInsights.filter((insight) => isOpportunity(insight)).slice(0, 3);
  const problemItems = topProblems.map(mapSummaryItem);
  const opportunityItems = topOpportunities.map(mapSummaryItem);
  const technicalHeadline = buildTechnicalHeadline(sortedInsights, problemItems, opportunityItems);
  const executiveHeadline = buildExecutiveHeadline(problemItems, opportunityItems);
  const nextSteps = buildNextSteps(sortedInsights);

  return {
    technical_headline: technicalHeadline,
    executive_headline: executiveHeadline,
    technical_bullets: buildTechnicalBullets(problemItems, opportunityItems),
    executive_bullets: buildExecutiveBullets(problemItems, opportunityItems),
    next_steps: nextSteps,
    technical_summary: buildTechnicalSummary(problemItems, opportunityItems, input.reviewedFindings.length),
    executive_summary: buildExecutiveSummary(problemItems, opportunityItems),
    report_narrative: buildReportNarrative(problemItems, opportunityItems, nextSteps),
    top_problems: problemItems,
    top_opportunities: opportunityItems,
    slide_outline: buildSlideOutline(problemItems, opportunityItems, nextSteps),
  };
}

function buildTechnicalHeadline(
  insights: readonly ConsolidatedInsight[],
  topProblems: readonly PerformanceAgentSummaryItem[],
  topOpportunities: readonly PerformanceAgentSummaryItem[],
): string {
  const criticalCount = insights.filter((insight) => insight.priority_band === 'critical').length;

  if (criticalCount > 0 && topProblems.length > 0) {
    return `${criticalCount} frente(s) pedem acao imediata; principal risco atual em ${topProblems[0]?.entity_label ?? 'conta'} e ${topOpportunities.length} oportunidade(s) de ganho sustentado foram identificadas.`;
  }

  return `${insights.length} insight(s) consolidados para orientar a proxima rodada, com ${topProblems.length} problema(s) prioritario(s) e ${topOpportunities.length} oportunidade(s) clara(s).`;
}

function buildExecutiveHeadline(
  topProblems: readonly PerformanceAgentSummaryItem[],
  topOpportunities: readonly PerformanceAgentSummaryItem[],
): string {
  const topProblem = topProblems[0];
  const topOpportunity = topOpportunities[0];

  if (topProblem !== undefined && topOpportunity !== undefined) {
    return `Hoje o maior ponto de atencao esta em ${topProblem.entity_label ?? 'uma frente prioritaria'}, enquanto a melhor oportunidade de crescimento esta em ${topOpportunity.entity_label ?? 'uma campanha vencedora'}.`;
  }

  if (topProblem !== undefined) {
    return `O principal ponto de atencao neste ciclo esta em ${topProblem.entity_label ?? 'uma frente prioritaria'}, com impacto direto sobre eficiencia e risco de desperdicio.`;
  }

  if (topOpportunity !== undefined) {
    return `A conta mostra uma oportunidade clara de crescimento em ${topOpportunity.entity_label ?? 'uma frente vencedora'}, com risco controlado.`;
  }

  return 'Nao houve recomendacao executiva forte nesta janela.';
}

function buildTechnicalBullets(
  topProblems: readonly PerformanceAgentSummaryItem[],
  topOpportunities: readonly PerformanceAgentSummaryItem[],
): string[] {
  return [
    ...topProblems.map(
      (item) =>
        `Problema: ${item.title}. Impacto: ${item.why_it_matters}. Risco: ${item.risk_level}.`,
    ),
    ...topOpportunities.map(
      (item) =>
        `Oportunidade: ${item.title}. Potencial: ${item.expected_impact}. Confianca: ${item.confidence_score.toFixed(2)}.`,
    ),
  ].slice(0, 6);
}

function buildExecutiveBullets(
  topProblems: readonly PerformanceAgentSummaryItem[],
  topOpportunities: readonly PerformanceAgentSummaryItem[],
): string[] {
  return [
    ...topProblems.map(
      (item) =>
        `${item.entity_label ?? 'Esta frente'} precisa de ajuste porque ${simplifyExecutiveText(item.why_it_matters)}.`,
    ),
    ...topOpportunities.map(
      (item) =>
        `${item.entity_label ?? 'Esta frente'} pode crescer porque ${simplifyExecutiveText(item.expected_impact)}.`,
    ),
  ].slice(0, 6);
}

function buildTechnicalSummary(
  topProblems: readonly PerformanceAgentSummaryItem[],
  topOpportunities: readonly PerformanceAgentSummaryItem[],
  reviewedFindingCount: number,
): string {
  const problemText =
    topProblems.length > 0
      ? `Top problemas: ${topProblems.map((item) => item.title).join('; ')}.`
      : 'Nao houve problema critico consolidado neste ciclo.';
  const opportunityText =
    topOpportunities.length > 0
      ? `Top oportunidades: ${topOpportunities.map((item) => item.title).join('; ')}.`
      : 'Nao houve oportunidade forte o suficiente para escalonamento imediato.';

  return `Foram revisados ${reviewedFindingCount} finding(s) e consolidados os desvios com melhor sustentacao. ${problemText} ${opportunityText}`;
}

function buildExecutiveSummary(
  topProblems: readonly PerformanceAgentSummaryItem[],
  topOpportunities: readonly PerformanceAgentSummaryItem[],
): string {
  if (topProblems.length === 0 && topOpportunities.length === 0) {
    return 'Neste periodo, ainda nao apareceu um sinal forte o bastante para recomendar mudanca relevante.';
  }

  const problemText =
    topProblems.length > 0
      ? `Os principais pontos que estao travando resultado hoje sao ${topProblems
          .map((item) => item.entity_label ?? item.title)
          .join(', ')}.`
      : 'Nao apareceu um problema material com urgencia imediata.';
  const opportunityText =
    topOpportunities.length > 0
      ? `As melhores oportunidades de crescimento estao em ${topOpportunities
          .map((item) => item.entity_label ?? item.title)
          .join(', ')}.`
      : 'Neste ciclo, o foco maior esta mais em corrigir gargalos do que em expandir.';

  return `${problemText} ${opportunityText}`;
}

function buildReportNarrative(
  topProblems: readonly PerformanceAgentSummaryItem[],
  topOpportunities: readonly PerformanceAgentSummaryItem[],
  nextSteps: readonly string[],
): string[] {
  const paragraphs: string[] = [];

  paragraphs.push(
    topProblems.length > 0
      ? `A leitura consolidada mostra que os maiores riscos atuais estao concentrados em ${topProblems
          .map((item) => item.entity_label ?? item.title)
          .join(', ')}, com impacto esperado sobre eficiencia e custo de aquisicao.`
      : 'A leitura consolidada nao mostrou um risco critico isolado nesta janela, o que sugere estabilidade relativa da operacao.',
  );

  paragraphs.push(
    topOpportunities.length > 0
      ? `Ao mesmo tempo, ha espaco para acelerar ganho em ${topOpportunities
          .map((item) => item.entity_label ?? item.title)
          .join(', ')}, desde que a execucao preserve controle de risco e monitoramento.`
      : 'As oportunidades identificadas neste ciclo sao mais incrementais e pedem validacao controlada antes de ampliar investimento.',
  );

  paragraphs.push(
    `Os proximos passos sugeridos para o periodo sao: ${nextSteps.slice(0, 3).join('; ')}.`,
  );

  return paragraphs;
}

function buildSlideOutline(
  topProblems: readonly PerformanceAgentSummaryItem[],
  topOpportunities: readonly PerformanceAgentSummaryItem[],
  nextSteps: readonly string[],
): PerformanceAgentSummarySlideOutlineItem[] {
  return [
    {
      slide_type: 'cover_summary',
      title: 'Resumo do periodo',
      main_message:
        topProblems.length > 0
          ? `O principal foco agora e corrigir ${topProblems[0]?.entity_label ?? topProblems[0]?.title}.`
          : 'O periodo mostrou estabilidade com espaco para crescimento controlado.',
      bullets: [
        ...topProblems.slice(0, 2).map((item) => `Atencao: ${item.title}`),
        ...topOpportunities.slice(0, 2).map((item) => `Oportunidade: ${item.title}`),
      ].slice(0, 4),
    },
    {
      slide_type: 'gaps',
      title: 'Principais problemas',
      main_message:
        topProblems.length > 0
          ? 'Os gargalos mais relevantes estao claros e priorizados.'
          : 'Nao houve problema forte o suficiente para virar alerta principal.',
      bullets: topProblems.map(
        (item) => `${item.entity_label ?? item.title}: ${item.why_it_matters}`,
      ),
    },
    {
      slide_type: 'winners',
      title: 'Principais oportunidades',
      main_message:
        topOpportunities.length > 0
          ? 'Ha frentes com espaco para crescimento com risco controlado.'
          : 'Neste ciclo, as oportunidades sao mais moderadas do que expansivas.',
      bullets: topOpportunities.map(
        (item) => `${item.entity_label ?? item.title}: ${item.expected_impact}`,
      ),
    },
    {
      slide_type: 'diagnosis',
      title: 'Leitura consolidada',
      main_message: 'As recomendacoes foram priorizadas por impacto esperado, risco e confianca.',
      bullets: [
        ...topProblems.slice(0, 2).map(
          (item) => `Problema: ${item.title} | risco ${item.risk_level}`,
        ),
        ...topOpportunities.slice(0, 2).map(
          (item) => `Oportunidade: ${item.title} | confianca ${item.confidence_score.toFixed(2)}`,
        ),
      ].slice(0, 4),
    },
    {
      slide_type: 'next_steps',
      title: 'Proximos passos',
      main_message: 'A prioridade e agir no que combina maior impacto com risco administravel.',
      bullets: [...nextSteps].slice(0, 5),
    },
  ];
}

function buildNextSteps(insights: readonly ConsolidatedInsight[]): string[] {
  return Array.from(
    new Set(insights.flatMap((insight) => insight.next_steps).filter((step) => step.length > 0)),
  ).slice(0, 5);
}

function mapSummaryItem(insight: ConsolidatedInsight): PerformanceAgentSummaryItem {
  return {
    title: insight.title,
    entity_label: insight.entity_label,
    category: insight.category,
    action_type: insight.recommended_action.action_type,
    priority_score: insight.priority_score,
    confidence_score: insight.confidence_score,
    risk_level: insight.risk_level,
    why_it_matters: insight.summary,
    expected_impact: insight.expected_impact,
  };
}

function isOpportunity(insight: ConsolidatedInsight): boolean {
  if (insight.recommended_action.action_type === 'scale') {
    return true;
  }

  if (insight.severity === 'info' && insight.priority_score < 80) {
    return true;
  }

  const text = `${insight.title} ${insight.summary} ${insight.expected_impact}`.toLowerCase();
  return (
    text.includes('oportunidade') ||
    text.includes('expans') ||
    text.includes('escala') ||
    text.includes('crescimento')
  );
}

function simplifyExecutiveText(text: string): string {
  return text
    .replace(/custo por aquisicao/gi, 'o custo para gerar resultado')
    .replace(/conversao/gi, 'resultado')
    .replace(/eficiencia/gi, 'a eficiencia da verba')
    .replace(/semantica/gi, 'mensagem')
    .replace(/correspondencia/gi, 'configuracao de busca');
}
