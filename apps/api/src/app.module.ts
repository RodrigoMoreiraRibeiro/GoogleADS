import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { getApiEnvironment } from './common/config/environment';
import { AuditModule } from './modules/audit/audit.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { GoogleAdsModule } from './modules/google-ads/google-ads.module';
import { HealthModule } from './modules/health/health.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: getApiEnvironment,
    }),
    HealthModule,
    AuthModule,
    TenancyModule,
    UsersModule,
    ClientsModule,
    GoogleAdsModule,
    SyncModule,
    AnalyticsModule,
    InsightsModule,
    ReportsModule,
    AuditModule,
  ],
})
export class AppModule {}
