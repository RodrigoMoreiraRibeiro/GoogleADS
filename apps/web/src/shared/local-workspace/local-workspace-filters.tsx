import type { LocalWorkspacePeriod, LocalWorkspaceView } from '@googleads/shared';

interface LocalWorkspaceFiltersProps {
  readonly workspace: LocalWorkspaceView;
  readonly selectedTenantSlug?: string | undefined;
  readonly selectedClientId?: string | undefined;
  readonly selectedPeriod: LocalWorkspacePeriod;
  readonly disabled?: boolean | undefined;
  readonly onTenantChange: (tenantSlug: string) => void;
  readonly onClientChange: (clientId: string) => void;
  readonly onPeriodChange: (period: LocalWorkspacePeriod) => void;
}

export function LocalWorkspaceFilters({
  workspace,
  selectedTenantSlug,
  selectedClientId,
  selectedPeriod,
  disabled = false,
  onTenantChange,
  onClientChange,
  onPeriodChange,
}: LocalWorkspaceFiltersProps) {
  return (
    <section className="surface surface-quiet">
      <div className="surface-header">
        <div>
          <h2 className="surface-title">Escopo local de teste</h2>
          <p className="section-copy">
            A UI continua local-first: tudo nesta tela vem do banco local e da
            saude dos jobs, nunca direto da Google Ads API.
          </p>
        </div>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span className="field-label">Agencia demo</span>
          <select
            className="field-select"
            disabled={disabled}
            value={selectedTenantSlug ?? workspace.context?.tenantSlug ?? ''}
            onChange={(event) => onTenantChange(event.target.value)}
          >
            {workspace.availableTenants.map((tenant) => (
              <option key={tenant.tenantId} value={tenant.tenantSlug}>
                {tenant.tenantName}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Cliente demo</span>
          <select
            className="field-select"
            disabled={disabled}
            value={selectedClientId ?? workspace.context?.clientId ?? ''}
            onChange={(event) => onClientChange(event.target.value)}
          >
            {workspace.availableClients.map((client) => (
              <option key={client.clientId} value={client.clientId}>
                {client.clientName}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Periodo</span>
          <select
            className="field-select"
            disabled={disabled}
            value={selectedPeriod}
            onChange={(event) =>
              onPeriodChange(event.target.value as LocalWorkspacePeriod)
            }
          >
            <option value="last_7d">Ultimos 7 dias</option>
            <option value="last_30d">Ultimos 30 dias</option>
          </select>
        </label>
      </div>
    </section>
  );
}
