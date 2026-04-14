import type {
  ExecutiveReportView,
  LocalWorkspacePeriod,
} from '@googleads/shared';

import { httpGet } from '../../../shared/api/http-client';

interface LocalExecutiveReportQuery {
  readonly tenantSlug?: string | undefined;
  readonly clientId?: string | undefined;
  readonly period: LocalWorkspacePeriod;
}

export async function fetchLocalExecutiveReport(
  query: LocalExecutiveReportQuery,
): Promise<ExecutiveReportView> {
  const searchParams = new URLSearchParams();

  if (query.tenantSlug !== undefined) {
    searchParams.set('tenantSlug', query.tenantSlug);
  }

  if (query.clientId !== undefined) {
    searchParams.set('clientId', query.clientId);
  }

  searchParams.set('period', query.period);

  return httpGet<ExecutiveReportView>(
    `/reports/local-demo/executive-deck?${searchParams.toString()}`,
  );
}
