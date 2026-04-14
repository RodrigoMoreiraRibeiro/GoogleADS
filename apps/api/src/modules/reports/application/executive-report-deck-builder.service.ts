import { Injectable } from '@nestjs/common';
import type {
  ExecutiveDeck,
  ExecutiveDeckChart,
  ExecutiveDeckReportType,
  ExecutiveDeckSlide,
  ExecutiveReportNarrativeItem,
  ExecutiveReportSource,
} from '@googleads/shared';

@Injectable()
export class ExecutiveReportDeckBuilderService {
  public buildDeck(source: ExecutiveReportSource): ExecutiveDeck {
    const slides =
      source.report_type === 'weekly'
        ? this.buildWeeklySlides(source)
        : this.buildMonthlySlides(source);

    return {
      deck_id: `deck-${source.summary_snapshot.analysis_run_id}-${source.report_type}`,
      tenant_id: source.tenant_id,
      client_id: source.client_id,
      report_type: source.report_type,
      period_reference: source.period_reference,
      audience: 'client',
      headline: source.summary_snapshot.executive_headline,
      slides,
      generated_at: source.generated_at,
    };
  }

  private buildWeeklySlides(source: ExecutiveReportSource): ExecutiveDeckSlide[] {
    return [
      this.buildCoverSlide(source),
      this.buildTrendSlide(source),
      this.buildResultsSlide(source),
      this.buildGapsSlide(source),
      this.buildNextStepsSlide(source),
    ];
  }

  private buildMonthlySlides(source: ExecutiveReportSource): ExecutiveDeckSlide[] {
    return [
      this.buildCoverSlide(source),
      this.buildTrendSlide(source),
      this.buildResultsSlide(source),
      this.buildGapsSlide(source),
      this.buildDiagnosisSlide(source),
      this.buildActionPlanSlide(source),
      this.buildNextStepsSlide(source),
    ];
  }

