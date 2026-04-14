import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentFinding,
  AgentInput,
  PerformanceAgentEvidenceItem,
  PerformanceAgentHypothesisStatus,
} from '@googleads/shared';

import type { PerformanceAnalysisAgent } from '../../domain/agents/performance-analysis-agent.interface';
import { readFindings } from '../../domain/agents/performance-agent-feature-readers';
import type { PerformanceConflictRecord } from '../../domain/agents/performance-agent.types';
import {
  buildAgentOutput,
  clampNumber,
  scoreToConfidenceBand,
  scoreToPriorityBand,
} from '../../domain/agents/performance-agent.utils';

interface HypothesisReviewThresholds {
  readonly staleSyncPenalty: number;
  readonly dataGapPenalty: number;
  readonly missingBaselinePenalty: number;
  readonly softConflictPenalty: number;
  readonly hardConflictPenalty: number;
  readonly supportAgentBonus: number;
  readonly evidenceCountForConfirmed: number;
  readonly evidenceCountForPlausible: number;
  readonly confidenceForConfirmed: number;
  readonly confidenceForPlausible: number;
  readonly confidenceForWeak: number;
  readonly discardWeakBelowPriority: number;
  readonly discardInsufficientBelowPriority: number;
  readonly maxMergedEvidence: number;
}

interface ReviewResult {
  readonly finding: AgentFinding;
  readonly discarded: boolean;
  readonly discardReason: string | null;
}

@Injectable()
export class HypothesisReviewerAgent implements PerformanceAnalysisAgent {
  public readonly agentName = 'hypothesis_reviewer' as const;
  public readonly isRequired = true;

  private readonly logger = new Logger(HypothesisReviewerAgent.name);

  public async execute(input: AgentInput) {
    const proposedFindings = readFindings(input.features.review_queue_findings);
    const conflicts = readConflictRecords(input.features.review_queue_conflicts);

    if (proposedFindings.length === 0) {
      this.logger.warn('Hypothesis Reviewer without proposed findings.');

      return buildAgentOutput({
        agentName: this.agentName,
        agentVersion: input.agent_version,
        executionContext: input.execution_context,
        analysisWindow: input.analysis_window,
        status: 'insufficient_data',
        priorityScore: 0,
        confidenceScore: 0.35,
        dataQuality: input.data_quality,
        summary:
          'Nao ha achados suficientes para consolidar uma hipotese com seguranca.',
        recommendedFocus: 'Aguardar mais sinais locais antes de consolidar insight.',
        candidateEntityIds: [],
        findings: [],
        entitiesEvaluated: 0,
        findingsSuppressed: 0,
      });
    }

    const thresholds = readThresholds(input.thresholds);
    const mergedFindings = this.mergeSimilarFindings(proposedFindings, thresholds.maxMergedEvidence);
    const reviewResults = mergedFindings.map((finding) =>
      this.reviewFinding({
        finding,
        conflicts: conflicts.filter(
          (conflict) =>
            conflict.entityId === finding.entity_id && conflict.entityType === finding.entity_type,
        ),
        dataQuality: input.data_quality,
        thresholds,
      }),
    );

    const reviewedFindings = reviewResults
      .filter((result) => !result.discarded)
      .map((result) => result.finding)
      .sort((left, right) => {
        if (right.priority_score !== left.priority_score) {
          return right.priority_score - left.priority_score;
        }

        return right.confidence_score - left.confidence_score;
      });

    const discardedCount = reviewResults.filter((result) => result.discarded).length;
    const classificationSummary = summarizeStatuses(reviewedFindings);

    return buildAgentOutput({
      agentName: this.agentName,
      agentVersion: input.agent_version,
      executionContext: input.execution_context,
      analysisWindow: input.analysis_window,
      status: reviewedFindings.length > 0 ? 'ready' : 'skipped',
      priorityScore: reviewedFindings[0]?.priority_score ?? 34,
      confidenceScore:
        reviewedFindings.length > 0
          ? Math.max(...reviewedFindings.map((finding) => finding.confidence_score))
          : 0.42,
      dataQuality: input.data_quality,
      summary:
        reviewedFindings.length > 0
          ? `Achados revisados com classificacao: ${classificationSummary}.`
          : 'Os achados existentes nao sustentaram hipotese forte o suficiente para consolidacao.',
      recommendedFocus:
        reviewedFindings[0]?.recommended_action.description ??
        'Seguir monitorando o conjunto de achados antes de consolidar um insight.',
      candidateEntityIds: reviewedFindings.map((finding) => finding.entity_id),
      findings: reviewedFindings,
      entitiesEvaluated: mergedFindings.length,
      findingsSuppressed: discardedCount,
    });
  }

