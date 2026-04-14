import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { AccountAuditorAgent } from './application/agents/account-auditor.agent';
import { CampaignStrategistAgent } from './application/agents/campaign-strategist.agent';
import { CreativePerformanceAgent } from './application/agents/creative-performance.agent';
import { ExecutiveSummaryAgent } from './application/agents/executive-summary.agent';
import { HypothesisReviewerAgent } from './application/agents/hypothesis-reviewer.agent';
import { PerformanceAgentDedupeService } from './application/agents/performance-agent-dedupe.service';
import { PerformanceAgentHistoryService } from './application/agents/performance-agent-history.service';
import { PerformanceAgentOrchestratorService } from './application/agents/performance-agent-orchestrator.service';
import { PerformanceAgentPayloadBuilderService } from './application/agents/performance-agent-payload-builder.service';
import { PerformanceAgentPersistenceService } from './application/agents/performance-agent-persistence.service';
import { PerformanceAgentRuntimeConfigService } from './application/agents/performance-agent-runtime-config.service';
import { SearchTermsSpecialistAgent } from './application/agents/search-terms-specialist.agent';
import { SegmentationSpecialistAgent } from './application/agents/segmentation-specialist.agent';
import { PerformanceAgentFeatureReaderRepository } from './infrastructure/agents/performance-agent-feature-reader.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    AccountAuditorAgent,
    CampaignStrategistAgent,
    SegmentationSpecialistAgent,
    SearchTermsSpecialistAgent,
    CreativePerformanceAgent,
    HypothesisReviewerAgent,
    ExecutiveSummaryAgent,
    PerformanceAgentRuntimeConfigService,
    PerformanceAgentPayloadBuilderService,
    PerformanceAgentDedupeService,
    PerformanceAgentPersistenceService,
    PerformanceAgentHistoryService,
    PerformanceAgentOrchestratorService,
    PerformanceAgentFeatureReaderRepository,
  ],
  exports: [
    PerformanceAgentOrchestratorService,
    PerformanceAgentPersistenceService,
    PerformanceAgentHistoryService,
  ],
})
export class InsightsModule {}
