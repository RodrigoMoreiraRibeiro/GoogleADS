import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GoogleAdsAdminSettingsService } from './application/google-ads-admin-settings.service';
import { GoogleAdsAdminSettingsController } from './presentation/http/google-ads-admin-settings.controller';

@Module({
  imports: [ConfigModule],
  controllers: [GoogleAdsAdminSettingsController],
  providers: [GoogleAdsAdminSettingsService],
  exports: [GoogleAdsAdminSettingsService],
})
export class GoogleAdsModule {}
