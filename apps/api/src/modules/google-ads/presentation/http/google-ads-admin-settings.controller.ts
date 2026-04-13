import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ApiEnvironment } from '../../../../common/config/environment';
import { GoogleAdsAdminSettingsService } from '../../application/google-ads-admin-settings.service';
import type { GoogleAdsAdminSettingsView } from '../../domain/google-ads-admin-settings.types';
import { UpdateGoogleAdsAdminSettingsDto } from './dto/update-google-ads-admin-settings.dto';

@Controller('admin/settings/google-ads')
export class GoogleAdsAdminSettingsController {
  public constructor(
    private readonly configService: ConfigService<ApiEnvironment, true>,
    private readonly googleAdsAdminSettingsService: GoogleAdsAdminSettingsService,
  ) {}

  @Get()
  public async getSettings(): Promise<GoogleAdsAdminSettingsView> {
    this.ensureDevelopmentOnly();
    return this.googleAdsAdminSettingsService.getSettings();
  }

  @Put()
  public async updateSettings(
    @Body() input: UpdateGoogleAdsAdminSettingsDto,
  ): Promise<GoogleAdsAdminSettingsView> {
    this.ensureDevelopmentOnly();
    return this.googleAdsAdminSettingsService.updateSettings(input);
  }

  private ensureDevelopmentOnly(): void {
    const environment = this.configService.get('NODE_ENV', {
      infer: true,
    });

    if (environment !== 'development') {
      throw new ForbiddenException(
        'This temporary admin settings endpoint is available only in local development until authenticated admin flows are implemented.',
      );
    }
  }
}
