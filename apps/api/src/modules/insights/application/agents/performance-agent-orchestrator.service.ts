import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentFinding,
  AgentInput,
  AgentOutput,
  ConsolidatedInsight,
  PerformanceAgentJsonValue,
  PerformanceAgentSummary,
} from '@googleads/shared';

import { createDeterministicHash, scoreToConfidenceBand, scoreToPriorityBand } from '../../domain/agents/performance-agent.utils';
import type {
  PerformanceAnalysisRunContext,
  PerformanceConsolidatedInsightDraft,
  PerformanceFeatureBundle,
  PerformanceAgentExecutionResult,
  PerformanceConflictRecord,
} from '../../domain/agents/performance-agent.types';
import { PerformanceAgentFeatureReaderRepository } from '../../infrastructure/agents/performance-agent-feature-reader.repository';
import { AccountAuditorAgent } from './account-auditor.agent';
import { CampaignStrategistAgent } from './campaign-strategist.agent';
import { CreativePerformanceAgent } from './creative-performance.agent';
import {
  buildExecutiveSummaryProjection,
  ExecutiveSummaryAgent,
} from './executive-summary.agent';
import { HypothesisReviewerAgent } from './hypothesis-reviewer.agent';
import { PerformanceAgentDedupeService } from './performance-agent-dedupe.service';
import { PerformanceAgentPayloadBuilderService } from './performance-agent-payload-builder.service';
import { PerformanceAgentPersistenceService } from './performance-agent-persistence.service';
import { PerformanceAgentRuntimeConfigService } from './performance-agent-runtime-config.service';
import { SearchTermsSpecialistAgent } from './search-terms-specialist.agent';
import { SegmentationSpecialistAgent } from './segmentation-specialist.agent';

@Injectable()
export class PerformanceAgentOrchestratorService {
  private readonly logger = new Logger(PerformanceAgentOrchestratorService.name);

  public constructor(
    private readonly featureReaderRepository: PerformanceAgentFeatureReaderRepository,
    private readonly runtimeConfigService: PerformanceAgentRuntimeConfigService,
    private readonly payloadBuilderService: PerformanceAgentPayloadBuilderService,
    private readonly dedupeService: PerformanceAgentDedupeService,
    private readonly persistenceService: PerformanceAgentPersistenceService,
    private readonly accountAuditorAgent: AccountAuditorAgent,
    private readonly campaignStrategistAgent: CampaignStrategistAgent,
    private readonly segmentationSpecialistAgent: SegmentationSpecialistAgent,
    private readonly searchTermsSpecialistAgent: SearchTermsSpecialistAgent,
    private readonly creativePerformanceAgent: CreativePerformanceAgent,
    private readonly hypothesisReviewerAgent: HypothesisReviewerAgent,
    private readonly executiveSummaryAgent: ExecutiveSummaryAgent,
  ) {}

