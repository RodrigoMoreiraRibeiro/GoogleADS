import type {
  LocalWorkspaceAgentInsightsView,
  LocalWorkspacePeriod,
} from '@googleads/shared';

import { httpGet } from '../api/http-client';

interface LocalAgentInsightsQuery {
  readonly tenantSlug?: string | undefined;
  readonly clientId?: string | undefined;
  readonly period: LocalWorkspacePeriod;
}

export async function fetchLocalAgentInsights(
  query: LocalAgentInsightsQuery,
): Promise<LocalWorkspaceAgentInsightsView> {
  const searchParams = new URLSearchParams();

  if (query.tenantSlug !== undefined) {
    searchParams.set('tenantSlug', query.tenantSlug);
  }

  if (query.clientId !== undefined) {
    searchParams.set('clientId', query.clientId);
  }

  searchParams.set('period', query.period);

  return httpGet<LocalWorkspaceAgentInsightsView>(
    `/analytics/local-demo/agent-insights?${searchParams.toString()}`,
  );
}
