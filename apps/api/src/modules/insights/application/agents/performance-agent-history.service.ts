import { Injectable } from '@nestjs/common';

import type {
  AnalysisRunComparisonResult,
  AnalysisRunHistoryListItem,
  AnalysisRunInsightSnapshot,
  AgentOutputHistoryItem,
} from '../../domain/agents/performance-agent.types';
import { PerformanceAgentPersistenceService } from './performance-agent-persistence.service';

@Injectable()
export class PerformanceAgentHistoryService {
  public constructor(
    private readonly persistenceService: PerformanceAgentPersistenceService,
  ) {}

  public async listAnalysisRuns(input: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly accountId?: string | null;
    readonly limit?: number;
  }): Promise<readonly AnalysisRunHistoryListItem[]> {
    return this.persistenceService.listAnalysisRuns(input);
  }

  public async listAgentOutputs(
    analysisRunId: string,
  ): Promise<readonly AgentOutputHistoryItem[]> {
    return this.persistenceService.listAgentOutputsByAnalysisRun(analysisRunId);
  }

  public async listConsolidatedInsights(
    analysisRunId: string,
  ): Promise<readonly AnalysisRunInsightSnapshot[]> {
    return this.persistenceService.listInsightSnapshotsByAnalysisRun(
      analysisRunId,
    );
  }

  public async compareExecutions(input: {
    readonly leftAnalysisRunId: string;
    readonly rightAnalysisRunId: string;
  }): Promise<AnalysisRunComparisonResult> {
    return this.persistenceService.compareAnalysisRuns(input);
  }
}
