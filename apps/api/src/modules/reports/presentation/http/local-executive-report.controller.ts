import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import {
  LOCAL_WORKSPACE_PERIODS,
  type ExecutiveReportView,
  type LocalWorkspacePeriod,
} from '@googleads/shared';
import { IsEnum, IsOptional, Matches } from 'class-validator';

import { LocalExecutiveReportService } from '../../application/local-executive-report.service';

const TENANT_SLUG_PATTERN = /^[a-z0-9-]{2,120}$/u;
const CLIENT_ID_PATTERN = /^[0-9]{1,20}$/u;

class LocalExecutiveReportQueryDto {
  @IsOptional()
  @Matches(TENANT_SLUG_PATTERN)
  public tenantSlug?: string | undefined;

  @IsOptional()
  @Matches(CLIENT_ID_PATTERN)
  public clientId?: string | undefined;

  @IsOptional()
  @IsEnum(LOCAL_WORKSPACE_PERIODS)
  public period: LocalWorkspacePeriod = 'last_7d';
}

@Controller('reports/local-demo')
export class LocalExecutiveReportController {
  public constructor(
    private readonly localExecutiveReportService: LocalExecutiveReportService,
  ) {}

  @Get('executive-deck')
  public async getExecutiveDeck(
    @Query() query: LocalExecutiveReportQueryDto,
  ): Promise<ExecutiveReportView> {
    this.assertDevelopmentEnvironment();

    return this.localExecutiveReportService.getExecutiveReportView({
      tenantSlug: query.tenantSlug,
      clientId: query.clientId,
      period: query.period,
    });
  }

  private assertDevelopmentEnvironment(): void {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException(
        'Os endpoints de relatorio local so podem ser usados em development.',
      );
    }
  }
}
