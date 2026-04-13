import type { LocalWorkspacePeriod } from '@googleads/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';

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

  const workspace = workspaceQuery.data;

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
            <h2 className="surface-title">Pipeline de relatorios executivos</h2>
            <p className="section-copy">
              Nesta etapa, a tela ja le os artefatos persistidos no banco local.
              Isso valida historico, status e metadata antes do renderer final.
            </p>
          </div>
        </div>

        {workspaceQuery.isLoading ? (
          <p className="muted-copy">Carregando relatorios locais...</p>
        ) : null}

        {workspace?.reports.length ? (
          <div className="list-stack">
            {workspace.reports.map((report) => (
              <div className="list-row" key={report.reportId}>
                <div>
                  <h3 className="list-row-title">{report.headline}</h3>
                  <p className="list-row-text">{report.periodLabel}</p>
                  <p className="list-row-text">
                    Gerado em{' '}
                    {report.generatedAt ? formatDateTime(report.generatedAt) : 'fila'}
                  </p>
                </div>
                <span className="pill pill-neutral">
                  {report.outputFormat.toUpperCase()} | {report.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="status-banner info">
            Nenhum relatorio local encontrado ainda. Rode o seed na tela de
            dashboard para validar este modulo.
          </div>
        )}
      </section>
    </>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
