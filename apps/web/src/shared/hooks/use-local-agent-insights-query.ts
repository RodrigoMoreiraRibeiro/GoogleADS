import type { LocalWorkspacePeriod } from '@googleads/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchLocalAgentInsights } from '../local-workspace/local-agent-insights.api';

interface UseLocalAgentInsightsQueryInput {
  readonly tenantSlug?: string | undefined;
  readonly clientId?: string | undefined;
  readonly period: LocalWorkspacePeriod;
  readonly enabled?: boolean;
}

export function useLocalAgentInsightsQuery(
  input: UseLocalAgentInsightsQueryInput,
) {
  return useQuery({
    queryKey: [
      'local-agent-insights',
      input.tenantSlug,
      input.clientId,
      input.period,
    ],
    queryFn: () =>
      fetchLocalAgentInsights({
        tenantSlug: input.tenantSlug,
        clientId: input.clientId,
        period: input.period,
      }),
    enabled: input.enabled ?? true,
  });
}
