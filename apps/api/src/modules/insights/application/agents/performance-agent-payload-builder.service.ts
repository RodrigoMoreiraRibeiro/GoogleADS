import { Injectable } from '@nestjs/common';
import type { AgentInput } from '@googleads/shared';

import type { PerformanceAgentPayloadBuilderInput } from '../../domain/agents/performance-agent.types';

@Injectable()
export class PerformanceAgentPayloadBuilderService {
  public buildInput(input: PerformanceAgentPayloadBuilderInput): AgentInput {
    return {
      agent_name: input.agentName,
      agent_version: input.agentVersion,
      execution_context: {
        tenant_id: input.runContext.tenantId,
        client_id: input.runContext.clientId,
        account_id: input.runContext.accountId,
        membership_id: input.runContext.triggeredByUserId,
        request_id: input.requestId,
        correlation_id: input.correlationId,
        trigger_source: input.runContext.generatedBy,
        trigger_reference: input.runContext.analysisRunId,
      },
      analysis_window: {
        analysis_window_label: 'analysis_run',
        period_start: input.runContext.periodStart,
        period_end: input.runContext.periodEnd,
        baseline_start: input.runContext.baselineStart,
        baseline_end: input.runContext.baselineEnd,
        comparison_label: input.runContext.comparisonLabel,
      },
      data_quality: input.dataQuality,
      thresholds: input.thresholds,
      features: input.features,
      upstream_outputs: input.upstreamOutputs.map((output) => ({
        agent_name: output.agent_name,
        output_id: output.output_id,
        output_hash: output.output_hash,
      })),
    };
  }
}
