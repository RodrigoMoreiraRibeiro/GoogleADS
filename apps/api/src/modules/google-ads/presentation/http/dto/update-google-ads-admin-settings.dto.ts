import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  GOOGLE_ADS_ADMIN_INTEGRATION_MODES,
  GOOGLE_ADS_ADMIN_INTRADAY_SYNC_WINDOWS,
} from '../../../domain/google-ads-admin-settings.types';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

export class UpdateGoogleAdsAdminSettingsDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(8)
  @MaxLength(191)
  public googleClientId!: string;

  @Transform(({ value }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(255)
  public googleClientSecret?: string | undefined;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(255)
  @Matches(/^https?:\/\/.+$/iu, {
    message: 'googleAdsRedirectUri must be a valid http or https URL.',
  })
  public googleAdsRedirectUri!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(/^v\d+$/u, {
    message: 'googleAdsApiVersion must follow the format v21.',
  })
  public googleAdsApiVersion!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  public developerTokenAlias!: string;

  @Transform(({ value }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(255)
  public developerTokenValue?: string | undefined;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(32)
  @Matches(/^\d*$/u, {
    message: 'loginCustomerId must contain only digits.',
  })
  public loginCustomerId!: string;

  @Transform(({ value }) => trimString(value))
  @IsIn(GOOGLE_ADS_ADMIN_INTEGRATION_MODES)
  public integrationMode!: (typeof GOOGLE_ADS_ADMIN_INTEGRATION_MODES)[number];

  @IsBoolean()
  public requireMfaForChanges!: boolean;

  @IsBoolean()
  public enableManualSync!: boolean;

  @IsBoolean()
  public allowSearchTerms!: boolean;

  @Transform(({ value }) => trimString(value))
  @IsIn(GOOGLE_ADS_ADMIN_INTRADAY_SYNC_WINDOWS)
  public intradaySyncWindow!: (typeof GOOGLE_ADS_ADMIN_INTRADAY_SYNC_WINDOWS)[number];
}
