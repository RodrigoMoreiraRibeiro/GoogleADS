import { IsEnum, IsOptional, Matches } from 'class-validator';
import {
  LOCAL_WORKSPACE_PERIODS,
  type LocalWorkspacePeriod,
} from '@googleads/shared';

const TENANT_SLUG_PATTERN = /^[a-z0-9-]{2,120}$/u;
const CLIENT_ID_PATTERN = /^[0-9]{1,20}$/u;

export class LocalWorkspaceQueryDto {
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
