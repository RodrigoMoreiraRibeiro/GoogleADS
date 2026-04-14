import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ConsolidatedInsight, PerformanceAgentJsonValue } from '@googleads/shared';

import { PrismaService } from '../../../../common/database/prisma.service';
import type {
  AnalysisRunComparisonItem,
  AnalysisRunComparisonResult,
  AnalysisRunHistoryListItem,
  AnalysisRunInsightSnapshot,
  AgentOutputHistoryItem,
  PersistAgentRunFailureInput,
  PersistAgentRunStartInput,
  PersistAgentRunSuccessInput,
  PersistedInsightSnapshotRecord,
  PersistedAgentRunRecord,
  PerformanceConflictRecord,
  PerformanceInsightUpsertRecord,
} from '../../domain/agents/performance-agent.types';
import {
  createDeterministicHash,
  scoreToConfidenceBand,
} from '../../domain/agents/performance-agent.utils';

interface InsightRunLockRow {
  readonly id: bigint;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
}

interface AgentRunRow {
  readonly agentRunId: bigint;
  readonly dedupeKey: string;
}

interface ExistingInsightRow {
  readonly insightId: bigint;
  readonly currentVersionNumber: number;
  readonly latestVersionId: bigint | null;
  readonly latestVersionNumber: number | null;
  readonly latestContentHash: string | null;
  readonly currentStatus: 'open' | 'accepted' | 'dismissed' | 'implemented';
}

@Injectable()
export class PerformanceAgentPersistenceService {
  private readonly logger = new Logger(PerformanceAgentPersistenceService.name);

  public constructor(private readonly prismaService: PrismaService) {}

