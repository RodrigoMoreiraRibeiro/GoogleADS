import type { LocalWorkspacePeriod } from '@googleads/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';

import { fetchLocalWorkspace } from '../../../shared/local-workspace/local-workspace.api';
import { LocalWorkspaceFilters } from '../../../shared/local-workspace/local-workspace-filters';

export function GoogleAdsConnectionsPage() {
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
            <h2 className="surface-title">Contas Google Ads no banco local</h2>
            <p className="section-copy">
              O modulo exibe conexoes e contas persistidas localmente. Mesmo
              quando o OAuth real entrar, a UI continuara lendo o estado salvo no
              backend.
            </p>
          </div>
          <Link className="button-secondary" to="/admin/settings">
            Abrir configuracao global
          </Link>
        </div>

        {workspaceQuery.isLoading ? (
          <p className="muted-copy">Carregando contas locais...</p>
        ) : null}

        {workspace?.connections.length ? (
          <div className="list-stack">
            {workspace.connections.map((connection) => (
              <div className="list-row" key={connection.accountId}>
                <div>
                  <h3 className="list-row-title">{connection.customerName}</h3>
                  <p className="list-row-text">
                    Cliente ID {connection.customerId} | {connection.descriptiveName}
                  </p>
                  <p className="list-row-text">
                    Ultima sync de metricas:{' '}
                    {connection.lastMetricSyncAt
                      ? formatDateTime(connection.lastMetricSyncAt)
                      : 'sem sync'}
                  </p>
                </div>
                <span className="pill pill-neutral">
                  {connection.accountStatus}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="status-banner info">
            Nenhuma conta local encontrada ainda. Rode o seed na tela de dashboard
            para criar contas demo e validar este modulo.
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