  private mergeSimilarFindings(
    findings: readonly AgentFinding[],
    maxMergedEvidence: number,
  ): AgentFinding[] {
    const grouped = new Map<string, AgentFinding[]>();

    for (const finding of findings) {
      const key = [
        finding.entity_type,
        finding.entity_id,
        finding.recommended_action.action_type,
      ].join('|');
      const bucket = grouped.get(key);

      if (bucket === undefined) {
        grouped.set(key, [finding]);
        continue;
      }

      bucket.push(finding);
    }

    return Array.from(grouped.values()).map((group) => {
      if (group.length === 1) {
        return group[0] as AgentFinding;
      }

      const sorted = [...group].sort((left, right) => {
        if (right.priority_score !== left.priority_score) {
          return right.priority_score - left.priority_score;
        }

        return right.confidence_score - left.confidence_score;
      });

      const winner = sorted[0] as AgentFinding;
      const mergedEvidence = dedupeEvidence(group.flatMap((finding) => finding.evidence)).slice(
        0,
        maxMergedEvidence,
      );
      const mergedSupport = Array.from(
        new Set(
          group.flatMap((finding) => [finding.source_agent, ...finding.support_agent_names]),
        ),
      ).filter((agentName) => agentName !== winner.source_agent);

      return {
        ...winner,
        support_agent_names: mergedSupport,
        alternative_hypotheses: Array.from(
          new Set(group.flatMap((finding) => finding.alternative_hypotheses)),
        ).slice(0, 5),
        evidence: mergedEvidence,
        data_gaps: Array.from(new Set(group.flatMap((finding) => finding.data_gaps))),
        tags: Array.from(new Set([...group.flatMap((finding) => finding.tags), 'merged_review'])),
        review_notes: Array.from(
          new Set([
            ...group.flatMap((finding) => finding.review_notes),
            `Merged ${group.length} achados similares em uma unica hipotese.`,
          ]),
        ),
      };
    });
  }

