export const GOOGLE_ADS_ADMIN_INTEGRATION_MODES = [
  'mcc',
  'single-account',
] as const;

export const GOOGLE_ADS_ADMIN_INTRADAY_SYNC_WINDOWS = [
  '2h',
  '4h',
  '6h',
] as const;

export type GoogleAdsAdminIntegrationMode =
  (typeof GOOGLE_ADS_ADMIN_INTEGRATION_MODES)[number];

export type GoogleAdsAdminIntradaySyncWindow =
  (typeof GOOGLE_ADS_ADMIN_INTRADAY_SYNC_WINDOWS)[number];

export interface GoogleAdsAdminSettingsView {
  readonly googleClientId: string;
  readonly googleAdsRedirectUri: string;
  readonly googleAdsApiVersion: string;
  readonly developerTokenAlias: string;
  readonly loginCustomerId: string;
  readonly integrationMode: GoogleAdsAdminIntegrationMode;
  readonly requireMfaForChanges: boolean;
  readonly enableManualSync: boolean;
  readonly allowSearchTerms: boolean;
  readonly intradaySyncWindow: GoogleAdsAdminIntradaySyncWindow;
  readonly hasGoogleClientSecret: boolean;
  readonly hasDeveloperToken: boolean;
  readonly updatedAt: string | null;
}

export interface UpdateGoogleAdsAdminSettingsInput {
  readonly googleClientId: string;
  readonly googleAdsRedirectUri: string;
  readonly googleAdsApiVersion: string;
  readonly developerTokenAlias: string;
  readonly loginCustomerId: string;
  readonly integrationMode: GoogleAdsAdminIntegrationMode;
  readonly requireMfaForChanges: boolean;
  readonly enableManualSync: boolean;
  readonly allowSearchTerms: boolean;
  readonly intradaySyncWindow: GoogleAdsAdminIntradaySyncWindow;
  readonly googleClientSecret?: string | undefined;
  readonly developerTokenValue?: string | undefined;
}
