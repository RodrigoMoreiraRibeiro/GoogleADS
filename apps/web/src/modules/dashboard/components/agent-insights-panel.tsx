import type {
  LocalWorkspaceAgentInsightItem,
  LocalWorkspaceAgentInsightsView,
  LocalWorkspaceInsightLevel,
} from '@googleads/shared';
import { useState } from 'react';

const INSIGHT_LEVEL_OPTIONS = ['technical', 'executive'] as const;

interface AgentInsightsPanelProps {
  readonly data: LocalWorkspaceAgentInsightsView | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

export function AgentInsightsPanel({
  data,
  isLoading,
  isError,
}: AgentInsightsPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] =
    useState<LocalWorkspaceInsightLevel>('technical');

  if (isLoading) {
    return (
      <section className="surface">
        <div className="surface-header">
          <div>
            <h2 className="surface-title">Analise consolidada dos agentes</h2>
            <p className="section-copy">
              Carregando a ultima leitura consolidada do time de especialistas.
            </p>
          </div>
        </div>

        <div className="agent-insights-placeholder">
          <div className="agent-skeleton agent-skeleton-wide" />
          <div className="agent-skeleton-grid">
            <div className="agent-skeleton" />
            <div className="agent-skeleton" />
          </div>
          <div className="agent-skeleton agent-skeleton-table" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="surface">
        <div className="surface-header">
          <div>
            <h2 className="surface-title">Analise consolidada dos agentes</h2>
            <p className="section-copy">
              A leitura do historico consolidado falhou nesta tentativa.
            </p>
          </div>
        </div>

        <div className="status-banner warning">
          Nao foi possivel ler os insights consolidados do banco local. Reinicie a
          API, confirme o MySQL e tente novamente.
        </div>
      </section>
    );
  }

  if (data === undefined || data.lastAnalysis === null) {
    return (
      <section className="surface">
        <div className="surface-header">
          <div>
            <h2 className="surface-title">Analise consolidada dos agentes</h2>
            <p className="section-copy">
              Assim que houver um `analysis_run` concluido, esta area passa a
              mostrar problemas, oportunidades e a fila priorizada de insights.
            </p>
          </div>
        </div>

        <div className="empty-state">
          <h3 className="surface-title">Nenhuma analise executada ainda</h3>
          <p className="section-copy">
            O dashboard segue funcional com dados locais, mas ainda nao existe uma
            consolidacao completa dos agentes para este cliente.
          </p>
        </div>
      </section>
    );
  }

  const prioritizedInsights =
    selectedCategory === 'all'
      ? data.prioritizedInsights
      : data.prioritizedInsights.filter(
          (insight) => insight.category === selectedCategory,
        );
  const topProblems = prioritizedInsights
    .filter((insight) => !isOpportunityInsight(insight))
    .slice(0, 3);
  const topOpportunities = prioritizedInsights
    .filter((insight) => isOpportunityInsight(insight))
    .slice(0, 3);