  private reviewFinding(input: {
    readonly finding: AgentFinding;
    readonly conflicts: readonly PerformanceConflictRecord[];
    readonly dataQuality: AgentInput['data_quality'];
    readonly thresholds: HypothesisReviewThresholds;
  }): ReviewResult {
    const notes: string[] = [...input.finding.review_notes];
    const dataGaps = new Set<string>(input.finding.data_gaps);
    const tags = new Set<string>(input.finding.tags);
    let confidenceScore = input.finding.confidence_score;

    if (input.dataQuality.is_sync_stale) {
      confidenceScore -= input.thresholds.staleSyncPenalty;
      notes.push('Confianca reduzida porque a sincronizacao local esta stale.');
      dataGaps.add('sync_stale_during_review');
    }

    if (!input.dataQuality.has_baseline || dataGaps.has('baseline_unavailable')) {
      confidenceScore -= input.thresholds.missingBaselinePenalty;
      notes.push('Confianca reduzida por falta de baseline comparavel.');
      dataGaps.add('baseline_missing_for_review');
    }

    const reviewableDataGaps = Array.from(dataGaps).filter(
      (gap) => !gap.includes('review') && !gap.includes('sync_stale'),
    );
    confidenceScore -= reviewableDataGaps.length * input.thresholds.dataGapPenalty;

    if (reviewableDataGaps.length > 0) {
      notes.push(`Confianca reduzida por ${reviewableDataGaps.length} gap(s) de dado no finding.`);
    }

    if (input.finding.support_agent_names.length > 0) {
      confidenceScore += Math.min(
        input.finding.support_agent_names.length * input.thresholds.supportAgentBonus,
        0.09,
      );
      notes.push('Confianca reforcada por convergencia entre especialistas.');
    }

    const hardConflict = input.conflicts.some((conflict) => conflict.conflictType === 'hard_action_conflict');
    const softConflict = !hardConflict && input.conflicts.some((conflict) => conflict.conflictType === 'soft_action_conflict');

    if (hardConflict) {
      confidenceScore -= input.thresholds.hardConflictPenalty;
      notes.push('Confianca reduzida por conflito forte entre agentes sobre a acao sugerida.');
      dataGaps.add('hard_agent_conflict');
      tags.add('hard_conflict_reviewed');
    } else if (softConflict) {
      confidenceScore -= input.thresholds.softConflictPenalty;
      notes.push('Confianca reduzida por conflito leve entre agentes.');
      dataGaps.add('soft_agent_conflict');
      tags.add('soft_conflict_reviewed');
    }

    const sanitizedHypothesis = softenUnsupportedLanguage(input.finding.primary_hypothesis);
    const sanitizedDiagnosis = softenUnsupportedLanguage(input.finding.diagnosis);
    const sanitizedTechnicalExplanation = softenUnsupportedLanguage(
      input.finding.technical_explanation,
    );
    const sanitizedExecutiveExplanation = softenUnsupportedLanguage(
      input.finding.executive_explanation,
    );

    if (sanitizedHypothesis !== input.finding.primary_hypothesis) {
      notes.push('Linguagem causal suavizada para refletir apenas causa provavel, nao causa confirmada.');
      tags.add('causality_softened');
    }

    confidenceScore = clampNumber(confidenceScore, 0.05, 0.99);
    const hypothesisStatus = classifyHypothesis({
      evidenceCount: input.finding.evidence.length,
      confidenceScore,
      thresholds: input.thresholds,
      hardConflict,
      dataGapCount: reviewableDataGaps.length + (hardConflict ? 1 : 0),
    });

    const reviewedFinding: AgentFinding = {
      ...input.finding,
      confidence_score: roundNumber(confidenceScore, 4),
      confidence_band: scoreToConfidenceBand(confidenceScore),
      priority_score: roundNumber(
        this.adjustPriority(input.finding.priority_score, hypothesisStatus, hardConflict),
        2,
      ),
      priority_band: scoreToPriorityBand(
        this.adjustPriority(input.finding.priority_score, hypothesisStatus, hardConflict),
      ),
      diagnosis: sanitizedDiagnosis,
      primary_hypothesis: sanitizedHypothesis,
      technical_explanation: sanitizedTechnicalExplanation,
      executive_explanation: sanitizedExecutiveExplanation,
      hypothesis_status: hypothesisStatus,
      review_notes: Array.from(new Set(notes)),
      data_gaps: Array.from(dataGaps),
      tags: Array.from(new Set([...tags, 'reviewed_hypothesis'])),
    };

    if (hypothesisStatus === 'insufficient_evidence') {
      return {
        finding: reviewedFinding,
        discarded:
          reviewedFinding.priority_score < input.thresholds.discardInsufficientBelowPriority,
        discardReason: 'insufficient_evidence',
      };
    }

    if (
      hypothesisStatus === 'weak' &&
      reviewedFinding.priority_score < input.thresholds.discardWeakBelowPriority
    ) {
      return {
        finding: reviewedFinding,
        discarded: true,
        discardReason: 'weak_low_priority',
      };
    }

    return {
      finding: reviewedFinding,
      discarded: false,
      discardReason: null,
    };
  }

  private adjustPriority(
    priorityScore: number,
    hypothesisStatus: PerformanceAgentHypothesisStatus,
    hasHardConflict: boolean,
  ): number {
    let adjusted = priorityScore;

    if (hypothesisStatus === 'plausible') {
      adjusted -= 4;
    } else if (hypothesisStatus === 'weak') {
      adjusted -= 10;
    } else if (hypothesisStatus === 'insufficient_evidence') {
      adjusted -= 18;
    }

    if (hasHardConflict) {
      adjusted -= 6;
    }

    return clampNumber(adjusted, 0, 100);
  }
}

