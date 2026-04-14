import { Injectable } from '@nestjs/common';
import type { AgentFinding } from '@googleads/shared';

import type {
  DedupedFindingResult,
  PerformanceConflictRecord,
} from '../../domain/agents/performance-agent.types';
import {
  calculateConfidenceScore,
  clampNumber,
} from '../../domain/agents/performance-agent.utils';

@Injectable()
export class PerformanceAgentDedupeService {
  public dedupeFindings(
    findings: readonly AgentFinding[],
  ): DedupedFindingResult {
    if (findings.length === 0) {
      return {
        findings: [],
        conflicts: [],
      };
    }

    const grouped = new Map<string, AgentFinding[]>();

    for (const finding of findings) {
      const groupKey = [
        finding.entity_type,
        finding.entity_id,
        finding.category,
      ].join('|');

      const bucket = grouped.get(groupKey);

      if (bucket === undefined) {
        grouped.set(groupKey, [finding]);
        continue;
      }

      bucket.push(finding);
    }

    const deduped: AgentFinding[] = [];
    const conflicts: PerformanceConflictRecord[] = [];

    for (const [, group] of grouped) {
      const sorted = [...group].sort((left, right) => {
        if (right.priority_score !== left.priority_score) {
          return right.priority_score - left.priority_score;
        }

        if (right.confidence_score !== left.confidence_score) {
          return right.confidence_score - left.confidence_score;
        }

        return right.evidence.length - left.evidence.length;
      });

      const winner = sorted[0];

      if (winner === undefined) {
        continue;
      }

      const actionTypes = Array.from(
        new Set(sorted.map((finding) => finding.recommended_action.action_type)),
      );
      const sourceAgents = Array.from(
        new Set(sorted.flatMap((finding) => [finding.source_agent, ...finding.support_agent_names])),
      );

      if (actionTypes.length > 1) {
        conflicts.push({
          entityType: winner.entity_type,
          entityId: winner.entity_id,
          conflictType: hasHardActionConflict(actionTypes)
            ? 'hard_action_conflict'
            : 'soft_action_conflict',
          sourceAgents,
          resolution: `Mantido ${winner.recommended_action.action_type} com maior prioridade e confianca.`,
        });
      }

      deduped.push({
        ...winner,
        support_agent_names: Array.from(
          new Set([
            ...winner.support_agent_names,
            ...sorted
              .filter((finding) => finding.finding_id !== winner.finding_id)
              .map((finding) => finding.source_agent),
          ]),
        ),
        alternative_hypotheses: Array.from(
          new Set(sorted.flatMap((finding) => finding.alternative_hypotheses)),
        ).slice(0, 4),
        evidence: dedupeEvidence(sorted),
        data_gaps: Array.from(
          new Set(sorted.flatMap((finding) => finding.data_gaps)),
        ),
        tags: Array.from(new Set(sorted.flatMap((finding) => finding.tags))),
        confidence_score: clampNumber(
          calculateConfidenceScore({
            clicks: winner.evidence.length * 25,
            conversions: winner.evidence.length,
            spend: winner.priority_score,
          }),
          0,
          0.99,
        ),
      });
    }

    return {
      findings: deduped.sort((left, right) => right.priority_score - left.priority_score),
      conflicts,
    };
  }
}

function dedupeEvidence(findings: readonly AgentFinding[]) {
  const evidenceMap = new Map<string, AgentFinding['evidence'][number]>();

  for (const finding of findings) {
    for (const evidence of finding.evidence) {
      if (!evidenceMap.has(evidence.evidence_id)) {
        evidenceMap.set(evidence.evidence_id, evidence);
      }
    }
  }

  return Array.from(evidenceMap.values()).slice(0, 8);
}

function hasHardActionConflict(actionTypes: readonly string[]): boolean {
  const normalized = new Set(actionTypes);

  return (
    (normalized.has('scale') && normalized.has('reduce')) ||
    (normalized.has('scale') && normalized.has('pause')) ||
    (normalized.has('monitor') && normalized.has('pause'))
  );
}