  private buildCoverSlide(source: ExecutiveReportSource): ExecutiveDeckSlide {
    return {
      slide_id: `${source.summary_snapshot.analysis_run_id}-cover`,
      slide_type: 'cover_summary',
      title:
        source.report_type === 'weekly'
          ? 'Resumo semanal'
          : 'Resumo mensal',
      main_message: source.summary_snapshot.executive_headline,
      bullets: source.summary_snapshot.executive_summary
        .split('. ')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 3),
      highlights: source.key_metrics.slice(0, 4),
      chart: null,
      speaker_note: source.summary_snapshot.technical_summary,
    };
  }

  private buildTrendSlide(source: ExecutiveReportSource): ExecutiveDeckSlide {
    return {
      slide_id: `${source.summary_snapshot.analysis_run_id}-trend`,
      slide_type: 'trend',
      title: 'Resultados do periodo',
      main_message:
        source.top_results.length > 0
          ? 'Houve sinais claros de resultado e espacos de ganho controlado.'
          : 'O periodo trouxe uma base consistente para acompanhar investimento, retorno e gargalos.',
      bullets: source.key_metrics
        .map((metric) =>
          metric.context === null || metric.context === undefined
            ? `${metric.label}: ${metric.value}`
            : `${metric.label}: ${metric.value} | ${metric.context}`,
        )
        .slice(0, 4),
      highlights: source.key_metrics.slice(0, 4),
      chart: buildKpiStripChart(source),
      speaker_note: source.summary_snapshot.technical_headline,
    };
  }

  private buildResultsSlide(source: ExecutiveReportSource): ExecutiveDeckSlide {
    return {
      slide_id: `${source.summary_snapshot.analysis_run_id}-results`,
      slide_type: 'winners',
      title: 'O que melhor funcionou',
      main_message:
        source.top_results.length > 0
          ? 'As melhores oportunidades vieram de frentes com potencial de crescimento controlado.'
          : 'Nesta janela, a leitura foi mais de estabilidade do que de oportunidade forte de escala.',
      bullets: source.top_results
        .map(
          (item) =>
            `${item.entity_label ?? item.title}: ${item.executive_explanation} Acao sugerida: ${item.recommended_action}`,
        )
        .slice(0, 4),
      highlights: source.top_results.slice(0, 3).map((item) => ({
        label: item.entity_label ?? item.title,
        value: `Priority ${item.priority_score.toFixed(0)}`,
        context: `Confidence ${(item.confidence_score * 100).toFixed(0)}%`,
      })),
      chart: buildPriorityBarChart(source.top_results, 'Oportunidades priorizadas'),
      speaker_note: source.summary_snapshot.technical_summary,
    };
  }

  private buildGapsSlide(source: ExecutiveReportSource): ExecutiveDeckSlide {
    return {
      slide_id: `${source.summary_snapshot.analysis_run_id}-gaps`,
      slide_type: 'gaps',
      title: 'O que travou resultado',
      main_message:
        source.top_gaps.length > 0
          ? 'Os gargalos mais relevantes ja estao priorizados por impacto esperado e risco.'
          : 'Nenhum gargalo forte apareceu o suficiente para se destacar nesta janela.',
      bullets: source.top_gaps
        .map(
          (item) =>
            `${item.entity_label ?? item.title}: ${item.executive_explanation} Risco ${item.risk_level}.`,
        )
        .slice(0, 4),
      highlights: source.top_gaps.slice(0, 3).map((item) => ({
        label: item.entity_label ?? item.title,
        value: `Priority ${item.priority_score.toFixed(0)}`,
        context: `Confidence ${(item.confidence_score * 100).toFixed(0)}%`,
      })),
      chart: buildPriorityBarChart(source.top_gaps, 'Gargalos priorizados'),
      speaker_note: source.summary_snapshot.technical_summary,
    };
  }

  private buildDiagnosisSlide(source: ExecutiveReportSource): ExecutiveDeckSlide {
    return {
      slide_id: `${source.summary_snapshot.analysis_run_id}-diagnosis`,
      slide_type: 'diagnosis',
      title: 'Leitura consolidada',
      main_message:
        'A narrativa abaixo foi gerada a partir dos findings revisados e mantem coerencia com o dashboard.',
      bullets: source.summary_snapshot.report_narrative.slice(0, 4),
      highlights: [
        {
          label: 'Insights oficiais',
          value: String(source.summary_snapshot.official_insights_count),
          context: null,
        },
        {
          label: 'Findings revisados',
          value: String(source.summary_snapshot.reviewed_findings_count),
          context: null,
        },
      ],
      chart: null,
      speaker_note: source.summary_snapshot.technical_headline,
    };
  }

  private buildActionPlanSlide(source: ExecutiveReportSource): ExecutiveDeckSlide {
    return {
      slide_id: `${source.summary_snapshot.analysis_run_id}-actions`,
      slide_type: 'action_plan',
      title: 'Acoes recomendadas',
      main_message:
        'As acoes abaixo refletem o que deve ser corrigido, protegido ou acelerado no proximo ciclo.',
      bullets: source.prioritized_actions.slice(0, 5),
      highlights: source.official_insights.slice(0, 3).map((item) => ({
        label: item.entity_label ?? item.title,
        value: item.recommended_action,
        context: item.expected_impact,
      })),
      chart: null,
      speaker_note: source.summary_snapshot.technical_summary,
    };
  }

  private buildNextStepsSlide(source: ExecutiveReportSource): ExecutiveDeckSlide {
    return {
      slide_id: `${source.summary_snapshot.analysis_run_id}-next-steps`,
      slide_type: 'next_steps',
      title: 'Proximos passos',
      main_message:
        'O plano para a proxima janela combina correcoes prioritarias, protecao de verba e testes de crescimento.',
      bullets: source.summary_snapshot.next_steps.slice(0, 5),
      highlights: source.official_insights.slice(0, 3).map((item) => ({
        label: item.entity_label ?? item.title,
        value: item.recommended_action,
        context: item.expected_impact,
      })),
      chart: null,
      speaker_note: source.summary_snapshot.executive_summary,
    };
  }
}

function buildKpiStripChart(source: ExecutiveReportSource): ExecutiveDeckChart {
  return {
    chart_type: 'kpi_strip',
    title: 'KPIs oficiais do periodo',
    series: [
      {
        name: 'KPIs',
        points: source.key_metrics.slice(0, 4).map((metric, index) => ({
          label: metric.label,
          value: index + 1,
        })),
      },
    ],
  };
}

function buildPriorityBarChart(
  items: readonly ExecutiveReportNarrativeItem[],
  title: string,
): ExecutiveDeckChart | null {
  const selectedItems = [...items].slice(0, 4);

  if (selectedItems.length === 0) {
    return null;
  }

  return {
    chart_type: 'bar',
    title,
    series: [
      {
        name: 'Priority score',
        points: selectedItems.map((item) => ({
          label: item.entity_label ?? item.title,
          value: item.priority_score,
        })),
      },
    ],
  };
}
