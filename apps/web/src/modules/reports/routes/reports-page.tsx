import type {
  ExecutiveDeckSlide,
  ExecutiveReportNarrativeItem,
  ExecutiveReportView,
  LocalWorkspacePeriod,
} from '@googleads/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';

import { fetchLocalExecutiveReport } from '../api/local-executive-report.api';
import { fetchLocalWorkspace } from '../../../shared/local-workspace/local-workspace.api';
import { LocalWorkspaceFilters } from '../../../shared/local-workspace/local-workspace-filters';

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTenantSlug = searchParams.get('tenantSlug') ?? undefined;
  const selectedClientId = searchParams.get('clientId') ?? undefined;
  const selectedPeriod =
    (searchParams.get('period') as LocalWorkspacePeriod | null) ?? 'last_7d';

  const workspaceQuery = useQuery({
    queryKey: ['local-workspace', selectedTenantSlug, selectedClientId, selectedPeriod],
    queryFn: () =>
      fetchLocalWorkspace({
        tenantSlug: selectedTenantSlug,
        clientId: selectedClientId,
        period: selectedPeriod,
      }),
  });

  const executiveReportQuery = useQuery({
    queryKey: [
      'local-executive-report',
      selectedTenantSlug,
      selectedClientId,
      selectedPeriod,
    ],
    queryFn: () =>
      fetchLocalExecutiveReport({
        tenantSlug: selectedTenantSlug,
        clientId: selectedClientId,
        period: selectedPeriod,
      }),
    enabled: workspaceQuery.data?.context !== null && workspaceQuery.data !== undefined,
  });

  const workspace = workspaceQuery.data;
  const reportView = executiveReportQuery.data;
  const availableReport = hasAvailableReport(reportView) ? reportView : null;

  return (
    <>
      {workspace !== undefined ? (
        <LocalWorkspaceFilters
          workspace={workspace}
          selectedTenantSlug={selectedTenantSlug}
          selectedClientId={selectedClientId}
          selectedPeriod={selectedPeriod}
          disabled={workspaceQuery.isFetching}
          onTenantChange={(tenantSlug) => {
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.set('tenantSlug', tenantSlug);
            nextSearchParams.delete('clientId');
            setSearchParams(nextSearchParams);
          }}
          onClientChange={(clientId) => {
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.set('clientId', clientId);
            setSearchParams(nextSearchParams);
          }}
          onPeriodChange={(period) => {
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.set('period', period);
            setSearchParams(nextSearchParams);
          }}
        />
      ) : null}

      <section className="surface">
        <div className="surface-header">
          <div>
            <h2 className="surface-title">Relatorio executivo oficial</h2>
            <p className="section-copy">
              O deck abaixo nasce da mesma fonte oficial do dashboard: findings
              revisados, insights consolidados e `summary_json` do ultimo
              `analysis_run` concluido.
            </p>
          </div>
        </div>

        {executiveReportQuery.isLoading ? (
          <div className="agent-insights-placeholder">
            <div className="agent-skeleton agent-skeleton-wide" />
            <div className="agent-skeleton-grid">
              <div className="agent-skeleton" />
              <div className="agent-skeleton" />
            </div>
            <div className="agent-skeleton agent-skeleton-table" />
          </div>
        ) : null}

        {executiveReportQuery.isError ? (
          <div className="status-banner warning">
            Nao foi possivel gerar o preview executivo com base no ultimo
            `analysis_run`. Confirme a API local, a base e se existe uma analise
            concluida para este cliente.
          </div>
        ) : null}

        {executiveReportQuery.isSuccess && reportView?.source === null ? (
          <div className="empty-state">
            <h3 className="surface-title">Nenhum resumo oficial disponivel ainda</h3>
            <p className="section-copy">
              Quando existir um `analysis_run` concluido com `summary_json`, esta
              tela passa a gerar o sumario semanal ou mensal automaticamente.
            </p>
          </div>
        ) : null}

        {availableReport !== null ? (
          <div className="list-stack">
            <div className="status-banner info">
              {availableReport.report_type === 'weekly' ? 'Sumario semanal' : 'Sumario mensal'}
              {' '}| analise {availableReport.source.summary_snapshot.analysis_run_id}
              {' '}| periodo {availableReport.source.period_reference.period_start} a{' '}
              {availableReport.source.period_reference.period_end}
            </div>

            <section className="surface surface-quiet">
              <div className="surface-header">
                <div>
                  <h3 className="surface-title">Fonte oficial do relatorio</h3>
                  <p className="section-copy">
                    O resumo executivo e o deck usam exatamente esta narrativa
                    consolidada, o que preserva coerencia com o dashboard.
                  </p>
                </div>
              </div>

              <div className="agent-summary-grid">
                <div className="agent-lane">
                  <div className="agent-lane-header">
                    <h3 className="surface-title">Resumo tecnico</h3>
                    <p className="section-copy">
                      Para gestor de trafego e validacao operacional.
                    </p>
                  </div>
                  <p className="list-row-text">
                    {availableReport.source.summary_snapshot.technical_summary}
                  </p>
                </div>

                <div className="agent-lane">
                  <div className="agent-lane-header">
                    <h3 className="surface-title">Resumo executivo</h3>
                    <p className="section-copy">
                      Em linguagem mais simples para cliente final.
                    </p>
                  </div>
                  <p className="list-row-text">
                    {availableReport.source.summary_snapshot.executive_summary}
                  </p>
                </div>
              </div>
            </section>

            <section className="surface">
              <div className="surface-header">
                <div>
                  <h3 className="surface-title">Resultados e gargalos</h3>
                  <p className="section-copy">
                    Os blocos abaixo resumem o que melhor funcionou, o que travou
                    resultado e as acoes recomendadas pelo time de agentes.
                  </p>
                </div>
              </div>

              <div className="agent-summary-grid">
                <NarrativeLane
                  title="Destaques positivos"
                  description="Frentes com oportunidade de crescimento ou ganho controlado."
                  items={availableReport.source.top_results}
                />

                <NarrativeLane
                  title="Gargalos principais"
                  description="Frentes que pedem correcao, contencao ou revisao."
                  items={availableReport.source.top_gaps}
                />
              </div>

              <div className="surface-header agent-table-header">
                <div>
                  <h3 className="surface-title">Acoes recomendadas</h3>
                  <p className="section-copy">
                    Proximos passos priorizados para a semana ou mes seguinte.
                  </p>
                </div>
              </div>

              <div className="list-stack">
                {availableReport.source.prioritized_actions.map((action) => (
                  <div className="note-block" key={action}>
                    <strong>{action}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="surface">
              <div className="surface-header">
                <div>
                  <h3 className="surface-title">Preview do deck JSON</h3>
                  <p className="section-copy">
                    Estrutura pronta para HTML/PDF ou PPTX, derivada do payload
                    intermediario do relatorio.
                  </p>
                </div>
              </div>

              <div className="metric-grid">
                {availableReport.source.key_metrics.map((metric) => (
                  <article className="metric-item" key={metric.label}>
                    <span className="metric-label">{metric.label}</span>
                    <strong className="metric-value">{metric.value}</strong>
                    <span className="metric-trend">
                      {metric.context ?? 'KPI oficial do periodo'}
                    </span>
                  </article>
                ))}
              </div>

              <div className="list-stack">
                {availableReport.deck.slides.map((slide) => (
                  <DeckSlidePreview key={slide.slide_id} slide={slide} />
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </>
  );
}

function NarrativeLane({
  title,
  description,
  items,
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly ExecutiveReportNarrativeItem[];
}) {
  return (
    <div className="agent-lane">
      <div className="agent-lane-header">
        <h3 className="surface-title">{title}</h3>
        <p className="section-copy">{description}</p>
      </div>

      {items.length === 0 ? (
        <div className="note-block">
          <strong>Sem destaque neste bloco</strong>
          <span className="list-row-text">
            Esta janela nao trouxe um item forte o suficiente para aparecer aqui.
          </span>
        </div>
      ) : (
        <div className="agent-card-grid">
          {items.map((item) => (
            <article className="agent-focus-card" key={item.insight_id}>
              <div className="recommendation-header">
                <div>
                  <span className="metric-label">
                    {item.entity_label ?? item.title}
                  </span>
                  <h3 className="list-row-title">{item.title}</h3>
                </div>
                <div className="recommendation-badges">
                  <span className={`pill ${mapPriorityPill(item.priority_band)}`}>
                    {item.priority_band}
                  </span>
                  <span className={`pill ${mapRiskPill(item.risk_level)}`}>
                    risco {item.risk_level}
                  </span>
                </div>
              </div>

              <p className="list-row-text">{item.executive_explanation}</p>
              <p className="list-row-text">
                <strong>Acao:</strong> {item.recommended_action}
              </p>
              <div className="agent-card-footer">
                <span>Priority {item.priority_score.toFixed(0)}</span>
                <span>Confidence {(item.confidence_score * 100).toFixed(0)}%</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function hasAvailableReport(
  reportView: ExecutiveReportView | undefined,
): reportView is ExecutiveReportView & {
  readonly source: NonNullable<ExecutiveReportView['source']>;
  readonly deck: NonNullable<ExecutiveReportView['deck']>;
} {
  return reportView !== undefined && reportView.source !== null && reportView.deck !== null;
}

function DeckSlidePreview({
  slide,
}: {
  readonly slide: ExecutiveDeckSlide;
}) {
  return (
    <article className="recommendation-card">
      <div className="recommendation-header">
        <div>
          <span className="metric-label">{formatSlideType(slide.slide_type)}</span>
          <h3 className="list-row-title">{slide.title}</h3>
        </div>
        <span className="pill pill-neutral">{slide.highlights.length} highlights</span>
      </div>

      <p className="list-row-text">{slide.main_message}</p>

      <div className="list-stack">
        {slide.bullets.map((bullet) => (
          <div className="note-block" key={`${slide.slide_id}-${bullet}`}>
            <span className="list-row-text">{bullet}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function formatSlideType(value: ExecutiveDeckSlide['slide_type']): string {
  return value.replaceAll('_', ' ');
}

function mapPriorityPill(priority: ExecutiveReportNarrativeItem['priority_band']): string {
  switch (priority) {
    case 'critical':
      return 'pill-warning';
    case 'high':
      return 'pill-warning';
    case 'medium':
      return 'pill-neutral';
    default:
      return 'pill-success';
  }
}

function mapRiskPill(riskLevel: ExecutiveReportNarrativeItem['risk_level']): string {
  switch (riskLevel) {
    case 'high':
      return 'pill-warning';
    case 'medium':
      return 'pill-neutral';
    default:
      return 'pill-success';
  }
}
