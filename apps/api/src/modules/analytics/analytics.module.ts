import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { LocalAgentInsightsService } from './application/local-agent-insights.service';
import { LocalDemoSeedService } from './application/local-demo-seed.service';
import { LocalOptimizationAgentService } from './application/local-optimization-agent.service';
import { LocalWorkspaceService } from './application/local-workspace.service';
import { LocalWorkspaceController } from './presentation/http/local-workspace.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [LocalWorkspaceController],
  providers: [
    LocalWorkspaceService,
    LocalAgentInsightsService,
    LocalDemoSeedService,
    LocalOptimizationAgentService,
  ],
})
export class AnalyticsModule {}
