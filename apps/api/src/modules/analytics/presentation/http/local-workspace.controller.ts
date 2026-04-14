import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import type {
  LocalDemoSeedResponse,
  LocalWorkspaceAgentInsightsView,
  LocalWorkspaceView,
} from '@googleads/shared';

import { LocalAgentInsightsService } from '../../application/local-agent-insights.service';
import { LocalDemoSeedService } from '../../application/local-demo-seed.service';
import { LocalWorkspaceService } from '../../application/local-workspace.service';
import { LocalWorkspaceQueryDto } from './dto/local-workspace-query.dto';

@Controller('analytics/local-demo')
export class LocalWorkspaceController {
  public constructor(
    private readonly localWorkspaceService: LocalWorkspaceService,
    private readonly localAgentInsightsService: LocalAgentInsightsService,
    private readonly localDemoSeedService: LocalDemoSeedService,
  ) {}

  @Get('workspace')
  public async getWorkspace(
    @Query() query: LocalWorkspaceQueryDto,
  ): Promise<LocalWorkspaceView> {
    this.assertDevelopmentEnvironment();

    return this.localWorkspaceService.getWorkspaceView({
      tenantSlug: query.tenantSlug,
      clientId: query.clientId,
      period: query.period,
    });
  }

  @Get('agent-insights')
  public async getAgentInsights(
    @Query() query: LocalWorkspaceQueryDto,
  ): Promise<LocalWorkspaceAgentInsightsView> {
    this.assertDevelopmentEnvironment();

    return this.localAgentInsightsService.getAgentInsightsView({
      tenantSlug: query.tenantSlug,
      clientId: query.clientId,
    });
  }

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  public async seedLocalDemo(): Promise<LocalDemoSeedResponse> {
    this.assertDevelopmentEnvironment();

    return this.localDemoSeedService.seed();
  }

  private assertDevelopmentEnvironment(): void {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException(
        'Os endpoints de demonstracao local so podem ser usados em development.',
      );
    }
  }
}
