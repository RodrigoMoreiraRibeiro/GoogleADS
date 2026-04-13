import type {
  LocalDemoSeedResponse,
  LocalWorkspacePeriod,
  LocalWorkspaceView,
  OptimizationAgentView,
} from '@googleads/shared';

import { httpGet, httpRequest } from '../api/http-client';

interface LocalWorkspaceQuery {
  readonly tenantSlug?: string | undefined;
  readonly clientId?: string | undefined;
  readonly period: LocalWorkspacePeriod;
}

export async function fetchLocalWorkspace(
  query: LocalWorkspaceQuery,
): Promise<LocalWorkspaceView> {
  const searchParams = new URLSearchParams();

  if (query.tenantSlug !== undefined) {
    searchParams.set('tenantSlug', query.tenantSlug);
  }

  if (query.clientId !== undefined) {
    searchParams.set('clientId', query.clientId);
  }

  searchParams.set('period', query.period);

  const response = await httpGet<LocalWorkspaceView>(
    `/analytics/local-demo/workspace?${searchParams.toString()}`,
  );

  return {
    ...response,
    optimizationAgent: normalizeOptimizationAgent(response),
  };
}

export async function seedLocalWorkspace(): Promise<LocalDemoSeedResponse> {
  return httpRequest<LocalDemoSeedResponse>('/analytics/local-demo/seed', {
    method: 'POST',
    csrfToken: 'local-dev-seed',
  });
}

function normalizeOptimizationAgent(
  workspace: Partial<LocalWorkspaceView>,
): OptimizationAgentView | null {
  const agent = workspace.optimizationAgent;

  if (agent === undefined || agent === null) {
    return null;
  }

  return {
    ...agent,
    recommendations: agent.recommendations ?? [],
  };
}
