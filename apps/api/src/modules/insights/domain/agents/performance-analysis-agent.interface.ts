import type { AgentInput, AgentOutput, PerformanceAgentName } from '@googleads/shared';

export interface PerformanceAnalysisAgent {
  readonly agentName: PerformanceAgentName;
  readonly isRequired: boolean;

  execute(input: AgentInput): Promise<AgentOutput>;
}
