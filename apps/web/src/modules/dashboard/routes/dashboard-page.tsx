import type {
  LocalWorkspaceCampaignItem,
  LocalWorkspacePeriod,
  OptimizationRecommendation,
} from '@googleads/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';

import { AgentInsightsPanel } from '../components/agent-insights-panel';
import {
  fetchLocalWorkspace,
  seedLocalWorkspace,
} from '../../../shared/local-workspace/local-workspace.api';
import { useLocalAgentInsightsQuery } from '../../../shared/hooks/use-local-agent-insights-query';
import { LocalWorkspaceFilters } from '../../../shared/local-workspace/local-workspace-filters';

export function DashboardPage() {
  const queryClient = useQueryClient();
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

  const seedMutation = useMutation({
    mutationFn: seedLocalWorkspace,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['local-workspace'],
      });
    },
  });

  const workspace = workspaceQuery.data;
  const workspaceWithContext =
    workspace !== undefined && workspace.context !== null ? workspace : null;
  const activeContext =
    workspace !== undefined && workspace.context !== null ? workspace.context : null;
  const agentInsightsQuery = useLocalAgentInsightsQuery({
    tenantSlug: activeContext?.tenantSlug ?? selectedTenantSlug,
    clientId: activeContext?.clientId ?? selectedClientId,
    period: selectedPeriod,
    enabled: workspaceWithContext !== null,
  });
  const optimizationAgent = workspaceWithContext?.optimizationAgent ?? null;
  const maxDailySpend = Math.max(
    ...((workspaceWithContext?.dailySeries ?? []).map((item) => item.spend)),
    1,
  );

  useEffect(() => {
    if (workspace === undefined || workspace.context === null) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    let shouldSyncSearch = false;

    if (searchParams.get('tenantSlug') !== workspace.context.tenantSlug) {
      nextSearchParams.set('tenantSlug', workspace.context.tenantSlug);
      shouldSyncSearch = true;
    }

    if (searchParams.get('clientId') !== workspace.context.clientId) {
      nextSearchParams.set('clientId', workspace.context.clientId);
      shouldSyncSearch = true;
    }

    if (searchParams.get('period') !== selectedPeriod) {
      nextSearchParams.set('period', selectedPeriod);
      shouldSyncSearch = true;
    }

    if (shouldSyncSearch) {
      setSearchParams(nextSearchParams, {
        replace: true,
      });
    }
  }, [searchParams, selectedPeriod, setSearchParams, workspace]);

  const notes = [
    {
      title: 'API web separada da API Google',
      text: 'Toda leitura da tela usa apenas agregados locais, fatos e saude de jobs. O navegador nao consulta a Google Ads API.',
    },
    {
      title: 'Seed local seguro e repetivel',
      text: 'O botao de popular base atua apenas nos tenants de demonstracao e nao reaproveita segredos reais nem refresh tokens do produto.',
    },
  ] as const;

  return (
    <>
      <section className="surface surface-quiet">
        <div className="surface-header">
          <div>
            <h2 className="surface-title">Como testar localmente</h2>
            <p className="section-copy">
              Primeiro popular a base local. Depois a UI passa a ler tenants,
              clientes, metricas, insights, relatorios e estado da sync direto do
              MySQL local.
            </p>
          </div>

          <button
            className="button-primary"
            type="button"
            disabled={seedMutation.isPending}
            onClick={() => seedMutation.mutate()}
          >
            {seedMutation.isPending ? 'Populando base...' : 'Popular base local'}
          </button>
        </div>

        <div
          className={`status-banner ${
            seedMutation.isError
              ? 'warning'
              : seedMutation.isSuccess
                ? 'success'
                : 'info'
          }`}
        >
          {seedMutation.isError
            ? 'Falha ao popular a base local. Confirme se o MySQL esta ativo e se o schema foi aplicado.'
            : seedMutation.isSuccess
              ? 'Base local populada com dados de demonstracao. O dashboard ja pode ser lido do banco.'
              : 'Este seed cria tenants e clientes de demonstracao para validar a plataforma sem depender da Google Ads API ainda.'}
        </div>
      </section>

      {workspaceQuery.isLoading ? (
        <section className="surface">
          <p className="muted-copy">Carregando workspace local...</p>
        </section>
      ) : null}

      {workspaceQuery.isError ? (
        <section className="surface">
          <div className="status-banner warning">
            A API local nao conseguiu ler o workspace. Se ainda nao rodou o seed,
            use o botao acima. Se ja rodou, reinicie a API local e confirme o
            acesso ao MySQL.
          </div>
        </section>
      ) : null}

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

      {workspace?.context === null ? (
        <section className="surface">
          <div className="empty-state">
            <h2 className="surface-title">Base local ainda vazia</h2>
            <p className="section-copy">
              Rode o seed para criar agencias, clientes, contas Google Ads
              simuladas, campanhas, insights e relatorios. Depois disso, a UI
              passa a refletir o banco local.
            </p>
          </div>
        </section>
      ) : null}

      {workspaceWithContext !== null && activeContext !== null ? (
        <>
          {workspaceWithContext.syncHealth !== null ? (
            <section className="surface surface-quiet">
              <div className="surface-header">
                <div>
                  <h2 className="surface-title">Recencia e integridade</h2>
                  <p className="section-copy">
                    Ultima base valida para {activeContext.clientName}. Quando a
                    sync ficar atrasada, a UI continua usando o ultimo snapshot
                    confiavel e avisa a recencia.
                  </p>
                </div>
              </div>

              <div
                className={`status-banner ${
                  workspaceWithContext.syncHealth.overallStatus === 'healthy'
                    ? 'success'
                    : workspaceWithContext.syncHealth.overallStatus === 'warning'
                      ? 'warning'
                      : 'info'
                }`}
              >
                {workspaceWithContext.syncHealth.summary}
              </div>
            </section>
          ) : null}

          <section className="surface">
            <div className="surface-header">
              <div>
                <h2 className="surface-title">Resumo do cliente local</h2>
                <p className="section-copy">
                  Janela de analise de {activeContext.periodStart} ate{' '}
                  {activeContext.periodEnd}. Seed mais recente
                  em{' '}
                  {activeContext.lastSeededAt
                    ? formatDateTime(activeContext.lastSeededAt)
                    : 'sem registro'}.
                </p>
              </div>
            </div>

            <div className="metric-grid">
              {workspaceWithContext.metricCards.map((metric) => (
                <article className="metric-item" key={metric.key}>
                  <span className="metric-label">{metric.label}</span>
                  <strong className="metric-value">{metric.value}</strong>
                  <span className="metric-trend">{metric.supportingText}</span>
                </article>
              ))}
            </div>
          </section>

          <AgentInsightsPanel
            data={agentInsightsQuery.data}
            isLoading={agentInsightsQuery.isLoading}
            isError={agentInsightsQuery.isError}
          />

          {optimizationAgent !== null ? (
            <section className="surface">
              <div className="surface-header">
                <div>
                  <h2 className="surface-title">Agente de otimizacao</h2>
                  <p className="section-copy">
                    Recomendacoes geradas a partir do banco local, com regras
                    deterministicas, prioridade e confianca. Nenhuma alteracao e
                    aplicada automaticamente.
                  </p>
                </div>

                <span
                  className={`pill ${
                    optimizationAgent.status === 'ready'
                      ? 'pill-success'
                      : 'pill-warning'
                  }`}
                >
                  {optimizationAgent.status === 'ready'
                    ? 'Pronto para revisao'
                    : 'Dados insuficientes'}
                </span>
              </div>

              <div className="status-banner info">
                {optimizationAgent.summary}
                <br />
                Foco sugerido:{' '}
                <strong>{optimizationAgent.recommendedFocus}</strong>
              </div>

              {optimizationAgent.recommendations.length === 0 ? (
                <div className="empty-state">
                  <h3 className="surface-title">Nenhuma mudanca forte agora</h3>
                  <p className="section-copy">
                    O agente prefere nao sugerir alteracoes quando a evidencia
                    ainda nao passou pelos thresholds minimos de seguranca.
                  </p>
                </div>
              ) : (
                <div className="recommendation-grid">
                  {optimizationAgent.recommendations.map((recommendation) => (
                    <RecommendationCard
                      key={recommendation.recommendationId}
                      recommendation={recommendation}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <div className="support-grid">
            <section className="surface">
              <div className="surface-header">
                <div>
                  <h2 className="surface-title">Serie diaria</h2>
                  <p className="section-copy">
                    Leitura local do agregado diario do cliente.
                  </p>
                </div>
              </div>

              <div className="series-list">
                {workspaceWithContext.dailySeries.map((point) => (
                  <div className="series-row" key={point.date}>
                    <div className="series-copy">
                      <strong>{formatDateShort(point.date)}</strong>
                      <span className="list-row-text">
                        {formatCurrency(point.spend)} investidos e{' '}
                        {formatCompact(point.conversions)} conversoes
                      </span>
                    </div>
                    <div className="series-bar">
                      <span
                        style={{
                          width: `${Math.max(
                            8,
                            Math.min(
                              100,
                              (point.spend / maxDailySpend) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="series-meta">
                      {point.roas === null ? 'Sem ROAS' : `${point.roas.toFixed(2)}x`}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="surface surface-quiet">
              <div className="surface-header">
                <div>
                  <h2 className="surface-title">Notas de arquitetura</h2>
                  <p className="section-copy">
                    Guardrails que seguem valendo no ambiente local.
                  </p>
                </div>
              </div>

              <div className="list-stack">
                {notes.map((item) => (
                  <div className="note-block" key={item.title}>
                    <strong>{item.title}</strong>
                    <span className="list-row-text">{item.text}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="surface">
            <div className="surface-header">
              <div>
                <h2 className="surface-title">Top campanhas</h2>
                <p className="section-copy">
                  Consolidadas do banco local para leitura rapida de volume,
                  eficiencia e oportunidade.
                </p>
              </div>
              <Link className="button-secondary" to="/reports">
                Ver relatorios
              </Link>
            </div>

            <div className="list-stack">
              {workspaceWithContext.topCampaigns.map((campaign) => (
                <CampaignRow campaign={campaign} key={campaign.campaignId} />
              ))}
            </div>
          </section>

          <section className="surface surface-quiet">
            <div className="surface-header">
              <div>
                <h2 className="surface-title">Proximos passos locais</h2>
                <p className="section-copy">
                  Ordem sugerida para sair do ambiente de demonstracao e avancar
                  para a integracao real.
                </p>
              </div>
            </div>

            <div className="list-stack">
              <div className="list-row">
                <div>
                  <h3 className="list-row-title">
                    Configurar credenciais reais da plataforma
                  </h3>
                  <p className="list-row-text">
                    Concluir Client ID, Client Secret, developer token e callback
                    seguro pelo painel admin antes de iniciar OAuth real.
                  </p>
                </div>
                <Link className="action-link" to="/admin/settings">
                  Abrir admin
                </Link>
              </div>

              <div className="list-row">
                <div>
                  <h3 className="list-row-title">
                    Validar conexoes simuladas e saude da sync
                  </h3>
                  <p className="list-row-text">
                    Use o modulo Google Ads para revisar as contas de
                    demonstracao, sync recente e o comportamento da fila local.
                  </p>
                </div>
                <Link className="action-link" to="/integrations/google-ads">
                  Ver integracoes
                </Link>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function CampaignRow({
  campaign,
}: {
  readonly campaign: LocalWorkspaceCampaignItem;
}) {
  return (
    <div className="list-row">
      <div>
        <h3 className="list-row-title">{campaign.campaignName}</h3>
        <p className="list-row-text">
          {formatCurrency(campaign.spend)} investidos,{' '}
          {formatCompact(campaign.conversions)} conversoes, CPA{' '}
          {campaign.cpa === null ? 'sem dado' : formatCurrency(campaign.cpa)}
        </p>
      </div>
      <span className="pill pill-neutral">
        {campaign.roas === null ? 'Sem ROAS' : `${campaign.roas.toFixed(2)}x`}
      </span>
    </div>
  );
}

function RecommendationCard({
  recommendation,
}: {
  readonly recommendation: OptimizationRecommendation;
}) {
  return (
    <article className="recommendation-card">
      <div className="recommendation-header">
        <div>
          <span className="metric-label">{recommendation.entityLabel}</span>
          <h3 className="list-row-title">{recommendation.title}</h3>
        </div>

        <div className="recommendation-badges">
          <span className={`pill ${mapPriorityPill(recommendation.priority)}`}>
            {recommendation.priority}
          </span>
          <span className={`pill ${mapRiskPill(recommendation.riskLevel)}`}>
            risco {recommendation.riskLevel}
          </span>
        </div>
      </div>

      <p className="list-row-text">{recommendation.summary}</p>

      <div className="recommendation-copy">
        <strong>Diagnostico</strong>
        <span className="list-row-text">{recommendation.diagnosis}</span>
      </div>

      <div className="recommendation-copy">
        <strong>Acao sugerida</strong>
        <span className="list-row-text">{recommendation.recommendedAction}</span>
      </div>

      <div className="recommendation-copy">
        <strong>Impacto esperado</strong>
        <span className="list-row-text">{recommendation.expectedImpact}</span>
      </div>

      <div className="recommendation-meta">
        <span>
          Confianca {(recommendation.confidenceScore * 100).toFixed(0)}%
        </span>
        <span>Score {recommendation.priorityScore.toFixed(0)}</span>
      </div>

      <div className="evidence-grid">
        {recommendation.evidence.slice(0, 3).map((evidence) => (
          <div className="evidence-chip" key={`${recommendation.recommendationId}-${evidence.metric}`}>
            <strong>{evidence.label}</strong>
            <span className="evidence-value">
              {formatEvidenceValue(evidence.metric, evidence.currentValue)}
              {evidence.deltaPct === null
                ? ''
                : ` | ${evidence.deltaPct >= 0 ? '+' : ''}${evidence.deltaPct.toFixed(1)}%`}
            </span>
            <span className="list-row-text">{evidence.note}</span>
          </div>
        ))}
      </div>

      <div className="recommendation-copy">
        <strong>Versao executiva</strong>
        <span className="list-row-text">{recommendation.executiveExplanation}</span>
      </div>
    </article>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

function formatDateShort(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatEvidenceValue(metric: string, value: number | null): string {
  if (value === null) {
    return 'Sem base';
  }

  switch (metric) {
    case 'spend':
    case 'cpa':
      return formatCurrency(value);
    case 'roas':
      return `${value.toFixed(2)}x`;
    case 'ctr':
    case 'search_impression_share':
      return `${(value * 100).toFixed(1)}%`;
    case 'clicks':
    case 'conversions':
      return formatCompact(value);
    default:
      return value.toFixed(2);
  }
}

function mapPriorityPill(priority: OptimizationRecommendation['priority']): string {
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

function mapRiskPill(riskLevel: OptimizationRecommendation['riskLevel']): string {
  switch (riskLevel) {
    case 'high':
      return 'pill-warning';
    case 'medium':
      return 'pill-neutral';
    default:
      return 'pill-success';
  }
}