  return (
    <section className="surface">
      <div className="surface-header">
        <div>
          <h2 className="surface-title">Analise consolidada dos agentes</h2>
          <p className="section-copy">
            Ultima execucao em {formatDateTime(data.lastAnalysis.finishedAt ?? data.lastAnalysis.createdAt)}.
            {' '}A tabela abaixo le apenas do banco local e mostra a priorizacao
            revisada pelo `Hypothesis Reviewer`.
          </p>
        </div>

        <div className="agent-analysis-meta">
          <span className={`pill ${mapRunStatusPill(data.lastAnalysis.status)}`}>
            {mapRunStatusLabel(data.lastAnalysis.status)}
          </span>
          <span className="pill pill-neutral">
            {data.lastAnalysis.insightCount} insight
            {data.lastAnalysis.insightCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="status-banner info">
        Analise {data.lastAnalysis.analysisRunId}
        {data.lastAnalysis.comparisonLabel === null
          ? ''
          : ` | ${data.lastAnalysis.comparisonLabel}`}
        {' '}| gerada por {data.lastAnalysis.generatedBy === 'user' ? 'usuario' : 'sistema'}.
      </div>

      <div className="agent-filter-row">
        <label className="field">
          <span className="field-label">Categoria</span>
          <select
            className="field-select"
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.currentTarget.value)}
          >
            <option value="all">Todas as categorias</option>
            {data.availableCategories.map((category) => (
              <option key={category} value={category}>
                {formatCategoryLabel(category)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Nivel de leitura</span>
          <select
            className="field-select"
            value={selectedLevel}
            onChange={(event) =>
              setSelectedLevel(event.currentTarget.value as LocalWorkspaceInsightLevel)
            }
          >
            {INSIGHT_LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level === 'technical' ? 'Tecnico' : 'Executivo'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="agent-summary-grid">
        <AgentInsightLane
          title="Top problemas"
          description="Frentes que pedem contencao, correcao ou revisao imediata."
          items={topProblems}
          level={selectedLevel}
          emptyMessage="Nenhum problema forte apareceu para o filtro atual."
        />

        <AgentInsightLane
          title="Top oportunidades"
          description="Espacos de ganho que merecem validacao ou escala controlada."
          items={topOpportunities}
          level={selectedLevel}
          emptyMessage="Nenhuma oportunidade clara apareceu para o filtro atual."
        />
      </div>

      <div className="surface-header agent-table-header">
        <div>
          <h3 className="surface-title">Insights priorizados</h3>
          <p className="section-copy">
            Ordenados por prioridade e confianca, com explicacao adaptada para a
            leitura selecionada.
          </p>
        </div>
      </div>

      {prioritizedInsights.length === 0 ? (
        <div className="empty-state">
          <h3 className="surface-title">Nenhum insight para este filtro</h3>
          <p className="section-copy">
            Troque a categoria para voltar a ver os achados consolidados deste
            cliente.
          </p>
        </div>
      ) : (
        <div className="agent-table">
          <div className="agent-table-head">
            <span>Prioridade</span>
            <span>Categoria</span>
            <span>Entidade</span>
            <span>Resumo</span>
            <span>Scores</span>
            <span>Acao</span>
          </div>

          {prioritizedInsights.map((insight) => (
            <article className="agent-table-row" key={insight.insightId}>
              <div className="agent-table-priority">
                <span className={`pill ${mapPriorityPill(insight.priorityBand)}`}>
                  {insight.priorityBand}
                </span>
                <span className={`pill ${mapSeverityPill(insight.severity)}`}>
                  {insight.severity}
                </span>
              </div>

              <div>
                <strong>{formatCategoryLabel(insight.category)}</strong>
                <p className="list-row-text">
                  {insight.hypothesisStatus === null
                    ? 'Sem classificacao'
                    : formatHypothesisLabel(insight.hypothesisStatus)}
                </p>
              </div>

              <div>
                <strong>{insight.entityLabel ?? insight.entityId}</strong>
                <p className="list-row-text">{insight.title}</p>
              </div>

              <div className="agent-table-summary">
                <strong>
                  {selectedLevel === 'technical' ? 'Leitura tecnica' : 'Leitura executiva'}
                </strong>
                <p className="list-row-text">
                  {selectedLevel === 'technical'
                    ? insight.technicalExplanation
                    : insight.executiveExplanation}
                </p>
              </div>

              <div className="agent-score-stack">
                <span>Priority {insight.priorityScore.toFixed(0)}</span>
                <span>Confidence {(insight.confidenceScore * 100).toFixed(0)}%</span>
              </div>

              <div>
                <strong>{insight.recommendedAction}</strong>
                <p className="list-row-text">
                  {insight.expectedImpact ?? insight.diagnosis}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AgentInsightLane({
  title,
  description,
  items,
  level,
  emptyMessage,
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly LocalWorkspaceAgentInsightItem[];
  readonly level: LocalWorkspaceInsightLevel;
  readonly emptyMessage: string;
}) {
  return (
    <div className="agent-lane">
      <div className="agent-lane-header">
        <h3 className="surface-title">{title}</h3>
        <p className="section-copy">{description}</p>
      </div>

      {items.length === 0 ? (
        <div className="note-block">
          <strong>Sem destaque no momento</strong>
          <span className="list-row-text">{emptyMessage}</span>
        </div>
      ) : (
        <div className="agent-card-grid">
          {items.map((item) => (
            <article className="agent-focus-card" key={`${title}-${item.insightId}`}>
              <div className="recommendation-header">
                <div>
                  <span className="metric-label">
                    {item.entityLabel ?? item.entityId}
                  </span>
                  <h3 className="list-row-title">{item.title}</h3>
                </div>

                <div className="recommendation-badges">
                  <span className={`pill ${mapPriorityPill(item.priorityBand)}`}>
                    {item.priorityBand}
                  </span>
                  <span className={`pill ${mapRiskPill(item.riskLevel)}`}>
                    risco {item.riskLevel}
                  </span>
                </div>
              </div>

              <p className="list-row-text">
                {level === 'technical'
                  ? item.technicalExplanation
                  : item.executiveExplanation}
              </p>

              <div className="agent-card-footer">
                <span>Priority {item.priorityScore.toFixed(0)}</span>
                <span>Confidence {(item.confidenceScore * 100).toFixed(0)}%</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function isOpportunityInsight(insight: LocalWorkspaceAgentInsightItem): boolean {
  const normalizedAction = insight.recommendedActionType.toLowerCase();
  const normalizedText = `${insight.title} ${insight.summary} ${insight.expectedImpact ?? ''}`.toLowerCase();

  return (
    normalizedAction === 'scale' ||
    normalizedAction === 'increase_budget' ||
    insight.severity === 'info' ||
    normalizedText.includes('oportunidade') ||
    normalizedText.includes('vencedor') ||
    normalizedText.includes('crescimento')
  );
}

function formatCategoryLabel(category: string): string {
  return category
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatHypothesisLabel(status: NonNullable<LocalWorkspaceAgentInsightItem['hypothesisStatus']>): string {
  switch (status) {
    case 'confirmed':
      return 'Hipotese confirmada';
    case 'plausible':
      return 'Hipotese plausivel';
    case 'weak':
      return 'Hipotese fraca';
    default:
      return 'Evidencia insuficiente';
  }
}

function mapPriorityPill(priority: LocalWorkspaceAgentInsightItem['priorityBand']): string {
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

function mapSeverityPill(severity: LocalWorkspaceAgentInsightItem['severity']): string {
  switch (severity) {
    case 'critical':
      return 'pill-warning';
    case 'warning':
      return 'pill-neutral';
    default:
      return 'pill-success';
  }
}

function mapRiskPill(riskLevel: LocalWorkspaceAgentInsightItem['riskLevel']): string {
  switch (riskLevel) {
    case 'high':
      return 'pill-warning';
    case 'medium':
      return 'pill-neutral';
    default:
      return 'pill-success';
  }
}

function mapRunStatusLabel(
  status: NonNullable<LocalWorkspaceAgentInsightsView['lastAnalysis']>['status'],
): string {
  switch (status) {
    case 'queued':
      return 'Na fila';
    case 'running':
      return 'Em execucao';
    case 'completed':
      return 'Concluida';
    default:
      return 'Falhou';
  }
}

function mapRunStatusPill(
  status: NonNullable<LocalWorkspaceAgentInsightsView['lastAnalysis']>['status'],
): string {
  switch (status) {
    case 'completed':
      return 'pill-success';
    case 'running':
      return 'pill-neutral';
    case 'queued':
      return 'pill-neutral';
    default:
      return 'pill-warning';
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