  public async runAnalysis(
    analysisRunId: string,
    options?: {
      readonly requestId?: string | null;
      readonly correlationId?: string | null;
    },
  ): Promise<PerformanceAgentExecutionResult> {
    const orchestratorRunUuid = randomUUID();
    const runtimeConfig = this.runtimeConfigService.getRuntimeConfig();

    await this.persistenceService.beginAnalysisRun({
      analysisRunId,
      orchestratorRunUuid,
    });

    try {
      const runContext =
        await this.featureReaderRepository.loadRunContext(analysisRunId);
      const featureBundle =
        await this.featureReaderRepository.loadFeatureBundle(runContext);
      const dataQuality = this.buildDataQuality(featureBundle, runtimeConfig.thresholds);

      const agentOutputs: AgentOutput[] = [];
      const partialFailures: Array<{
        readonly agentName: AgentOutput['agent_name'];
        readonly reason: string;
      }> = [];

      for (const agent of [
        this.accountAuditorAgent,
        this.campaignStrategistAgent,
        this.segmentationSpecialistAgent,
        this.searchTermsSpecialistAgent,
        this.creativePerformanceAgent,
      ]) {
        const output = await this.executeAgent({
          agent,
          analysisRunId,
          orchestratorRunUuid,
          runContext,
          dataQuality,
          runtimeConfig,
          features: this.buildBaseFeatures(featureBundle),
          upstreamOutputs: agentOutputs,
          requestId: options?.requestId ?? null,
          correlationId: options?.correlationId ?? null,
          partialFailures,
        });

        if (output !== null) {
          agentOutputs.push(output);
        }
      }

      const dedupedFindings = this.dedupeService.dedupeFindings(
        agentOutputs.flatMap((output) => output.findings),
      );

      await this.persistenceService.persistConflicts({
        analysisRunId,
        orchestratorRunUuid,
        tenantId: runContext.tenantId,
        clientId: runContext.clientId,
        accountId: runContext.accountId,
        conflicts: dedupedFindings.conflicts,
      });

      const reviewerOutput = await this.executeAgent({
        agent: this.hypothesisReviewerAgent,
        analysisRunId,
        orchestratorRunUuid,
        runContext,
        dataQuality,
        runtimeConfig,
        features: {
          ...this.buildBaseFeatures(featureBundle),
          review_queue_findings: toJsonValue(dedupedFindings.findings),
          review_queue_conflicts: toJsonValue(dedupedFindings.conflicts),
        },
        upstreamOutputs: agentOutputs,
        requestId: options?.requestId ?? null,
        correlationId: options?.correlationId ?? null,
        partialFailures,
      });

      if (reviewerOutput !== null) {
        agentOutputs.push(reviewerOutput);
      }

      const consolidatedInsightDrafts = (reviewerOutput?.findings ?? []).map(
        (finding) =>
          this.buildConsolidatedInsightDraft(runContext, dataQuality, finding),
      );
      const consolidatedInsights = consolidatedInsightDrafts.map((draft) =>
        this.buildConsolidatedInsight(draft),
      );

      const executiveOutput = await this.executeAgent({
        agent: this.executiveSummaryAgent,
        analysisRunId,
        orchestratorRunUuid,
        runContext,
        dataQuality,
        runtimeConfig,
        features: {
          ...this.buildBaseFeatures(featureBundle),
          consolidated_insights: toJsonValue(consolidatedInsights),
          reviewed_findings: toJsonValue(reviewerOutput?.findings ?? []),
        },
        upstreamOutputs: agentOutputs,
        requestId: options?.requestId ?? null,
        correlationId: options?.correlationId ?? null,
        partialFailures,
      });

      if (executiveOutput !== null) {
        agentOutputs.push(executiveOutput);
      }

      const persistedInsights =
        await this.persistenceService.upsertConsolidatedInsights(
          consolidatedInsightDrafts.map((draft) => ({
            consolidatedInsight: draft,
            sourceRunId: analysisRunId,
          })),
        );

      const summary = this.buildSummary({
        runContext,
        consolidatedInsights,
        reviewedFindings: reviewerOutput?.findings ?? [],
        executiveOutput,
      });

      await this.persistenceService.completeAnalysisRun({
        analysisRunId,
        status: 'completed',
        summaryJson: summary as unknown as PerformanceAgentJsonValue,
      });

      return {
        orchestratorRunUuid,
        analysisRunId,
        summary,
        agentOutputs,
        persistedInsights,
        partialFailures,
      };
    } catch (error) {
      await this.persistenceService.completeAnalysisRun({
        analysisRunId,
        status: 'failed',
      });

      this.logger.error(
        `Performance agent orchestrator failed for analysis run ${analysisRunId}.`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  private async executeAgent(input: {
    readonly agent: {
      readonly agentName: AgentOutput['agent_name'];
      readonly isRequired: boolean;
      execute(agentInput: AgentInput): Promise<AgentOutput>;
    };
    readonly analysisRunId: string;
    readonly orchestratorRunUuid: string;
    readonly runContext: PerformanceAnalysisRunContext;
    readonly dataQuality: AgentOutput['data_quality'];
    readonly runtimeConfig: ReturnType<PerformanceAgentRuntimeConfigService['getRuntimeConfig']>;
    readonly features: Record<string, PerformanceAgentJsonValue>;
    readonly upstreamOutputs: readonly AgentOutput[];
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly partialFailures: Array<{
      readonly agentName: AgentOutput['agent_name'];
      readonly reason: string;
    }>;
  }): Promise<AgentOutput | null> {
    const agentVersion = input.runtimeConfig.orchestratorVersion;
    const agentRun = await this.persistenceService.persistAgentRunStart({
      analysisRunId: input.analysisRunId,
      orchestratorRunUuid: input.orchestratorRunUuid,
      agentName: input.agent.agentName,
      agentVersion,
      tenantId: input.runContext.tenantId,
      clientId: input.runContext.clientId,
      accountId: input.runContext.accountId,
      analysisWindow: {
        analysis_window_label: 'analysis_run',
        period_start: input.runContext.periodStart,
        period_end: input.runContext.periodEnd,
        baseline_start: input.runContext.baselineStart,
        baseline_end: input.runContext.baselineEnd,
        comparison_label: input.runContext.comparisonLabel,
      },
      dataQuality: input.dataQuality,
      dedupeKey: createDeterministicHash({
        analysis_run_id: input.analysisRunId,
        agent_name: input.agent.agentName,
        agent_version: agentVersion,
        period_start: input.runContext.periodStart,
        period_end: input.runContext.periodEnd,
      }),
    });

    try {
      this.logger.log(
        `Running ${input.agent.agentName} for analysis run ${input.analysisRunId}.`,
      );

      const payload = this.payloadBuilderService.buildInput({
        agentName: input.agent.agentName,
        agentVersion,
        runContext: input.runContext,
        dataQuality: input.dataQuality,
        thresholds: input.runtimeConfig.thresholds,
        features: input.features,
        upstreamOutputs: input.upstreamOutputs,
        requestId: input.requestId,
        correlationId: input.correlationId,
      });
      const output = await input.agent.execute(payload);

      await this.persistenceService.persistAgentRunSuccess({
        agentRunId: agentRun.agentRunId,
        output,
      });

      return output;
    } catch (error) {
      const reason = normalizeErrorMessage(error);

      input.partialFailures.push({
        agentName: input.agent.agentName,
        reason,
      });

      await this.persistenceService.persistAgentRunFailure({
        agentRunId: agentRun.agentRunId,
        status: 'failed',
        priorityScore: 0,
        confidenceScore: 0,
        summary: `Falha ao executar ${input.agent.agentName}.`,
        errorCode: error instanceof Error ? error.name : 'AgentExecutionError',
        errorMessage: reason,
        outputJson: {
          agent_name: input.agent.agentName,
          analysis_run_id: input.analysisRunId,
          orchestrator_run_uuid: input.orchestratorRunUuid,
          error_message: reason,
        },
      });

      this.logger.error(
        `Agent ${input.agent.agentName} failed for analysis run ${input.analysisRunId}.`,
        error instanceof Error ? error.stack : undefined,
      );

      if (input.agent.isRequired) {
        throw error;
      }

      return null;
    }
  }

  private buildDataQuality(
    featureBundle: PerformanceFeatureBundle,
    thresholds: Record<string, string | number | boolean | null>,
  ): AgentOutput['data_quality'] {
    const warnings: string[] = [];
    const staleSyncHours = Number(thresholds.stale_sync_hours ?? 18);
    const lastSyncAgeHours =
      featureBundle.sync_health?.lastSuccessfulSyncAt === null ||
      featureBundle.sync_health?.lastSuccessfulSyncAt === undefined
        ? Number.POSITIVE_INFINITY
        : (Date.now() -
            new Date(featureBundle.sync_health.lastSuccessfulSyncAt).getTime()) /
          3_600_000;

    if (featureBundle.account_summary_baseline === null) {
      warnings.push('baseline_unavailable');
    }

    if (
      featureBundle.sync_health?.overallStatus === 'stale' ||
      lastSyncAgeHours > staleSyncHours
    ) {
      warnings.push('sync_stale');
    }

    if ((featureBundle.sync_health?.openIssues ?? 0) > 0) {
      warnings.push('sync_open_issues');
    }

    return {
      is_sync_stale: warnings.includes('sync_stale'),
      has_minimum_volume:
        (featureBundle.account_summary_current?.clicks ?? 0) >=
          Number(thresholds.min_campaign_clicks ?? 30) &&
        (featureBundle.account_summary_current?.spend ?? 0) > 0,
      has_baseline: featureBundle.account_summary_baseline !== null,
      warnings,
    };
  }

  private buildBaseFeatures(
    featureBundle: PerformanceFeatureBundle,
  ): Record<string, PerformanceAgentJsonValue> {
    return {
      account_summary_current: toJsonValue(featureBundle.account_summary_current),
      account_summary_baseline: toJsonValue(featureBundle.account_summary_baseline),
      account_window_comparisons: toJsonValue(
        featureBundle.account_window_comparisons,
      ),
      campaign_summaries_current: toJsonValue(
        featureBundle.campaign_summaries_current,
      ),
      campaign_summaries_baseline: toJsonValue(
        featureBundle.campaign_summaries_baseline,
      ),
      segmentation_rows_current: toJsonValue(
        featureBundle.segmentation_rows_current,
      ),
      segmentation_rows_baseline: toJsonValue(
        featureBundle.segmentation_rows_baseline,
      ),
      search_terms_available: featureBundle.search_terms_available,
      search_term_rows_current: toJsonValue(
        featureBundle.search_term_rows_current,
      ),
      search_term_rows_baseline: toJsonValue(
        featureBundle.search_term_rows_baseline,
      ),
      sync_health: toJsonValue(featureBundle.sync_health),
    };
  }

  private buildConsolidatedInsightDraft(
    runContext: PerformanceAnalysisRunContext,
    dataQuality: AgentOutput['data_quality'],
    finding: AgentFinding,
  ): PerformanceConsolidatedInsightDraft {
    return {
      tenantId: runContext.tenantId,
      clientId: runContext.clientId,
      accountId: runContext.accountId,
      entityType: finding.entity_type,
      entityId: finding.entity_id,
      entityLabel: finding.entity_label,
      category: finding.category,
      severity: finding.severity,
      priorityBand: finding.priority_band,
      priorityScore: finding.priority_score,
      confidenceScore: finding.confidence_score,
      confidenceBand: finding.confidence_band,
      riskLevel: finding.risk_level,
      sourceAgentNames: Array.from(
        new Set([finding.source_agent, ...finding.support_agent_names, 'hypothesis_reviewer']),
      ),
      title: finding.title,
      summary: finding.summary,
      diagnosis: finding.diagnosis,
      primaryHypothesis: finding.primary_hypothesis,
      alternativeHypotheses: finding.alternative_hypotheses,
      hypothesisStatus: finding.hypothesis_status,
      recommendedAction: {
        actionType: finding.recommended_action.action_type,
        actionTarget: finding.recommended_action.action_target,
        description: finding.recommended_action.description,
      },
      expectedImpact: finding.expected_impact,
      technicalExplanation: finding.technical_explanation,
      executiveExplanation: finding.executive_explanation,
      evidenceJson: finding.evidence.map((evidence) => ({
        evidence_id: evidence.evidence_id,
        metric: evidence.metric,
        current_value: evidence.current_value,
        baseline_value: evidence.baseline_value,
        delta_pct: evidence.delta_pct,
        threshold_value: evidence.threshold_value,
        window: evidence.window,
        scope_label: evidence.scope_label,
        source_table: evidence.source_table,
        note: evidence.note,
      })),
      reviewNotes: finding.review_notes,
      blockedClaims: finding.data_gaps,
      nextSteps: [finding.recommended_action.description],
      analysisWindow: {
        analysis_window_label: 'analysis_run',
        period_start: runContext.periodStart,
        period_end: runContext.periodEnd,
        baseline_start: runContext.baselineStart,
        baseline_end: runContext.baselineEnd,
        comparison_label: runContext.comparisonLabel,
      },
      dataQuality,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildConsolidatedInsight(
    draft: PerformanceConsolidatedInsightDraft,
  ): ConsolidatedInsight {
    return {
      insight_id: createDeterministicHash({
        tenant_id: draft.tenantId,
        client_id: draft.clientId,
        entity_type: draft.entityType,
        entity_id: draft.entityId,
        category: draft.category,
        generated_at: draft.generatedAt,
      }).slice(0, 24),
      insight_key: createDeterministicHash({
        tenant_id: draft.tenantId,
        client_id: draft.clientId,
        entity_type: draft.entityType,
        entity_id: draft.entityId,
        category: draft.category,
        action_type: draft.recommendedAction.actionType,
      }),
      tenant_id: draft.tenantId,
      client_id: draft.clientId,
      account_id: draft.accountId,
      entity_type: draft.entityType as ConsolidatedInsight['entity_type'],
      entity_id: draft.entityId,
      entity_label: draft.entityLabel,
      category: draft.category as ConsolidatedInsight['category'],
      severity: draft.severity,
      priority_band: scoreToPriorityBand(draft.priorityScore),
      priority_score: draft.priorityScore,
      confidence_band: scoreToConfidenceBand(draft.confidenceScore),
      confidence_score: draft.confidenceScore,
      risk_level: draft.riskLevel,
      source_agent_names: draft.sourceAgentNames,
      title: draft.title,
      summary: draft.summary,
      diagnosis: draft.diagnosis,
      primary_hypothesis: draft.primaryHypothesis,
      alternative_hypotheses: draft.alternativeHypotheses,
      hypothesis_status: draft.hypothesisStatus,
      recommended_action: {
        action_type: draft.recommendedAction.actionType,
        action_target: draft.recommendedAction.actionTarget,
        description: draft.recommendedAction.description,
        execution_mode: 'manual',
      },
      expected_impact: draft.expectedImpact,
      technical_explanation: draft.technicalExplanation,
      executive_explanation: draft.executiveExplanation,
      evidence: draft.evidenceJson.map(
        (item) => item as ConsolidatedInsight['evidence'][number],
      ),
      review_notes: draft.reviewNotes,
      supporting_finding_ids: [],
      blocked_claims: draft.blockedClaims,
      next_steps: draft.nextSteps,
      analysis_window: draft.analysisWindow,
      data_quality: draft.dataQuality,
      generated_at: draft.generatedAt,
    };
  }

  private buildSummary(input: {
    readonly runContext: PerformanceAnalysisRunContext;
    readonly consolidatedInsights: readonly ConsolidatedInsight[];
    readonly reviewedFindings: readonly AgentFinding[];
    readonly executiveOutput: AgentOutput | null;
  }): PerformanceAgentSummary {
    const projection = buildExecutiveSummaryProjection({
      consolidatedInsights: input.consolidatedInsights,
      reviewedFindings: input.reviewedFindings,
    });

    return {
      tenant_id: input.runContext.tenantId,
      client_id: input.runContext.clientId,
      account_id: input.runContext.accountId,
      generated_at: new Date().toISOString(),
      technical_headline:
        input.executiveOutput?.summary ??
        projection.technical_headline,
      executive_headline:
        input.executiveOutput?.recommended_focus ??
        projection.executive_headline,
      technical_bullets: projection.technical_bullets,
      executive_bullets: projection.executive_bullets,
      next_steps: projection.next_steps,
      technical_summary: projection.technical_summary,
      executive_summary: projection.executive_summary,
      report_narrative: projection.report_narrative,
      top_problems: projection.top_problems,
      top_opportunities: projection.top_opportunities,
      slide_outline: projection.slide_outline,
      insights: input.consolidatedInsights,
      supporting_findings: input.reviewedFindings,
    };
  }
}

function toJsonValue(value: unknown): PerformanceAgentJsonValue {
  return (value as unknown as PerformanceAgentJsonValue) ?? null;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Erro desconhecido na execucao do agente.';
}