  public async beginAnalysisRun(input: {
    readonly analysisRunId: string;
    readonly orchestratorRunUuid: string;
  }): Promise<void> {
    await this.prismaService.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<InsightRunLockRow[]>`
        SELECT id, status
        FROM insight_runs
        WHERE id = ${Number(input.analysisRunId)}
        FOR UPDATE
      `;

      const row = rows[0];

      if (row === undefined) {
        throw new NotFoundException('analysis_run_id nao encontrado.');
      }

      if (row.status === 'running') {
        throw new ConflictException(
          'Esse analysis_run_id ja esta em execucao por outro processo.',
        );
      }

      if (row.status === 'completed') {
        throw new ConflictException(
          'Esse analysis_run_id ja foi concluido. Gere um novo run para recalcular.',
        );
      }

      await transaction.$executeRaw`
        UPDATE insight_runs
        SET status = 'running',
            orchestrator_run_uuid = ${input.orchestratorRunUuid},
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            finished_at = NULL
        WHERE id = ${Number(input.analysisRunId)}
      `;
    });

    this.logger.log(
      `Analysis run ${input.analysisRunId} locked for orchestrator ${input.orchestratorRunUuid}.`,
    );
  }

  public async completeAnalysisRun(input: {
    readonly analysisRunId: string;
    readonly status: 'completed' | 'failed';
    readonly summaryJson?: unknown | null;
  }): Promise<void> {
    if (input.summaryJson === undefined) {
      await this.prismaService.$executeRaw`
        UPDATE insight_runs
        SET status = ${input.status},
            finished_at = CURRENT_TIMESTAMP
        WHERE id = ${Number(input.analysisRunId)}
      `;

      return;
    }

    await this.prismaService.$executeRaw`
      UPDATE insight_runs
      SET status = ${input.status},
          summary_json = CAST(${JSON.stringify(input.summaryJson)} AS JSON),
          finished_at = CURRENT_TIMESTAMP
      WHERE id = ${Number(input.analysisRunId)}
    `;
  }

  public async persistAgentRunStart(
    input: PersistAgentRunStartInput,
  ): Promise<PersistedAgentRunRecord> {
    await this.prismaService.$executeRaw`
      INSERT INTO agent_runs (
        tenant_id,
        client_id,
        google_ads_account_id,
        insight_run_id,
        orchestrator_run_uuid,
        agent_name,
        agent_version,
        dedupe_key,
        status,
        analysis_window_json,
        data_quality_json,
        started_at
      ) VALUES (
        ${Number(input.tenantId)},
        ${Number(input.clientId)},
        ${nullableBigint(input.accountId)},
        ${Number(input.analysisRunId)},
        ${input.orchestratorRunUuid},
        ${input.agentName},
        ${input.agentVersion},
        ${input.dedupeKey},
        'running',
        CAST(${JSON.stringify(input.analysisWindow)} AS JSON),
        CAST(${JSON.stringify(input.dataQuality)} AS JSON),
        CURRENT_TIMESTAMP
      )
      ON DUPLICATE KEY UPDATE
        orchestrator_run_uuid = VALUES(orchestrator_run_uuid),
        agent_version = VALUES(agent_version),
        google_ads_account_id = VALUES(google_ads_account_id),
        status = 'running',
        analysis_window_json = VALUES(analysis_window_json),
        data_quality_json = VALUES(data_quality_json),
        priority_score = NULL,
        confidence_score = NULL,
        summary = NULL,
        recommended_focus = NULL,
        error_code = NULL,
        error_message = NULL,
        output_hash = NULL,
        started_at = CURRENT_TIMESTAMP,
        finished_at = NULL
    `;

    const rows = await this.prismaService.$queryRaw<AgentRunRow[]>`
      SELECT id AS agentRunId, dedupe_key AS dedupeKey
      FROM agent_runs
      WHERE insight_run_id = ${Number(input.analysisRunId)}
        AND agent_name = ${input.agentName}
        AND dedupe_key = ${input.dedupeKey}
      LIMIT 1
    `;

    const row = rows[0];

    if (row === undefined) {
      throw new NotFoundException(
        `Nao foi possivel recuperar agent_run para ${input.agentName}.`,
      );
    }

    return {
      agentRunId: String(Number(row.agentRunId)),
      dedupeKey: row.dedupeKey,
    };
  }

  public async persistAgentRunFailure(
    input: PersistAgentRunFailureInput,
  ): Promise<void> {
    await this.prismaService.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        UPDATE agent_runs
        SET status = ${input.status},
            priority_score = ${input.priorityScore},
            confidence_score = ${input.confidenceScore},
            summary = ${truncateText(input.summary, 1000)},
            error_code = ${input.errorCode},
            error_message = ${truncateText(input.errorMessage, 255)},
            finished_at = CURRENT_TIMESTAMP
        WHERE id = ${Number(input.agentRunId)}
      `;

      await transaction.$executeRaw`
        INSERT INTO agent_run_outputs (
          agent_run_id,
          insight_run_id,
          payload_schema_version,
          output_status,
          output_hash,
          summary_text,
          output_json,
          candidate_entity_count,
          findings_count
        ) VALUES (
          ${Number(input.agentRunId)},
          (
            SELECT insight_run_id
            FROM agent_runs
            WHERE id = ${Number(input.agentRunId)}
          ),
          '1.0',
          ${input.status},
          NULL,
          ${truncateText(input.summary, 2000)},
          CAST(${JSON.stringify(input.outputJson)} AS JSON),
          0,
          0
        )
      `;
    });
  }

  public async persistAgentRunSuccess(
    input: PersistAgentRunSuccessInput,
  ): Promise<void> {
    await this.prismaService.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        UPDATE agent_runs
        SET status = ${input.output.status},
            priority_score = ${input.output.priority_score},
            confidence_score = ${input.output.confidence_score},
            summary = ${truncateText(input.output.summary, 1000)},
            recommended_focus = ${truncateText(
              input.output.recommended_focus,
              1000,
            )},
            output_hash = ${input.output.output_hash},
            finished_at = CURRENT_TIMESTAMP
        WHERE id = ${Number(input.agentRunId)}
      `;

      await transaction.$executeRaw`
        INSERT INTO agent_run_outputs (
          agent_run_id,
          insight_run_id,
          payload_schema_version,
          output_status,
          output_hash,
          summary_text,
          output_json,
          candidate_entity_count,
          findings_count
        ) VALUES (
          ${Number(input.agentRunId)},
          (
            SELECT insight_run_id
            FROM agent_runs
            WHERE id = ${Number(input.agentRunId)}
          ),
          '1.0',
          ${input.output.status},
          ${input.output.output_hash},
          ${truncateText(input.output.summary, 2000)},
          CAST(${JSON.stringify(input.output)} AS JSON),
          ${input.output.candidate_entity_ids.length},
          ${input.output.findings.length}
        )
      `;

      await transaction.$executeRaw`
        DELETE FROM agent_findings
        WHERE agent_run_id = ${Number(input.agentRunId)}
      `;

      for (const finding of input.output.findings) {
        await transaction.$executeRaw`
          INSERT INTO agent_findings (
            tenant_id,
            client_id,
            google_ads_account_id,
            insight_run_id,
            agent_run_id,
            finding_key,
            source_agent_name,
            entity_type,
            entity_id,
            entity_label,
            category,
            severity,
            priority_band,
            priority_score,
            confidence_band,
            confidence_score,
            risk_level,
            title,
            summary,
            diagnosis,
            primary_hypothesis,
            support_agent_names_json,
            alternative_hypotheses_json,
            hypothesis_status,
            recommended_action_json,
            expected_impact,
            technical_explanation,
            executive_explanation,
            evidence_json,
            data_gaps_json,
            tags_json,
            review_notes_json,
            status,
            content_hash
          ) VALUES (
            ${Number(input.output.execution_context.tenant_id)},
            ${Number(input.output.execution_context.client_id)},
            ${nullableBigint(input.output.execution_context.account_id)},
            ${Number(input.output.execution_context.trigger_reference)},
            ${Number(input.agentRunId)},
            ${finding.finding_key},
            ${finding.source_agent},
            ${finding.entity_type},
            ${finding.entity_id},
            ${finding.entity_label},
            ${finding.category},
            ${finding.severity},
            ${finding.priority_band},
            ${finding.priority_score},
            ${finding.confidence_band},
            ${finding.confidence_score},
            ${finding.risk_level},
            ${truncateText(finding.title, 191)},
            ${truncateText(finding.summary, 2000)},
            ${truncateText(finding.diagnosis, 2000)},
            ${truncateText(finding.primary_hypothesis, 1000)},
            CAST(${JSON.stringify(finding.support_agent_names)} AS JSON),
            CAST(${JSON.stringify(finding.alternative_hypotheses)} AS JSON),
            ${finding.hypothesis_status},
            CAST(${JSON.stringify(finding.recommended_action)} AS JSON),
            ${truncateText(finding.expected_impact, 1000)},
            ${truncateText(finding.technical_explanation, 4000)},
            ${truncateText(finding.executive_explanation, 4000)},
            CAST(${JSON.stringify(finding.evidence)} AS JSON),
            CAST(${JSON.stringify(finding.data_gaps)} AS JSON),
            CAST(${JSON.stringify(finding.tags)} AS JSON),
            CAST(${JSON.stringify(finding.review_notes)} AS JSON),
            ${finding.status},
            ${createDeterministicHash(finding)}
          )
        `;
      }
    });
  }

  public async persistConflicts(input: {
    readonly analysisRunId: string;
    readonly orchestratorRunUuid: string;
    readonly tenantId: string;
    readonly clientId: string;
    readonly accountId: string | null;
    readonly conflicts: readonly PerformanceConflictRecord[];
  }): Promise<void> {
    if (input.conflicts.length === 0) {
      return;
    }

    await this.prismaService.$transaction(async (transaction) => {
      for (const conflict of input.conflicts) {
        await transaction.$executeRaw`
          INSERT INTO agent_conflicts (
            tenant_id,
            client_id,
            google_ads_account_id,
            insight_run_id,
            orchestrator_run_uuid,
            entity_type,
            entity_id,
            conflict_type,
            source_agents_json,
            resolution
          ) VALUES (
            ${Number(input.tenantId)},
            ${Number(input.clientId)},
            ${nullableBigint(input.accountId)},
            ${Number(input.analysisRunId)},
            ${input.orchestratorRunUuid},
            ${conflict.entityType},
            ${conflict.entityId},
            ${conflict.conflictType},
            CAST(${JSON.stringify(conflict.sourceAgents)} AS JSON),
            ${truncateText(conflict.resolution, 1000)}
          )
        `;
      }
    });
  }

  public async upsertConsolidatedInsights(
    records: readonly PerformanceInsightUpsertRecord[],
  ): Promise<number> {
    if (records.length === 0) {
      return 0;
    }

    return this.prismaService.$transaction(async (transaction) => {
      let persistedCount = 0;

      for (const record of records) {
        const insight = buildPersistedInsight(record);
        const existingRows = await transaction.$queryRaw<ExistingInsightRow[]>`
          SELECT
            i.id AS insightId,
            i.current_version_number AS currentVersionNumber,
            iv.id AS latestVersionId,
            iv.version_number AS latestVersionNumber,
            iv.content_hash AS latestContentHash,
            i.status AS currentStatus
          FROM insights i
          LEFT JOIN insight_versions iv
            ON iv.insight_id = i.id
           AND iv.version_number = i.current_version_number
          WHERE i.tenant_id = ${Number(record.consolidatedInsight.tenantId)}
            AND i.insight_key = ${insight.insightKey}
          LIMIT 1
        `;

        const existing = existingRows[0];
        let persistedSnapshot: PersistedInsightSnapshotRecord;

        if (existing === undefined) {
          await transaction.$executeRaw`
            INSERT INTO insights (
              tenant_id,
              client_id,
              google_ads_account_id,
              insight_run_id,
              insight_key,
              scope_type,
              scope_ref,
              category,
              severity,
              confidence_band,
              summary,
              diagnosis,
              primary_hypothesis,
              alternative_hypotheses_json,
              source_agent_names_json,
              hypothesis_status,
              title,
              explanation_short,
              explanation_exec,
              recommendation_action,
              priority,
              priority_score,
              confidence,
              estimated_monthly_impact,
              risk_level,
              evidence_json,
              blocked_claims_json,
              next_steps_json,
              review_notes_json,
              period_reference_json,
              current_payload_json,
              current_version_number,
              latest_run_id,
              status,
              generated_at
            ) VALUES (
              ${Number(record.consolidatedInsight.tenantId)},
              ${Number(record.consolidatedInsight.clientId)},
              ${nullableBigint(record.consolidatedInsight.accountId)},
              ${Number(record.sourceRunId)},
              ${insight.insightKey},
              ${insight.scopeType},
              ${record.consolidatedInsight.entityId},
              ${record.consolidatedInsight.category},
              ${record.consolidatedInsight.severity},
              ${record.consolidatedInsight.confidenceBand},
              ${truncateText(record.consolidatedInsight.summary, 2000)},
              ${truncateText(record.consolidatedInsight.diagnosis, 2000)},
              ${truncateText(record.consolidatedInsight.primaryHypothesis, 1000)},
              CAST(${JSON.stringify(record.consolidatedInsight.alternativeHypotheses)} AS JSON),
              CAST(${JSON.stringify(record.consolidatedInsight.sourceAgentNames)} AS JSON),
              ${record.consolidatedInsight.hypothesisStatus},
              ${truncateText(record.consolidatedInsight.title, 191)},
              ${truncateText(record.consolidatedInsight.technicalExplanation, 4000)},
              ${truncateText(record.consolidatedInsight.executiveExplanation, 4000)},
              ${mapLegacyRecommendationAction(
                record.consolidatedInsight.recommendedAction.actionType,
              )},
              ${record.consolidatedInsight.priorityBand},
              ${record.consolidatedInsight.priorityScore},
              ${record.consolidatedInsight.confidenceScore},
              NULL,
              ${record.consolidatedInsight.riskLevel},
              CAST(${JSON.stringify(record.consolidatedInsight.evidenceJson)} AS JSON),
              CAST(${JSON.stringify(record.consolidatedInsight.blockedClaims)} AS JSON),
              CAST(${JSON.stringify(record.consolidatedInsight.nextSteps)} AS JSON),
              CAST(${JSON.stringify(record.consolidatedInsight.reviewNotes)} AS JSON),
              CAST(${JSON.stringify(record.consolidatedInsight.analysisWindow)} AS JSON),
              CAST(${JSON.stringify(insight.payload)} AS JSON),
              1,
              ${Number(record.sourceRunId)},
              'open',
              ${record.consolidatedInsight.generatedAt}
            )
          `;

          const insertedRows = await transaction.$queryRaw<Array<{ insightId: bigint }>>`
            SELECT id AS insightId
            FROM insights
            WHERE tenant_id = ${Number(record.consolidatedInsight.tenantId)}
              AND insight_key = ${insight.insightKey}
            LIMIT 1
          `;

          const inserted = insertedRows[0];

          if (inserted === undefined) {
            throw new NotFoundException(
              `Insight persistido nao encontrado para ${insight.insightKey}.`,
            );
          }

          const versionId = await this.insertInsightVersion(transaction, {
            insightId: String(Number(inserted.insightId)),
            sourceRunId: record.sourceRunId,
            versionNumber: 1,
            supersedesVersionId: null,
            contentHash: insight.contentHash,
            payloadHash: insight.payloadHash,
            payload: insight.payload,
            consolidatedInsight: record.consolidatedInsight,
          });

          await transaction.$executeRaw`
            UPDATE insights
            SET latest_version_id = ${Number(versionId)}
            WHERE id = ${Number(inserted.insightId)}
          `;

          persistedSnapshot = {
            insightId: String(Number(inserted.insightId)),
            versionId,
            versionNumber: 1,
            contentHash: insight.contentHash,
            payloadHash: insight.payloadHash,
            isNewVersion: true,
          };
        } else {
          const sameContent = existing.latestContentHash === insight.contentHash;
          const nextVersionNumber = sameContent
            ? existing.currentVersionNumber
            : existing.currentVersionNumber + 1;
          let latestVersionId =
            existing.latestVersionId === null ? null : String(Number(existing.latestVersionId));

          if (!sameContent || latestVersionId === null) {
            latestVersionId = await this.insertInsightVersion(transaction, {
              insightId: String(Number(existing.insightId)),
              sourceRunId: record.sourceRunId,
              versionNumber:
                latestVersionId === null && sameContent
                  ? existing.latestVersionNumber ?? existing.currentVersionNumber
                  : nextVersionNumber,
              supersedesVersionId:
                existing.latestVersionId === null
                  ? null
                  : String(Number(existing.latestVersionId)),
              contentHash: insight.contentHash,
              payloadHash: insight.payloadHash,
              payload: insight.payload,
              consolidatedInsight: record.consolidatedInsight,
            });
          }

          await transaction.$executeRaw`
            UPDATE insights
            SET google_ads_account_id = ${nullableBigint(
              record.consolidatedInsight.accountId,
            )},
                insight_run_id = ${Number(record.sourceRunId)},
                latest_run_id = ${Number(record.sourceRunId)},
                latest_version_id = ${nullableBigint(latestVersionId)},
                scope_type = ${insight.scopeType},
                scope_ref = ${record.consolidatedInsight.entityId},
                category = ${record.consolidatedInsight.category},
                severity = ${record.consolidatedInsight.severity},
                confidence_band = ${record.consolidatedInsight.confidenceBand},
                summary = ${truncateText(record.consolidatedInsight.summary, 2000)},
                diagnosis = ${truncateText(record.consolidatedInsight.diagnosis, 2000)},
                primary_hypothesis = ${truncateText(
                  record.consolidatedInsight.primaryHypothesis,
                  1000,
                )},
                alternative_hypotheses_json = CAST(${JSON.stringify(
                  record.consolidatedInsight.alternativeHypotheses,
                )} AS JSON),
                source_agent_names_json = CAST(${JSON.stringify(
                  record.consolidatedInsight.sourceAgentNames,
                )} AS JSON),
                hypothesis_status = ${record.consolidatedInsight.hypothesisStatus},
                title = ${truncateText(record.consolidatedInsight.title, 191)},
                explanation_short = ${truncateText(
                  record.consolidatedInsight.technicalExplanation,
                  4000,
                )},
                explanation_exec = ${truncateText(
                  record.consolidatedInsight.executiveExplanation,
                  4000,
                )},
                recommendation_action = ${mapLegacyRecommendationAction(
                  record.consolidatedInsight.recommendedAction.actionType,
                )},
                priority = ${record.consolidatedInsight.priorityBand},
                priority_score = ${record.consolidatedInsight.priorityScore},
                confidence = ${record.consolidatedInsight.confidenceScore},
                risk_level = ${record.consolidatedInsight.riskLevel},
                evidence_json = CAST(${JSON.stringify(
                  record.consolidatedInsight.evidenceJson,
                )} AS JSON),
                blocked_claims_json = CAST(${JSON.stringify(
                  record.consolidatedInsight.blockedClaims,
                )} AS JSON),
                next_steps_json = CAST(${JSON.stringify(
                  record.consolidatedInsight.nextSteps,
                )} AS JSON),
                review_notes_json = CAST(${JSON.stringify(
                  record.consolidatedInsight.reviewNotes,
                )} AS JSON),
                period_reference_json = CAST(${JSON.stringify(
                  record.consolidatedInsight.analysisWindow,
                )} AS JSON),
                current_payload_json = CAST(${JSON.stringify(insight.payload)} AS JSON),
                current_version_number = ${nextVersionNumber},
                generated_at = ${record.consolidatedInsight.generatedAt}
            WHERE id = ${Number(existing.insightId)}
          `;

          persistedSnapshot = {
            insightId: String(Number(existing.insightId)),
            versionId: latestVersionId,
            versionNumber: nextVersionNumber,
            contentHash: insight.contentHash,
            payloadHash: insight.payloadHash,
            isNewVersion: !sameContent || existing.latestVersionId === null,
          };
        }

        await this.insertInsightRunItem(transaction, {
          analysisRunId: record.sourceRunId,
          tenantId: record.consolidatedInsight.tenantId,
          clientId: record.consolidatedInsight.clientId,
          accountId: record.consolidatedInsight.accountId,
          insightKey: insight.insightKey,
          scopeType: insight.scopeType,
          payload: insight.payload,
          consolidatedInsight: record.consolidatedInsight,
          persistedInsight: persistedSnapshot,
        });

        persistedCount += 1;
      }

      return persistedCount;
    });
  }

  public async listAnalysisRuns(input: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly accountId?: string | null;
    readonly limit?: number;
  }): Promise<readonly AnalysisRunHistoryListItem[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        analysisRunId: bigint;
        tenantId: bigint;
        clientId: bigint;
        accountId: bigint | null;
        periodStart: Date;
        periodEnd: Date;
        baselineStart: Date | null;
        baselineEnd: Date | null;
        comparisonLabel: string | null;
        status: 'queued' | 'running' | 'completed' | 'failed';
        generatedBy: 'system' | 'user';
        orchestratorRunUuid: string | null;
        insightCount: bigint | null;
        createdAt: Date;
        startedAt: Date | null;
        finishedAt: Date | null;
      }>
    >`
      SELECT
        ir.id AS analysisRunId,
        ir.tenant_id AS tenantId,
        ir.client_id AS clientId,
        ir.google_ads_account_id AS accountId,
        ir.period_start AS periodStart,
        ir.period_end AS periodEnd,
        ir.baseline_start AS baselineStart,
        ir.baseline_end AS baselineEnd,
        ir.comparison_label AS comparisonLabel,
        ir.status AS status,
        ir.generated_by AS generatedBy,
        ir.orchestrator_run_uuid AS orchestratorRunUuid,
        COUNT(iri.id) AS insightCount,
        ir.created_at AS createdAt,
        ir.started_at AS startedAt,
        ir.finished_at AS finishedAt
      FROM insight_runs ir
      LEFT JOIN insight_run_items iri
        ON iri.insight_run_id = ir.id
      WHERE ir.tenant_id = ${Number(input.tenantId)}
        AND ir.client_id = ${Number(input.clientId)}
        AND (${nullableBigint(input.accountId ?? null)} IS NULL OR ir.google_ads_account_id = ${nullableBigint(input.accountId ?? null)})
      GROUP BY
        ir.id,
        ir.tenant_id,
        ir.client_id,
        ir.google_ads_account_id,
        ir.period_start,
        ir.period_end,
        ir.baseline_start,
        ir.baseline_end,
        ir.comparison_label,
        ir.status,
        ir.generated_by,
        ir.orchestrator_run_uuid,
        ir.created_at,
        ir.started_at,
        ir.finished_at
      ORDER BY ir.created_at DESC
      LIMIT ${normalizeLimit(input.limit, 50)}
    `;

    return rows.map((row) => ({
      analysisRunId: String(Number(row.analysisRunId)),
      tenantId: String(Number(row.tenantId)),
      clientId: String(Number(row.clientId)),
      accountId: row.accountId === null ? null : String(Number(row.accountId)),
      periodStart: toDateOnly(row.periodStart),
      periodEnd: toDateOnly(row.periodEnd),
      baselineStart: row.baselineStart === null ? null : toDateOnly(row.baselineStart),
      baselineEnd: row.baselineEnd === null ? null : toDateOnly(row.baselineEnd),
      comparisonLabel: row.comparisonLabel,
      status: row.status,
      generatedBy: row.generatedBy,
      orchestratorRunUuid: row.orchestratorRunUuid,
      insightCount: Number(row.insightCount ?? 0n),
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }));
  }

  public async listAgentOutputsByAnalysisRun(
    analysisRunId: string,
  ): Promise<readonly AgentOutputHistoryItem[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        agentRunId: bigint;
        analysisRunId: bigint;
        agentName: AgentOutputHistoryItem['agentName'];
        agentVersion: string;
        status: string;
        priorityScore: number | null;
        confidenceScore: number | null;
        summary: string | null;
        recommendedFocus: string | null;
        outputHash: string | null;
        findingsCount: bigint;
        createdAt: Date;
        finishedAt: Date | null;
      }>
    >`
      SELECT
        ar.id AS agentRunId,
        ar.insight_run_id AS analysisRunId,
        ar.agent_name AS agentName,
        ar.agent_version AS agentVersion,
        ar.status AS status,
        ar.priority_score AS priorityScore,
        ar.confidence_score AS confidenceScore,
        ar.summary AS summary,
        ar.recommended_focus AS recommendedFocus,
        ar.output_hash AS outputHash,
        COALESCE(aro.findings_count, 0) AS findingsCount,
        ar.created_at AS createdAt,
        ar.finished_at AS finishedAt
      FROM agent_runs ar
      LEFT JOIN (
        SELECT agent_run_id, MAX(id) AS latest_output_id
        FROM agent_run_outputs
        GROUP BY agent_run_id
      ) aro_latest
        ON aro_latest.agent_run_id = ar.id
      LEFT JOIN agent_run_outputs aro
        ON aro.id = aro_latest.latest_output_id
      WHERE ar.insight_run_id = ${Number(analysisRunId)}
      ORDER BY ar.created_at ASC, ar.id ASC
    `;

    return rows.map((row) => ({
      agentRunId: String(Number(row.agentRunId)),
      analysisRunId: String(Number(row.analysisRunId)),
      agentName: row.agentName,
      agentVersion: row.agentVersion,
      status: row.status,
      priorityScore: row.priorityScore,
      confidenceScore: row.confidenceScore,
      summary: row.summary,
      recommendedFocus: row.recommendedFocus,
      outputHash: row.outputHash,
      findingsCount: Number(row.findingsCount),
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }));
  }

  public async listInsightSnapshotsByAnalysisRun(
    analysisRunId: string,
  ): Promise<readonly AnalysisRunInsightSnapshot[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        insightRunItemId: bigint;
        analysisRunId: bigint;
        insightId: bigint;
        insightVersionId: bigint | null;
        versionNumber: number | null;
        insightKey: string;
        entityType: string;
        entityId: string;
        title: string;
        category: string;
        severity: string;
        hypothesisStatus: string | null;
        priorityScore: number;
        confidenceScore: number;
        runChangeType: 'new' | 'updated' | 'unchanged';
        contentHash: string;
        payloadJson: PerformanceAgentJsonValue;
        generatedAt: Date;
      }>
    >`
      SELECT
        iri.id AS insightRunItemId,
        iri.insight_run_id AS analysisRunId,
        iri.insight_id AS insightId,
        iri.insight_version_id AS insightVersionId,
        iv.version_number AS versionNumber,
        iri.insight_key AS insightKey,
        iri.entity_type AS entityType,
        iri.entity_id AS entityId,
        iri.title AS title,
        iri.category AS category,
        iri.severity AS severity,
        iri.hypothesis_status AS hypothesisStatus,
        iri.priority_score AS priorityScore,
        iri.confidence_score AS confidenceScore,
        iri.run_change_type AS runChangeType,
        iri.content_hash AS contentHash,
        iri.payload_json AS payloadJson,
        iri.generated_at AS generatedAt
      FROM insight_run_items iri
      LEFT JOIN insight_versions iv
        ON iv.id = iri.insight_version_id
      WHERE iri.insight_run_id = ${Number(analysisRunId)}
      ORDER BY iri.priority_score DESC, iri.confidence_score DESC, iri.id ASC
    `;

    return rows.map((row) => ({
      insightRunItemId: String(Number(row.insightRunItemId)),
      analysisRunId: String(Number(row.analysisRunId)),
      insightId: String(Number(row.insightId)),
      insightVersionId:
        row.insightVersionId === null ? null : String(Number(row.insightVersionId)),
      versionNumber: row.versionNumber,
      insightKey: row.insightKey,
      entityType: row.entityType,
      entityId: row.entityId,
      title: row.title,
      category: row.category,
      severity: row.severity,
      hypothesisStatus: row.hypothesisStatus,
      priorityScore: row.priorityScore,
      confidenceScore: row.confidenceScore,
      runChangeType: row.runChangeType,
      contentHash: row.contentHash,
      payloadJson: normalizeJsonValue(row.payloadJson),
      generatedAt: row.generatedAt.toISOString(),
    }));
  }

  public async compareAnalysisRuns(input: {
    readonly leftAnalysisRunId: string;
    readonly rightAnalysisRunId: string;
  }): Promise<AnalysisRunComparisonResult> {
    const [leftSnapshots, rightSnapshots] = await Promise.all([
      this.listInsightSnapshotsByAnalysisRun(input.leftAnalysisRunId),
      this.listInsightSnapshotsByAnalysisRun(input.rightAnalysisRunId),
    ]);

    const leftByKey = new Map(leftSnapshots.map((item) => [item.insightKey, item]));
    const rightByKey = new Map(rightSnapshots.map((item) => [item.insightKey, item]));
    const keys = Array.from(new Set([...leftByKey.keys(), ...rightByKey.keys()])).sort();

    const items: AnalysisRunComparisonItem[] = keys.map((key) => {
      const left = leftByKey.get(key);
      const right = rightByKey.get(key);

      const changeType =
        left === undefined
          ? 'added'
          : right === undefined
            ? 'removed'
            : left.contentHash === right.contentHash
              ? 'unchanged'
              : 'changed';

      return {
        insightKey: key,
        entityType: right?.entityType ?? left?.entityType ?? 'tracking',
        entityId: right?.entityId ?? left?.entityId ?? 'unknown',
        title: right?.title ?? left?.title ?? 'Insight sem titulo',
        leftVersionNumber: left?.versionNumber ?? readVersionNumber(left?.payloadJson),
        rightVersionNumber: right?.versionNumber ?? readVersionNumber(right?.payloadJson),
        leftPriorityScore: left?.priorityScore ?? null,
        rightPriorityScore: right?.priorityScore ?? null,
        leftConfidenceScore: left?.confidenceScore ?? null,
        rightConfidenceScore: right?.confidenceScore ?? null,
        changeType,
      };
    });

    return {
      leftAnalysisRunId: input.leftAnalysisRunId,
      rightAnalysisRunId: input.rightAnalysisRunId,
      items,
    };
  }

  private async insertInsightVersion(
    transaction: Prisma.TransactionClient,
    input: {
      readonly insightId: string;
      readonly sourceRunId: string;
      readonly versionNumber: number;
      readonly supersedesVersionId: string | null;
      readonly contentHash: string;
      readonly payloadHash: string;
      readonly payload: ConsolidatedInsight;
      readonly consolidatedInsight: PerformanceInsightUpsertRecord['consolidatedInsight'];
    },
  ): Promise<string> {
    await transaction.$executeRaw`
      INSERT INTO insight_versions (
        tenant_id,
        client_id,
        google_ads_account_id,
        insight_id,
        insight_run_id,
        version_number,
        payload_schema_version,
        payload_hash,
        content_hash,
        entity_type,
        entity_id,
        category,
        severity,
        priority_score,
        confidence_score,
        confidence_band,
        risk_level,
        source_agent_names_json,
        hypothesis_status,
        review_notes_json,
        period_reference_json,
        payload_json,
        generated_at,
        supersedes_version_id
      ) VALUES (
        ${Number(input.consolidatedInsight.tenantId)},
        ${Number(input.consolidatedInsight.clientId)},
        ${nullableBigint(input.consolidatedInsight.accountId)},
        ${Number(input.insightId)},
        ${Number(input.sourceRunId)},
        ${input.versionNumber},
        '1.0',
        ${input.payloadHash},
        ${input.contentHash},
        ${mapInsightVersionEntityType(input.consolidatedInsight.entityType)},
        ${input.consolidatedInsight.entityId},
        ${input.consolidatedInsight.category},
        ${input.consolidatedInsight.severity},
        ${input.consolidatedInsight.priorityScore},
        ${input.consolidatedInsight.confidenceScore},
        ${input.consolidatedInsight.confidenceBand},
        ${input.consolidatedInsight.riskLevel},
        CAST(${JSON.stringify(input.consolidatedInsight.sourceAgentNames)} AS JSON),
        ${input.consolidatedInsight.hypothesisStatus},
        CAST(${JSON.stringify(input.consolidatedInsight.reviewNotes)} AS JSON),
        CAST(${JSON.stringify(input.consolidatedInsight.analysisWindow)} AS JSON),
        CAST(${JSON.stringify(input.payload)} AS JSON),
        ${input.consolidatedInsight.generatedAt},
        ${nullableBigint(input.supersedesVersionId)}
      )
    `;

    const rows = await transaction.$queryRaw<Array<{ versionId: bigint }>>`
      SELECT id AS versionId
      FROM insight_versions
      WHERE insight_id = ${Number(input.insightId)}
        AND version_number = ${input.versionNumber}
      LIMIT 1
    `;

    const row = rows[0];

    if (row === undefined) {
      throw new NotFoundException(
        `Nao foi possivel recuperar a versao do insight ${input.insightId}.`,
      );
    }

    return String(Number(row.versionId));
  }

  private async insertInsightRunItem(
    transaction: Prisma.TransactionClient,
    input: {
      readonly analysisRunId: string;
      readonly tenantId: string;
      readonly clientId: string;
      readonly accountId: string | null;
      readonly insightKey: string;
      readonly scopeType: string;
      readonly payload: ConsolidatedInsight;
      readonly consolidatedInsight: PerformanceInsightUpsertRecord['consolidatedInsight'];
      readonly persistedInsight: PersistedInsightSnapshotRecord;
    },
  ): Promise<void> {
    await transaction.$executeRaw`
      INSERT INTO insight_run_items (
        tenant_id,
        client_id,
        google_ads_account_id,
        insight_run_id,
        insight_id,
        insight_version_id,
        insight_key,
        scope_type,
        entity_type,
        entity_id,
        category,
        severity,
        hypothesis_status,
        priority_score,
        confidence_score,
        run_change_type,
        payload_hash,
        content_hash,
        title,
        payload_json,
        generated_at
      ) VALUES (
        ${Number(input.tenantId)},
        ${Number(input.clientId)},
        ${nullableBigint(input.accountId)},
        ${Number(input.analysisRunId)},
        ${Number(input.persistedInsight.insightId)},
        ${nullableBigint(input.persistedInsight.versionId)},
        ${input.insightKey},
        ${input.scopeType},
        ${input.consolidatedInsight.entityType},
        ${input.consolidatedInsight.entityId},
        ${input.consolidatedInsight.category},
        ${input.consolidatedInsight.severity},
        ${input.consolidatedInsight.hypothesisStatus},
        ${input.consolidatedInsight.priorityScore},
        ${input.consolidatedInsight.confidenceScore},
        ${input.persistedInsight.isNewVersion ? (input.persistedInsight.versionNumber === 1 ? 'new' : 'updated') : 'unchanged'},
        ${input.persistedInsight.payloadHash},
        ${input.persistedInsight.contentHash},
        ${truncateText(input.consolidatedInsight.title, 191)},
        CAST(${JSON.stringify(input.payload)} AS JSON),
        ${input.consolidatedInsight.generatedAt}
      )
      ON DUPLICATE KEY UPDATE
        insight_id = VALUES(insight_id),
        insight_version_id = VALUES(insight_version_id),
        hypothesis_status = VALUES(hypothesis_status),
        priority_score = VALUES(priority_score),
        confidence_score = VALUES(confidence_score),
        run_change_type = VALUES(run_change_type),
        payload_hash = VALUES(payload_hash),
        content_hash = VALUES(content_hash),
        title = VALUES(title),
        payload_json = VALUES(payload_json),
        generated_at = VALUES(generated_at)
    `;
  }
}

