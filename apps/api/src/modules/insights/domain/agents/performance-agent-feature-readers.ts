import type {
  AgentFinding,
  ConsolidatedInsight,
} from '@googleads/shared';

import type {
  AccountWindowComparison,
  CampaignPerformanceSnapshot,
  PerformanceMetricsSnapshot,
  SearchTermPerformanceSnapshot,
  SegmentationPerformanceSnapshot,
  SyncHealthSnapshot,
} from './performance-agent.types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readMetricsSnapshot(
  value: unknown,
): PerformanceMetricsSnapshot | null {
  return isRecord(value) ? (value as unknown as PerformanceMetricsSnapshot) : null;
}

export function readCampaignSnapshots(
  value: unknown,
): CampaignPerformanceSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord) as unknown as CampaignPerformanceSnapshot[];
}

export function readAccountWindowComparisons(
  value: unknown,
): AccountWindowComparison[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord) as unknown as AccountWindowComparison[];
}

export function readSegmentationSnapshots(
  value: unknown,
): SegmentationPerformanceSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord) as unknown as SegmentationPerformanceSnapshot[];
}

export function readSearchTermSnapshots(
  value: unknown,
): SearchTermPerformanceSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord) as unknown as SearchTermPerformanceSnapshot[];
}

export function readSyncHealth(value: unknown): SyncHealthSnapshot | null {
  return isRecord(value) ? (value as unknown as SyncHealthSnapshot) : null;
}

export function readFindings(value: unknown): AgentFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord) as unknown as AgentFinding[];
}

export function readConsolidatedInsights(value: unknown): ConsolidatedInsight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord) as unknown as ConsolidatedInsight[];
}
