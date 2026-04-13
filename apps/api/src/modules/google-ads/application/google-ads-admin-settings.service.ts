import { randomBytes, createCipheriv } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ApiEnvironment } from '../../../common/config/environment';
import type {
  GoogleAdsAdminSettingsView,
  UpdateGoogleAdsAdminSettingsInput,
} from '../domain/google-ads-admin-settings.types';

interface EncryptedSecretEnvelope {
  readonly algorithm: 'aes-256-gcm';
  readonly keyVersion: number;
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly updatedAt: string;
}

interface StoredGoogleAdsAdminSettingsFile {
  readonly version: 1;
  readonly updatedAt: string | null;
  readonly settings: Omit<
    GoogleAdsAdminSettingsView,
    'hasGoogleClientSecret' | 'hasDeveloperToken' | 'updatedAt'
  >;
  readonly secrets: {
    readonly googleClientSecret?: EncryptedSecretEnvelope | undefined;
    readonly developerToken?: EncryptedSecretEnvelope | undefined;
  };
}

@Injectable()
export class GoogleAdsAdminSettingsService {
  private readonly storageFilePath = resolve(
    process.cwd(),
    'storage',
    'admin',
    'google-ads-platform-settings.json',
  );

  public constructor(
    private readonly configService: ConfigService<ApiEnvironment, true>,
  ) {}

  public async getSettings(): Promise<GoogleAdsAdminSettingsView> {
    const storedSettings = await this.loadStoredSettings();

    return {
      ...storedSettings.settings,
      hasGoogleClientSecret: storedSettings.secrets.googleClientSecret !== undefined,
      hasDeveloperToken: storedSettings.secrets.developerToken !== undefined,
      updatedAt: storedSettings.updatedAt,
    };
  }

  public async updateSettings(
    input: UpdateGoogleAdsAdminSettingsInput,
  ): Promise<GoogleAdsAdminSettingsView> {
    const currentSettings = await this.loadStoredSettings();
    const updatedAt = new Date().toISOString();

    const nextSettings: StoredGoogleAdsAdminSettingsFile = {
      version: 1,
      updatedAt,
      settings: {
        googleClientId: input.googleClientId,
        googleAdsRedirectUri: input.googleAdsRedirectUri,
        googleAdsApiVersion: input.googleAdsApiVersion,
        developerTokenAlias: input.developerTokenAlias,
        loginCustomerId: input.loginCustomerId,
        integrationMode: input.integrationMode,
        requireMfaForChanges: input.requireMfaForChanges,
        enableManualSync: input.enableManualSync,
        allowSearchTerms: input.allowSearchTerms,
        intradaySyncWindow: input.intradaySyncWindow,
      },
      secrets: {
        googleClientSecret:
          input.googleClientSecret !== undefined
            ? this.encryptSecret(input.googleClientSecret, updatedAt)
            : currentSettings.secrets.googleClientSecret,
        developerToken:
          input.developerTokenValue !== undefined
            ? this.encryptSecret(input.developerTokenValue, updatedAt)
            : currentSettings.secrets.developerToken,
      },
    };

    await this.saveStoredSettings(nextSettings);

    return {
      ...nextSettings.settings,
      hasGoogleClientSecret: nextSettings.secrets.googleClientSecret !== undefined,
      hasDeveloperToken: nextSettings.secrets.developerToken !== undefined,
      updatedAt: nextSettings.updatedAt,
    };
  }

  private async loadStoredSettings(): Promise<StoredGoogleAdsAdminSettingsFile> {
    try {
      const fileContent = await readFile(this.storageFilePath, 'utf8');
      return JSON.parse(fileContent) as StoredGoogleAdsAdminSettingsFile;
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return this.buildDefaultSettings();
      }

      throw error;
    }
  }

  private async saveStoredSettings(
    payload: StoredGoogleAdsAdminSettingsFile,
  ): Promise<void> {
    const fileDirectory = dirname(this.storageFilePath);
    const temporaryFilePath = `${this.storageFilePath}.tmp`;

    await mkdir(fileDirectory, {
      recursive: true,
    });
    await writeFile(temporaryFilePath, JSON.stringify(payload, null, 2), 'utf8');
    await rename(temporaryFilePath, this.storageFilePath);
  }

  private buildDefaultSettings(): StoredGoogleAdsAdminSettingsFile {
    return {
      version: 1,
      updatedAt: null,
      settings: {
        googleClientId: this.configService.get('GOOGLE_CLIENT_ID', {
          infer: true,
        }),
        googleAdsRedirectUri: this.configService.get('GOOGLE_ADS_REDIRECT_URI', {
          infer: true,
        }),
        googleAdsApiVersion: this.configService.get('GOOGLE_ADS_API_VERSION', {
          infer: true,
        }),
        developerTokenAlias: 'primary-google-ads-token',
        loginCustomerId:
          this.configService.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID', {
            infer: true,
          }) ?? '',
        integrationMode:
          this.configService.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID', {
            infer: true,
          }) !== undefined
            ? 'mcc'
            : 'single-account',
        requireMfaForChanges: this.configService.get(
          'AUTH_ENFORCE_MFA_FOR_PRIVILEGED_USERS',
          {
            infer: true,
          },
        ),
        enableManualSync: true,
        allowSearchTerms: false,
        intradaySyncWindow: '2h',
      },
      secrets: {
        googleClientSecret: this.encryptSecret(
          this.configService.get('GOOGLE_CLIENT_SECRET', {
            infer: true,
          }),
          new Date().toISOString(),
        ),
        developerToken: this.encryptSecret(
          this.configService.get('GOOGLE_ADS_DEVELOPER_TOKEN', {
            infer: true,
          }),
          new Date().toISOString(),
        ),
      },
    };
  }

  private encryptSecret(
    plainTextValue: string,
    updatedAt: string,
  ): EncryptedSecretEnvelope {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainTextValue, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      algorithm: 'aes-256-gcm',
      keyVersion: 1,
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      updatedAt,
    };
  }

  private getEncryptionKey(): Buffer {
    const configuredKey = this.configService.get('APP_ENCRYPTION_KEY', {
      infer: true,
    });

    if (configuredKey.startsWith('base64:')) {
      return Buffer.from(configuredKey.slice('base64:'.length), 'base64');
    }

    return Buffer.from(configuredKey, 'hex');
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'code') === 'ENOENT'
  );
}