function buildPersistedInsight(record: PerformanceInsightUpsertRecord): {
  readonly insightKey: string;
  readonly payloadHash: string;
  readonly contentHash: string;
  readonly scopeType:
    | 'account'
    | 'campaign'
    | 'device'
    | 'geo'
    | 'schedule'
    | 'keyword'
    | 'search_term'
    | 'tracking';
  readonly payload: ConsolidatedInsight;
} {
  const payload: ConsolidatedInsight = {
    insight_id: createDeterministicHash({
      tenant_id: record.consolidatedInsight.tenantId,
      client_id: record.consolidatedInsight.clientId,
      entity_type: record.consolidatedInsight.entityType,
      entity_id: record.consolidatedInsight.entityId,
      category: record.consolidatedInsight.category,
      generated_at: record.consolidatedInsight.generatedAt,
    }).slice(0, 24),
    insight_key: createDeterministicHash({
      tenant_id: record.consolidatedInsight.tenantId,
      client_id: record.consolidatedInsight.clientId,
      entity_type: record.consolidatedInsight.entityType,
      entity_id: record.consolidatedInsight.entityId,
      category: record.consolidatedInsight.category,
      action_type: record.consolidatedInsight.recommendedAction.actionType,
    }),
    tenant_id: record.consolidatedInsight.tenantId,
    client_id: record.consolidatedInsight.clientId,
    account_id: record.consolidatedInsight.accountId,
    entity_type: record.consolidatedInsight.entityType,
    entity_id: record.consolidatedInsight.entityId,
    entity_label: record.consolidatedInsight.entityLabel,
    category: record.consolidatedInsight.category,
    severity: record.consolidatedInsight.severity,
    priority_band: record.consolidatedInsight.priorityBand,
    priority_score: record.consolidatedInsight.priorityScore,
    confidence_band: scoreToConfidenceBand(
      record.consolidatedInsight.confidenceScore,
    ),
    confidence_score: record.consolidatedInsight.confidenceScore,
    risk_level: record.consolidatedInsight.riskLevel,
    source_agent_names: record.consolidatedInsight.sourceAgentNames,
    title: record.consolidatedInsight.title,
    summary: record.consolidatedInsight.summary,
    diagnosis: record.consolidatedInsight.diagnosis,
    primary_hypothesis: record.consolidatedInsight.primaryHypothesis,
    alternative_hypotheses: record.consolidatedInsight.alternativeHypotheses,
    hypothesis_status: record.consolidatedInsight.hypothesisStatus,
    recommended_action: {
      action_type: record.consolidatedInsight.recommendedAction.actionType,
      action_target: record.consolidatedInsight.recommendedAction.actionTarget,
      description: record.consolidatedInsight.recommendedAction.description,
      execution_mode: 'manual',
    },
    expected_impact: record.consolidatedInsight.expectedImpact,
    technical_explanation: record.consolidatedInsight.technicalExplanation,
    executive_explanation: record.consolidatedInsight.executiveExplanation,
    evidence: record.consolidatedInsight.evidenceJson,
    review_notes: record.consolidatedInsight.reviewNotes,
    supporting_finding_ids: [],
    blocked_claims: record.consolidatedInsight.blockedClaims,
    next_steps: record.consolidatedInsight.nextSteps,
    analysis_window: record.consolidatedInsight.analysisWindow,
    data_quality: record.consolidatedInsight.dataQuality,
    generated_at: record.consolidatedInsight.generatedAt,
  };

  const payloadHash = createDeterministicHash(payload);
  const contentHash = createDeterministicHash({
    title: payload.title,
    summary: payload.summary,
    diagnosis: payload.diagnosis,
    hypothesis_status: payload.hypothesis_status,
    recommended_action: payload.recommended_action,
    technical_explanation: payload.technical_explanation,
    executive_explanation: payload.executive_explanation,
    evidence: payload.evidence,
    review_notes: payload.review_notes,
    blocked_claims: payload.blocked_claims,
    next_steps: payload.next_steps,
  });

  return {
    insightKey: payload.insight_key,
    payloadHash,
    contentHash,
    scopeType: mapInsightScopeType(record.consolidatedInsight.entityType),
    payload,
  };
}