function readThresholds(
  thresholds: AgentInput['thresholds'],
): HypothesisReviewThresholds {
  return {
    staleSyncPenalty: Number(thresholds.hypothesis_review_stale_sync_penalty ?? 0.08),
    dataGapPenalty: Number(thresholds.hypothesis_review_data_gap_penalty ?? 0.05),
    missingBaselinePenalty: Number(
      thresholds.hypothesis_review_missing_baseline_penalty ?? 0.1,
    ),
    softConflictPenalty: Number(
      thresholds.hypothesis_review_soft_conflict_penalty ?? 0.08,
    ),
    hardConflictPenalty: Number(
      thresholds.hypothesis_review_hard_conflict_penalty ?? 0.18,
    ),
    supportAgentBonus: Number(
      thresholds.hypothesis_review_support_agent_bonus ?? 0.03,
    ),
    evidenceCountForConfirmed: Number(
      thresholds.hypothesis_review_min_evidence_confirmed ?? 3,
    ),
    evidenceCountForPlausible: Number(
      thresholds.hypothesis_review_min_evidence_plausible ?? 2,
    ),
    confidenceForConfirmed: Number(
      thresholds.hypothesis_review_min_confidence_confirmed ?? 0.82,
    ),
    confidenceForPlausible: Number(
      thresholds.hypothesis_review_min_confidence_plausible ?? 0.62,
    ),
    confidenceForWeak: Number(
      thresholds.hypothesis_review_min_confidence_weak ?? 0.45,
    ),
    discardWeakBelowPriority: Number(
      thresholds.hypothesis_review_discard_weak_below_priority ?? 45,
    ),
    discardInsufficientBelowPriority: Number(
      thresholds.hypothesis_review_discard_insufficient_below_priority ?? 60,
    ),
    maxMergedEvidence: Number(thresholds.hypothesis_review_max_merged_evidence ?? 8),
  };
}

function classifyHypothesis(input: {
  readonly evidenceCount: number;
  readonly confidenceScore: number;
  readonly thresholds: HypothesisReviewThresholds;
  readonly hardConflict: boolean;
  readonly dataGapCount: number;
}): PerformanceAgentHypothesisStatus {
  if (
    input.evidenceCount === 0 ||
    input.confidenceScore < input.thresholds.confidenceForWeak ||
    input.dataGapCount >= 3
  ) {
    return 'insufficient_evidence';
  }

  if (
    !input.hardConflict &&
    input.evidenceCount >= input.thresholds.evidenceCountForConfirmed &&
    input.confidenceScore >= input.thresholds.confidenceForConfirmed
  ) {
    return 'confirmed';
  }

  if (
    input.evidenceCount >= input.thresholds.evidenceCountForPlausible &&
    input.confidenceScore >= input.thresholds.confidenceForPlausible
  ) {
    return 'plausible';
  }

  return 'weak';
}

function softenUnsupportedLanguage(text: string): string {
  return text
    .replace(/\bconfirma\b/gi, 'sugere')
    .replace(/\bconfirmado\b/gi, 'plausivel')
    .replace(/\bprova\b/gi, 'indicio')
    .replace(/\bcom certeza\b/gi, 'com boa chance')
    .replace(/\bcausa direta\b/gi, 'causa provavel');
}

function readConflictRecords(value: unknown): PerformanceConflictRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isConflictRecord);
}

function isConflictRecord(value: unknown): value is PerformanceConflictRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.entityType === 'string' &&
    typeof record.entityId === 'string' &&
    typeof record.conflictType === 'string' &&
    Array.isArray(record.sourceAgents) &&
    typeof record.resolution === 'string'
  );
}

function dedupeEvidence(
  evidence: readonly PerformanceAgentEvidenceItem[],
): PerformanceAgentEvidenceItem[] {
  return Array.from(
    new Map(evidence.map((item) => [item.evidence_id, item] as const)).values(),
  );
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summarizeStatuses(findings: readonly AgentFinding[]): string {
  const counts = new Map<PerformanceAgentHypothesisStatus, number>([
    ['confirmed', 0],
    ['plausible', 0],
    ['weak', 0],
    ['insufficient_evidence', 0],
  ]);

  for (const finding of findings) {
    counts.set(
      finding.hypothesis_status,
      (counts.get(finding.hypothesis_status) ?? 0) + 1,
    );
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');
}