function mapInsightScopeType(
  entityType: string,
): 'account' | 'campaign' | 'device' | 'geo' | 'schedule' | 'keyword' | 'search_term' | 'tracking' {
  switch (entityType) {
    case 'account':
      return 'account';
    case 'campaign':
      return 'campaign';
    case 'device':
      return 'device';
    case 'geo':
      return 'geo';
    case 'schedule':
    case 'day_of_week':
      return 'schedule';
    case 'keyword':
      return 'keyword';
    case 'search_term':
      return 'search_term';
    default:
      return 'tracking';
  }
}

function mapInsightVersionEntityType(
  entityType: string,
): 'account' | 'campaign' | 'device' | 'geo' | 'schedule' | 'keyword' | 'search_term' | 'tracking' {
  return mapInsightScopeType(entityType);
}

function mapLegacyRecommendationAction(actionType: string): string {
  switch (actionType) {
    case 'scale':
      return 'increase_budget';
    case 'reduce':
      return 'decrease_budget';
    case 'pause':
      return 'pause';
    case 'adjust_device':
      return 'shift_device';
    case 'adjust_schedule':
      return 'shift_schedule';
    case 'adjust_geo':
      return 'shift_geo';
    case 'review_search_terms':
    case 'review_targeting':
      return 'review_keywords';
    case 'review_landing_page':
    case 'review_creative':
      return 'review_landing_page';
    case 'review_tracking':
    case 'investigate':
    case 'monitor':
    default:
      // Mantemos compatibilidade com o enum legado da tabela insights enquanto a
      // migracao para action_type nativo nao e aplicada.
      return 'review_tracking';
  }
}

function nullableBigint(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function truncateText(value: string | null, maxLength: number): string | null {
  if (value === null) {
    return null;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(value), 200);
}

function normalizeJsonValue(value: unknown): PerformanceAgentJsonValue {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as PerformanceAgentJsonValue;
    } catch {
      return value as PerformanceAgentJsonValue;
    }
  }

  return value as PerformanceAgentJsonValue;
}

function readVersionNumber(value: unknown): number | null {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>).version_number;

  if (typeof raw === 'number') {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
