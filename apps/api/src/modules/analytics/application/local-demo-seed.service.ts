import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { LocalDemoSeedResponse } from '@googleads/shared';

import type { ApiEnvironment } from '../../../common/config/environment';
import { PrismaService } from '../../../common/database/prisma.service';

type DemoJobType = 'daily_campaign' | 'daily_campaign_geo' | 'aggregation';

interface DemoCampaignSeed {
  readonly googleCampaignId: number;
  readonly name: string;
  readonly status: string;
  readonly channelType: string;
  readonly biddingStrategyType: string;
  readonly baseImpressions: number;
  readonly ctr: number;
  readonly baseCpc: number;
  readonly conversionRate: number;
  readonly valuePerConversion: number;
  readonly volatility: number;
  readonly phaseOffset: number;
  readonly recentPenalty: number;
  readonly impressionShare: number;
}

interface DemoClientSeed {
  readonly name: string;
  readonly legalName: string;
  readonly timezone: string;
  readonly currencyCode: string;
  readonly oauthSubject: string;
  readonly googleEmail: string;
  readonly customerId: number;
  readonly customerName: string;
  readonly descriptiveName: string;
  readonly managerCustomerId: number;
  readonly campaigns: readonly DemoCampaignSeed[];
}

interface DemoTenantSeed {
  readonly uuid: string;
  readonly slug: string;
  readonly name: string;
  readonly timezone: string;
  readonly currencyCode: string;
  readonly clients: readonly DemoClientSeed[];
}

interface DailyAggregateRow {
  readonly reportDate: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly conversionsValue: number;
}

const DEMO_USER = {
  uuid: 'f78584b8-b253-4d8e-a7b5-b8207a9c1001',
  name: 'Local Workspace Admin',
  email: 'admin@local.test',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$local$demo-only-hash',
} as const;

const DEMO_TENANTS: readonly DemoTenantSeed[] = [
  {
    uuid: 'f78584b8-b253-4d8e-a7b5-b8207a9c2001',
    slug: 'demo-agency',
    name: 'Agencia Atlas',
    timezone: 'America/Sao_Paulo',
    currencyCode: 'BRL',
    clients: [
      {
        name: 'Clinica Aurora',
        legalName: 'Clinica Aurora Odontologia Ltda',
        timezone: 'America/Sao_Paulo',
        currencyCode: 'BRL',
        oauthSubject: 'aurora-owner-local',
        googleEmail: 'aurora@local.test',
        customerId: 1111111111,
        customerName: 'Aurora Google Ads',
        descriptiveName: 'Aurora | Unidade Centro',
        managerCustomerId: 9991112222,
        campaigns: [
          { googleCampaignId: 410001, name: 'Marca Odonto', status: 'ENABLED', channelType: 'SEARCH', biddingStrategyType: 'TARGET_IMPRESSION_SHARE', baseImpressions: 3200, ctr: 0.125, baseCpc: 1.55, conversionRate: 0.165, valuePerConversion: 210, volatility: 0.08, phaseOffset: 0.3, recentPenalty: 0, impressionShare: 0.84 },
          { googleCampaignId: 410002, name: 'Implante Dentario', status: 'ENABLED', channelType: 'SEARCH', biddingStrategyType: 'MAXIMIZE_CONVERSIONS', baseImpressions: 4600, ctr: 0.082, baseCpc: 3.95, conversionRate: 0.084, valuePerConversion: 420, volatility: 0.12, phaseOffset: 1.4, recentPenalty: 0.08, impressionShare: 0.67 },
          { googleCampaignId: 410003, name: 'Ortodontia Invisivel', status: 'ENABLED', channelType: 'SEARCH', biddingStrategyType: 'MAXIMIZE_CONVERSIONS', baseImpressions: 5200, ctr: 0.062, baseCpc: 4.75, conversionRate: 0.051, valuePerConversion: 350, volatility: 0.14, phaseOffset: 2.1, recentPenalty: 0.24, impressionShare: 0.53 },
        ],
      },
      {
        name: 'Casa Ventura',
        legalName: 'Casa Ventura Decor Ltda',
        timezone: 'America/Sao_Paulo',
        currencyCode: 'BRL',
        oauthSubject: 'ventura-owner-local',
        googleEmail: 'ventura@local.test',
        customerId: 2222222222,
        customerName: 'Ventura Google Ads',
        descriptiveName: 'Ventura | E-commerce',
        managerCustomerId: 9991112222,
        campaigns: [
          { googleCampaignId: 420001, name: 'Pesquisa Decoracao', status: 'ENABLED', channelType: 'SEARCH', biddingStrategyType: 'MAXIMIZE_CONVERSION_VALUE', baseImpressions: 3800, ctr: 0.091, baseCpc: 2.8, conversionRate: 0.072, valuePerConversion: 320, volatility: 0.1, phaseOffset: 0.8, recentPenalty: 0.03, impressionShare: 0.71 },
          { googleCampaignId: 420002, name: 'Shopping Premium', status: 'ENABLED', channelType: 'SHOPPING', biddingStrategyType: 'MAXIMIZE_CONVERSION_VALUE', baseImpressions: 6900, ctr: 0.041, baseCpc: 1.95, conversionRate: 0.036, valuePerConversion: 510, volatility: 0.15, phaseOffset: 1.7, recentPenalty: 0.12, impressionShare: 0.63 },
          { googleCampaignId: 420003, name: 'Remarketing Decor', status: 'ENABLED', channelType: 'DISPLAY', biddingStrategyType: 'MAXIMIZE_CONVERSIONS', baseImpressions: 8200, ctr: 0.013, baseCpc: 1.15, conversionRate: 0.024, valuePerConversion: 260, volatility: 0.18, phaseOffset: 2.4, recentPenalty: 0.18, impressionShare: 0.58 },
        ],
      },
    ],
  },
  {
    uuid: 'f78584b8-b253-4d8e-a7b5-b8207a9c2002',
    slug: 'northwind-growth',
    name: 'Northwind Growth',
    timezone: 'America/Sao_Paulo',
    currencyCode: 'BRL',
    clients: [
      {
        name: 'Orto Prime',
        legalName: 'Orto Prime Clinica Integrada Ltda',
        timezone: 'America/Sao_Paulo',
        currencyCode: 'BRL',
        oauthSubject: 'ortoprime-owner-local',
        googleEmail: 'ortoprime@local.test',
        customerId: 3333333333,
        customerName: 'Orto Prime Google Ads',
        descriptiveName: 'Orto Prime | Unidade Sul',
        managerCustomerId: 9995554444,
        campaigns: [
          { googleCampaignId: 430001, name: 'Marca Ortodontia', status: 'ENABLED', channelType: 'SEARCH', biddingStrategyType: 'MAXIMIZE_CONVERSIONS', baseImpressions: 2700, ctr: 0.118, baseCpc: 1.62, conversionRate: 0.142, valuePerConversion: 230, volatility: 0.07, phaseOffset: 0.4, recentPenalty: 0, impressionShare: 0.86 },
          { googleCampaignId: 430002, name: 'Aparelho Invisivel', status: 'ENABLED', channelType: 'SEARCH', biddingStrategyType: 'MAXIMIZE_CONVERSIONS', baseImpressions: 4100, ctr: 0.074, baseCpc: 4.15, conversionRate: 0.066, valuePerConversion: 390, volatility: 0.12, phaseOffset: 1.2, recentPenalty: 0.1, impressionShare: 0.61 },
          { googleCampaignId: 430003, name: 'Implante Completo', status: 'ENABLED', channelType: 'SEARCH', biddingStrategyType: 'TARGET_CPA', baseImpressions: 3600, ctr: 0.069, baseCpc: 4.55, conversionRate: 0.058, valuePerConversion: 470, volatility: 0.11, phaseOffset: 2.5, recentPenalty: 0.15, impressionShare: 0.57 },
        ],
      },
    ],
  },
] as const;

@Injectable()
export class LocalDemoSeedService {
  private readonly reportDays = 60;

  public constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService<ApiEnvironment, true>,
  ) {}

  public async seed(): Promise<LocalDemoSeedResponse> {
    try {
      return await this.prismaService.$transaction(
        async (transactionClient: Prisma.TransactionClient) => {
        const adminUserId = await this.upsertUser(transactionClient);

        for (const tenantSeed of DEMO_TENANTS) {
          const tenantId = await this.upsertTenant(transactionClient, tenantSeed);
          await this.clearTenantData(transactionClient, tenantId);
          const membershipId = await this.upsertMembership(
            transactionClient,
            tenantId,
            adminUserId,
          );

          for (const clientSeed of tenantSeed.clients) {
            await this.seedClient(
              transactionClient,
              tenantId,
              membershipId,
              adminUserId,
              clientSeed,
            );
          }
        }

        return {
          tenantCount: DEMO_TENANTS.length,
          clientCount: DEMO_TENANTS.reduce((total, tenant) => total + tenant.clients.length, 0),
          accountCount: DEMO_TENANTS.reduce((total, tenant) => total + tenant.clients.length, 0),
          campaignCount: DEMO_TENANTS.reduce(
            (total, tenant) =>
              total +
              tenant.clients.reduce((clientTotal, client) => clientTotal + client.campaigns.length, 0),
            0,
          ),
          insightCount: DEMO_TENANTS.reduce((total, tenant) => total + tenant.clients.length * 3, 0),
          reportCount: DEMO_TENANTS.reduce((total, tenant) => total + tenant.clients.length * 2, 0),
          seededAt: new Date().toISOString(),
        };
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Nao foi possivel popular o banco local. Confirme se o MySQL esta ativo e se o schema foi aplicado.',
      );
    }
  }

  private async seedClient(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    membershipId: number,
    adminUserId: number,
    clientSeed: DemoClientSeed,
  ): Promise<void> {
    const clientId = await this.upsertClient(transactionClient, tenantId, clientSeed);
    await this.upsertClientAccess(transactionClient, tenantId, clientId, membershipId);
    const connectionId = await this.upsertConnection(
      transactionClient,
      tenantId,
      clientId,
      adminUserId,
      clientSeed,
    );
    const accountId = await this.upsertAccount(
      transactionClient,
      tenantId,
      clientId,
      connectionId,
      clientSeed,
    );
    const campaignIds = await this.upsertCampaigns(
      transactionClient,
      tenantId,
      clientId,
      accountId,
      clientSeed.campaigns,
    );
    const dailyRows = await this.seedDailyPerformance(
      transactionClient,
      tenantId,
      clientId,
      accountId,
      clientSeed,
      campaignIds,
    );
    await this.seedSyncState(transactionClient, tenantId, clientId, accountId);
    await this.seedInsights(transactionClient, tenantId, clientId, accountId, clientSeed);
    await this.seedReports(transactionClient, tenantId, clientId, adminUserId);
    await this.upsertPeriodAggregate(transactionClient, tenantId, clientId, 'last_7d', dailyRows.slice(-7));
    await this.upsertPeriodAggregate(transactionClient, tenantId, clientId, 'last_30d', dailyRows.slice(-30));
    const currentMonth = dailyRows.at(-1)?.reportDate.slice(0, 7) ?? '';
    await this.upsertPeriodAggregate(
      transactionClient,
      tenantId,
      clientId,
      'month_to_date',
      dailyRows.filter((row) => row.reportDate.startsWith(currentMonth)),
    );
  }

  private async upsertTenant(
    transactionClient: Prisma.TransactionClient,
    tenantSeed: DemoTenantSeed,
  ): Promise<number> {
    await transactionClient.$executeRaw`
      INSERT INTO tenants (uuid, name, slug, status, timezone, currency_code, plan_code)
      VALUES (${tenantSeed.uuid}, ${tenantSeed.name}, ${tenantSeed.slug}, 'active', ${tenantSeed.timezone}, ${tenantSeed.currencyCode}, 'local-demo')
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        name = VALUES(name),
        status = VALUES(status),
        timezone = VALUES(timezone),
        currency_code = VALUES(currency_code),
        plan_code = VALUES(plan_code)
    `;

    return this.getLastInsertId(transactionClient);
  }

  private async upsertUser(
    transactionClient: Prisma.TransactionClient,
  ): Promise<number> {
    await transactionClient.$executeRaw`
      INSERT INTO users (uuid, name, email, password_hash, platform_role, status, mfa_enabled)
      VALUES (${DEMO_USER.uuid}, ${DEMO_USER.name}, ${DEMO_USER.email}, ${DEMO_USER.passwordHash}, 'superadmin', 'active', 0)
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        name = VALUES(name),
        password_hash = VALUES(password_hash),
        platform_role = VALUES(platform_role),
        status = VALUES(status)
    `;

    return this.getLastInsertId(transactionClient);
  }

  private async upsertMembership(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    userId: number,
  ): Promise<number> {
    await transactionClient.$executeRaw`
      INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
      VALUES (${tenantId}, ${userId}, 'agency_owner', 'active')
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        role = VALUES(role),
        status = VALUES(status)
    `;

    return this.getLastInsertId(transactionClient);
  }

  private async upsertClient(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientSeed: DemoClientSeed,
  ): Promise<number> {
    await transactionClient.$executeRaw`
      INSERT INTO clients (tenant_id, name, legal_name, status, timezone, reporting_currency_code, notes)
      VALUES (
        ${tenantId},
        ${clientSeed.name},
        ${clientSeed.legalName},
        'active',
        ${clientSeed.timezone},
        ${clientSeed.currencyCode},
        'Cliente de demonstracao para validar dashboard, sync e relatorios.'
      )
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        legal_name = VALUES(legal_name),
        status = VALUES(status),
        timezone = VALUES(timezone),
        reporting_currency_code = VALUES(reporting_currency_code),
        notes = VALUES(notes)
    `;

    return this.getLastInsertId(transactionClient);
  }

  private async upsertClientAccess(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    membershipId: number,
  ): Promise<void> {
    await transactionClient.$executeRaw`
      INSERT INTO client_access (tenant_id, client_id, membership_id, access_level)
      VALUES (${tenantId}, ${clientId}, ${membershipId}, 'admin')
      ON DUPLICATE KEY UPDATE
        access_level = VALUES(access_level)
    `;
  }

  private async upsertConnection(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    adminUserId: number,
    clientSeed: DemoClientSeed,
  ): Promise<number> {
    const encryptedRefreshToken = this.encryptDemoSecret(
      `refresh-token-${clientSeed.customerId}`,
    );

    await transactionClient.$executeRaw`
      INSERT INTO google_ads_connections (
        tenant_id,
        client_id,
        oauth_subject,
        google_email,
        manager_customer_id,
        login_customer_id,
        developer_token_alias,
        refresh_token_ciphertext,
        refresh_token_iv,
        refresh_token_tag,
        token_key_version,
        scopes_json,
        status,
        last_token_check_at,
        last_sync_at,
        sync_frequency_minutes,
        created_by_user_id
      ) VALUES (
        ${tenantId},
        ${clientId},
        ${clientSeed.oauthSubject},
        ${clientSeed.googleEmail},
        ${clientSeed.managerCustomerId},
        ${clientSeed.managerCustomerId},
        'local-demo-platform-token',
        ${encryptedRefreshToken.ciphertext},
        ${encryptedRefreshToken.iv},
        ${encryptedRefreshToken.tag},
        1,
        ${JSON.stringify(['https://www.googleapis.com/auth/adwords'])},
        'active',
        ${hoursAgo(1)},
        ${hoursAgo(2)},
        180,
        ${adminUserId}
      )
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        client_id = VALUES(client_id),
        google_email = VALUES(google_email),
        manager_customer_id = VALUES(manager_customer_id),
        login_customer_id = VALUES(login_customer_id),
        developer_token_alias = VALUES(developer_token_alias),
        refresh_token_ciphertext = VALUES(refresh_token_ciphertext),
        refresh_token_iv = VALUES(refresh_token_iv),
        refresh_token_tag = VALUES(refresh_token_tag),
        token_key_version = VALUES(token_key_version),
        scopes_json = VALUES(scopes_json),
        status = VALUES(status),
        last_token_check_at = VALUES(last_token_check_at),
        last_sync_at = VALUES(last_sync_at),
        sync_frequency_minutes = VALUES(sync_frequency_minutes),
        created_by_user_id = VALUES(created_by_user_id)
    `;

    return this.getLastInsertId(transactionClient);
  }

  private async upsertAccount(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    connectionId: number,
    clientSeed: DemoClientSeed,
  ): Promise<number> {
    await transactionClient.$executeRaw`
      INSERT INTO google_ads_accounts (
        tenant_id,
        client_id,
        connection_id,
        customer_id,
        customer_name,
        descriptive_name,
        currency_code,
        time_zone,
        status,
        is_manager,
        is_test_account,
        last_metadata_sync_at,
        last_metric_sync_at
      ) VALUES (
        ${tenantId},
        ${clientId},
        ${connectionId},
        ${clientSeed.customerId},
        ${clientSeed.customerName},
        ${clientSeed.descriptiveName},
        ${clientSeed.currencyCode},
        ${clientSeed.timezone},
        'active',
        0,
        0,
        ${hoursAgo(3)},
        ${hoursAgo(2)}
      )
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        client_id = VALUES(client_id),
        connection_id = VALUES(connection_id),
        customer_name = VALUES(customer_name),
        descriptive_name = VALUES(descriptive_name),
        currency_code = VALUES(currency_code),
        time_zone = VALUES(time_zone),
        status = VALUES(status),
        last_metadata_sync_at = VALUES(last_metadata_sync_at),
        last_metric_sync_at = VALUES(last_metric_sync_at)
    `;

    return this.getLastInsertId(transactionClient);
  }

  private async upsertCampaigns(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    accountId: number,
    campaigns: readonly DemoCampaignSeed[],
  ): Promise<Map<number, number>> {
    const campaignIds = new Map<number, number>();

    for (const campaignSeed of campaigns) {
      await transactionClient.$executeRaw`
        INSERT INTO dim_campaigns (
          tenant_id,
          client_id,
          google_ads_account_id,
          google_campaign_id,
          name,
          advertising_channel_type,
          bidding_strategy_type,
          status,
          start_date,
          end_date,
          source_updated_at,
          last_seen_at
        ) VALUES (
          ${tenantId},
          ${clientId},
          ${accountId},
          ${campaignSeed.googleCampaignId},
          ${campaignSeed.name},
          ${campaignSeed.channelType},
          ${campaignSeed.biddingStrategyType},
          ${campaignSeed.status},
          ${formatDate(daysAgo(120))},
          NULL,
          ${hoursAgo(4)},
          ${hoursAgo(2)}
        )
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          name = VALUES(name),
          advertising_channel_type = VALUES(advertising_channel_type),
          bidding_strategy_type = VALUES(bidding_strategy_type),
          status = VALUES(status),
          source_updated_at = VALUES(source_updated_at),
          last_seen_at = VALUES(last_seen_at)
      `;

      campaignIds.set(
        campaignSeed.googleCampaignId,
        await this.getLastInsertId(transactionClient),
      );
    }

    return campaignIds;
  }

  private async seedDailyPerformance(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    accountId: number,
    clientSeed: DemoClientSeed,
    campaignIds: Map<number, number>,
  ): Promise<DailyAggregateRow[]> {
    const dailyRows: DailyAggregateRow[] = [];

    for (let daysOffset = this.reportDays; daysOffset >= 1; daysOffset -= 1) {
      const reportDate = daysAgo(daysOffset);
      const sqlReportDate = formatDate(reportDate);
      const isWeekend = reportDate.getDay() === 0 || reportDate.getDay() === 6;
      const dayIndex = this.reportDays - daysOffset;
      const syncedAt = hoursAgo(2);

      let totalImpressions = 0;
      let totalClicks = 0;
      let totalCost = 0;
      let totalConversions = 0;
      let totalConversionsValue = 0;

      for (const campaignSeed of clientSeed.campaigns) {
        const metrics = buildCampaignDayMetrics(
          campaignSeed,
          dayIndex,
          isWeekend,
          dayIndex >= this.reportDays - 7,
        );

        await transactionClient.$executeRaw`
          INSERT INTO fact_google_ads_campaign_daily (
            tenant_id,
            client_id,
            google_ads_account_id,
            campaign_dim_id,
            google_campaign_id,
            report_date,
            impressions,
            clicks,
            cost_micros,
            conversions,
            conversions_value,
            ctr,
            average_cpc,
            average_cpm,
            search_impression_share,
            search_budget_lost_impression_share,
            search_rank_lost_impression_share,
            synced_at
          ) VALUES (
            ${tenantId},
            ${clientId},
            ${accountId},
            ${campaignIds.get(campaignSeed.googleCampaignId) ?? null},
            ${campaignSeed.googleCampaignId},
            ${sqlReportDate},
            ${metrics.impressions},
            ${metrics.clicks},
            ${toCostMicros(metrics.cost)},
            ${metrics.conversions},
            ${metrics.conversionsValue},
            ${roundNullableNumber(metrics.impressions > 0 ? metrics.clicks / metrics.impressions : null, 6)},
            ${roundNullableNumber(metrics.clicks > 0 ? metrics.cost / metrics.clicks : null, 6)},
            ${roundNullableNumber(metrics.impressions > 0 ? (metrics.cost / metrics.impressions) * 1000 : null, 6)},
            ${roundNullableNumber(metrics.searchImpressionShare, 6)},
            ${roundNullableNumber(Math.max(0.04, 1 - metrics.searchImpressionShare - 0.1), 6)},
            ${roundNullableNumber(0.1, 6)},
            ${syncedAt}
          )
        `;

        totalImpressions += metrics.impressions;
        totalClicks += metrics.clicks;
        totalCost += metrics.cost;
        totalConversions += metrics.conversions;
        totalConversionsValue += metrics.conversionsValue;
      }

      await transactionClient.$executeRaw`
        INSERT INTO fact_google_ads_account_daily (
          tenant_id,
          client_id,
          google_ads_account_id,
          report_date,
          impressions,
          clicks,
          cost_micros,
          conversions,
          conversions_value,
          ctr,
          average_cpc,
          average_cpm,
          search_impression_share,
          search_budget_lost_impression_share,
          search_rank_lost_impression_share,
          synced_at
        ) VALUES (
          ${tenantId},
          ${clientId},
          ${accountId},
          ${sqlReportDate},
          ${totalImpressions},
          ${totalClicks},
          ${toCostMicros(totalCost)},
          ${roundNumber(totalConversions, 4)},
          ${roundNumber(totalConversionsValue, 4)},
          ${roundNullableNumber(totalImpressions > 0 ? totalClicks / totalImpressions : null, 6)},
          ${roundNullableNumber(totalClicks > 0 ? totalCost / totalClicks : null, 6)},
          ${roundNullableNumber(totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : null, 6)},
          ${roundNullableNumber(0.69, 6)},
          ${roundNullableNumber(0.13, 6)},
          ${roundNullableNumber(0.18, 6)},
          ${syncedAt}
        )
      `;

      await transactionClient.$executeRaw`
        INSERT INTO agg_client_kpi_daily (
          tenant_id,
          client_id,
          report_date,
          spend,
          impressions,
          clicks,
          conversions,
          conversions_value,
          ctr,
          cpa,
          roas,
          synced_at
        ) VALUES (
          ${tenantId},
          ${clientId},
          ${sqlReportDate},
          ${roundNumber(totalCost, 2)},
          ${totalImpressions},
          ${totalClicks},
          ${roundNumber(totalConversions, 4)},
          ${roundNumber(totalConversionsValue, 4)},
          ${roundNullableNumber(totalImpressions > 0 ? totalClicks / totalImpressions : null, 6)},
          ${roundNullableNumber(totalConversions > 0 ? totalCost / totalConversions : null, 6)},
          ${roundNullableNumber(totalCost > 0 ? totalConversionsValue / totalCost : null, 6)},
          ${syncedAt}
        )
      `;

      dailyRows.push({
        reportDate: sqlReportDate,
        spend: roundNumber(totalCost, 2),
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: roundNumber(totalConversions, 4),
        conversionsValue: roundNumber(totalConversionsValue, 4),
      });
    }

    return dailyRows;
  }

  private async upsertPeriodAggregate(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    periodType: 'last_7d' | 'last_30d' | 'month_to_date',
    rows: readonly DailyAggregateRow[],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const totals = rows.reduce(
      (accumulator, row) => ({
        spend: accumulator.spend + row.spend,
        impressions: accumulator.impressions + row.impressions,
        clicks: accumulator.clicks + row.clicks,
        conversions: accumulator.conversions + row.conversions,
        conversionsValue: accumulator.conversionsValue + row.conversionsValue,
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 },
    );

    await transactionClient.$executeRaw`
      INSERT INTO agg_client_kpi_period (
        tenant_id,
        client_id,
        period_type,
        period_start,
        period_end,
        spend,
        impressions,
        clicks,
        conversions,
        conversions_value,
        ctr,
        cpa,
        roas,
        generated_at
      ) VALUES (
        ${tenantId},
        ${clientId},
        ${periodType},
        ${rows[0]?.reportDate ?? null},
        ${rows.at(-1)?.reportDate ?? null},
        ${roundNumber(totals.spend, 2)},
        ${totals.impressions},
        ${totals.clicks},
        ${roundNumber(totals.conversions, 4)},
        ${roundNumber(totals.conversionsValue, 4)},
        ${roundNullableNumber(totals.impressions > 0 ? totals.clicks / totals.impressions : null, 6)},
        ${roundNullableNumber(totals.conversions > 0 ? totals.spend / totals.conversions : null, 6)},
        ${roundNullableNumber(totals.spend > 0 ? totals.conversionsValue / totals.spend : null, 6)},
        ${hoursAgo(2)}
      )
      ON DUPLICATE KEY UPDATE
        spend = VALUES(spend),
        impressions = VALUES(impressions),
        clicks = VALUES(clicks),
        conversions = VALUES(conversions),
        conversions_value = VALUES(conversions_value),
        ctr = VALUES(ctr),
        cpa = VALUES(cpa),
        roas = VALUES(roas),
        generated_at = VALUES(generated_at)
    `;
  }

  private async seedSyncState(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    accountId: number,
  ): Promise<void> {
    const latestReportDate = formatDate(daysAgo(1));
    const successJobId = await this.insertSyncJob(
      transactionClient,
      tenantId,
      clientId,
      accountId,
      'daily_campaign',
      'succeeded',
      3,
      hoursAgo(3),
      hoursAgo(2),
      hoursAgo(2),
      latestReportDate,
      latestReportDate,
      null,
      null,
    );
    const failedJobId = await this.insertSyncJob(
      transactionClient,
      tenantId,
      clientId,
      accountId,
      'daily_campaign_geo',
      'failed',
      6,
      hoursAgo(7),
      hoursAgo(6),
      hoursAgo(6),
      formatDate(daysAgo(7)),
      latestReportDate,
      'RESOURCE_EXHAUSTED',
      'Tentativa local simulada encerrada apos backoff.',
    );
    await this.insertSyncJob(
      transactionClient,
      tenantId,
      clientId,
      accountId,
      'aggregation',
      'queued',
      4,
      minutesFromNow(12),
      null,
      null,
      latestReportDate,
      latestReportDate,
      null,
      null,
    );

    const successRunId = await this.insertSyncRun(
      transactionClient,
      tenantId,
      clientId,
      accountId,
      successJobId,
      'daily_campaign',
      'campaign_daily',
      'succeeded',
      latestReportDate,
      latestReportDate,
      hoursAgo(2),
      hoursAgo(2),
      180,
      180,
      0,
      180,
      0,
      3,
      3,
      null,
      null,
    );
    await this.insertSyncRun(
      transactionClient,
      tenantId,
      clientId,
      accountId,
      failedJobId,
      'daily_campaign_geo',
      'campaign_geo_daily',
      'failed',
      formatDate(daysAgo(7)),
      latestReportDate,
      hoursAgo(6),
      hoursAgo(6),
      42,
      18,
      0,
      18,
      0,
      4,
      4,
      'RESOURCE_EXHAUSTED',
      'Erro simulado de quota para validar observabilidade local.',
    );

    await transactionClient.$executeRaw`
      INSERT INTO sync_checkpoints (
        tenant_id,
        client_id,
        google_ads_account_id,
        checkpoint_scope,
        checkpoint_key,
        watermark_date,
        watermark_datetime,
        safe_reprocess_from,
        last_complete_date,
        last_status,
        last_success_run_id,
        checkpoint_meta_json
      ) VALUES (
        ${tenantId},
        ${clientId},
        ${accountId},
        'campaign_daily',
        'default',
        ${latestReportDate},
        ${hoursAgo(2)},
        ${formatDate(daysAgo(14))},
        ${latestReportDate},
        'succeeded',
        ${successRunId},
        ${JSON.stringify({ source: 'local-demo-seed' })}
      ),
      (
        ${tenantId},
        ${clientId},
        ${accountId},
        'account_daily',
        'default',
        ${latestReportDate},
        ${hoursAgo(2)},
        ${formatDate(daysAgo(14))},
        ${latestReportDate},
        'succeeded',
        ${successRunId},
        ${JSON.stringify({ source: 'local-demo-seed' })}
      )
    `;
  }

  private async seedInsights(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    accountId: number,
    clientSeed: DemoClientSeed,
  ): Promise<void> {
    const periodStart = formatDate(daysAgo(7));
    const periodEnd = formatDate(daysAgo(1));

    await transactionClient.$executeRaw`
      INSERT INTO insight_runs (
        tenant_id,
        client_id,
        period_start,
        period_end,
        generated_by,
        status,
        started_at,
        finished_at
      ) VALUES (
        ${tenantId},
        ${clientId},
        ${periodStart},
        ${periodEnd},
        'system',
        'completed',
        ${hoursAgo(1)},
        ${hoursAgo(1)}
      )
    `;
    const insightRunId = await this.getLastInsertId(transactionClient);

    const insights = [
      {
        scopeType: 'campaign',
        scopeRef: String(clientSeed.campaigns[2]?.googleCampaignId ?? accountId),
        category: 'cost_efficiency',
        severity: 'warning',
        title: `${clientSeed.campaigns[2]?.name ?? 'Campanha'} perdeu eficiencia recente`,
        summary: 'O CPA subiu acima da media da conta na janela recente, com custo crescente e ganho de conversao menor.',
        diagnosis: 'A campanha manteve gasto relevante, mas converteu menos por clique no recorte mais recente.',
        hypothesis: 'A combinacao de mensagem e segmentacao ficou menos aderente ao publico atual.',
        action: 'decrease_budget',
        priority: 'high',
        priorityScore: 84,
        confidence: 0.83,
        impact: 1850,
        riskLevel: 'medium',
        short: 'O custo por aquisicao piorou e a campanha precisa de ajuste antes de receber mais verba.',
        exec: 'Estamos investindo em uma frente que ficou mais cara para gerar resultado. Vamos corrigir antes que isso pese no total da conta.',
      },
      {
        scopeType: 'account',
        scopeRef: String(accountId),
        category: 'budget_allocation',
        severity: 'info',
        title: 'Horario vencedor identificado no bloco do meio-dia',
        summary: 'As faixas entre 11h e 13h concentram melhor taxa de conversao com custo controlado.',
        diagnosis: 'Existe uma janela clara com retorno acima da media recente da conta.',
        hypothesis: 'A intencao do usuario fica mais alta perto do horario de decisao comercial.',
        action: 'shift_schedule',
        priority: 'medium',
        priorityScore: 68,
        confidence: 0.78,
        impact: 960,
        riskLevel: 'low',
        short: 'Vale concentrar mais entrega no horario que converte melhor.',
        exec: 'Descobrimos um horario que entrega mais resultado com o mesmo investimento. A ideia e priorizar essa faixa.',
      },
      {
        scopeType: 'geo',
        scopeRef: 'Curitiba',
        category: 'geo_efficiency',
        severity: 'warning',
        title: 'Regiao com gasto alto e retorno abaixo da media',
        summary: 'Curitiba consumiu verba relevante, mas converteu abaixo da media do cliente na ultima semana.',
        diagnosis: 'O recorte geografico mostra custo sem retorno proporcional.',
        hypothesis: 'Oferta e segmentacao local estao menos aderentes nessa cidade.',
        action: 'shift_geo',
        priority: 'medium',
        priorityScore: 63,
        confidence: 0.72,
        impact: 740,
        riskLevel: 'medium',
        short: 'A regiao merece revisao de lance, cobertura ou criativo antes de seguir recebendo o mesmo ritmo de verba.',
        exec: 'Uma das regioes esta gastando sem trazer retorno suficiente. Vamos revisar esse recorte para proteger o investimento.',
      },
    ] as const;

    for (const [index, insight] of insights.entries()) {
      const insightKey = createHash('sha256')
        .update(`${tenantId}:${clientId}:${insight.scopeType}:${insight.scopeRef}:${index}`)
        .digest('hex');

      await transactionClient.$executeRaw`
        INSERT INTO insights (
          tenant_id,
          client_id,
          google_ads_account_id,
          insight_run_id,
          insight_key,
          scope_type,
          scope_ref,
          category,
          severity,
          summary,
          diagnosis,
          primary_hypothesis,
          title,
          explanation_short,
          explanation_exec,
          recommendation_action,
          priority,
          priority_score,
          confidence,
          estimated_monthly_impact,
          risk_level,
          evidence_json,
          period_reference_json,
          current_payload_json,
          current_version_number,
          status,
          generated_at
        ) VALUES (
          ${tenantId},
          ${clientId},
          ${accountId},
          ${insightRunId},
          ${insightKey},
          ${insight.scopeType},
          ${insight.scopeRef},
          ${insight.category},
          ${insight.severity},
          ${insight.summary},
          ${insight.diagnosis},
          ${insight.hypothesis},
          ${insight.title},
          ${insight.short},
          ${insight.exec},
          ${insight.action},
          ${insight.priority},
          ${insight.priorityScore},
          ${insight.confidence},
          ${insight.impact},
          ${insight.riskLevel},
          ${JSON.stringify([{ metric: 'cpa', note: insight.summary }])},
          ${JSON.stringify({ period_start: periodStart, period_end: periodEnd, comparison_label: 'last_7d vs previous_7d' })},
          ${JSON.stringify({ title: insight.title, recommendation_action: insight.action })},
          1,
          'open',
          ${hoursAgo(1)}
        )
      `;
    }
  }

  private async seedReports(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    adminUserId: number,
  ): Promise<void> {
    await transactionClient.$executeRaw`
      INSERT INTO executive_reports (
        tenant_id,
        client_id,
        period_start,
        period_end,
        audience_level,
        status,
        output_format,
        storage_path,
        summary_json,
        generated_by_user_id,
        generated_at,
        expires_at
      ) VALUES (
        ${tenantId},
        ${clientId},
        ${formatDate(daysAgo(30))},
        ${formatDate(daysAgo(1))},
        'executive',
        'ready',
        'pdf',
        ${`storage/reports/${tenantId}/${clientId}/mensal-demo.pdf`},
        ${JSON.stringify({ headline: 'Resumo mensal pronto para envio ao cliente.' })},
        ${adminUserId},
        ${hoursAgo(5)},
        ${daysFromNow(5)}
      ),
      (
        ${tenantId},
        ${clientId},
        ${formatDate(daysAgo(7))},
        ${formatDate(daysAgo(1))},
        'executive',
        'ready',
        'html',
        ${`storage/reports/${tenantId}/${clientId}/semanal-demo.html`},
        ${JSON.stringify({ headline: 'Deck semanal com proximos passos e principais aprendizados.' })},
        ${adminUserId},
        ${hoursAgo(3)},
        ${daysFromNow(3)}
      )
    `;
  }

  private async clearTenantData(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
  ): Promise<void> {
    const deleteByTenant = async (tableName: string) => {
      await transactionClient.$executeRawUnsafe(
        `DELETE FROM ${tableName} WHERE tenant_id = ?`,
        tenantId,
      );
    };

    await deleteByTenant('audit_logs');
    await deleteByTenant('security_events');
    await deleteByTenant('executive_reports');
    await deleteByTenant('insight_versions');
    await deleteByTenant('insights');
    await deleteByTenant('insight_runs');
    await deleteByTenant('agg_client_kpi_period');
    await deleteByTenant('agg_client_kpi_daily');
    await deleteByTenant('dead_letter_queue');
    await deleteByTenant('api_request_logs');
    await deleteByTenant('sync_checkpoints');
    await deleteByTenant('sync_runs');
    await deleteByTenant('sync_jobs');
    await deleteByTenant('sync_cursors');
    await deleteByTenant('fact_google_ads_campaign_daily');
    await deleteByTenant('fact_google_ads_account_daily');
    await deleteByTenant('dim_campaigns');
    await deleteByTenant('client_kpi_targets');
    await deleteByTenant('google_ads_accounts');
    await deleteByTenant('google_ads_connections');
    await deleteByTenant('client_access');
    await deleteByTenant('clients');
    await transactionClient.$executeRaw`
      DELETE FROM auth_sessions WHERE active_tenant_id = ${tenantId}
    `;
    await deleteByTenant('tenant_memberships');
  }

  private async insertSyncJob(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    accountId: number,
    jobType: DemoJobType,
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'partial' | 'cancelled',
    priority: number,
    scheduledFor: Date,
    startedAt: Date | null,
    finishedAt: Date | null,
    requestWindowStart: string,
    requestWindowEnd: string,
    errorCode: string | null,
    errorMessage: string | null,
  ): Promise<number> {
    await transactionClient.$executeRaw`
      INSERT INTO sync_jobs (
        tenant_id,
        client_id,
        google_ads_account_id,
        job_type,
        queue_name,
        status,
        priority,
        triggered_by,
        scheduled_for,
        dedupe_key,
        concurrency_key,
        started_at,
        finished_at,
        attempt_count,
        max_attempts,
        lease_token,
        lease_expires_at,
        request_window_start,
        request_window_end,
        cursor_payload_json,
        error_code,
        error_message,
        error_context_json
      ) VALUES (
        ${tenantId},
        ${clientId},
        ${accountId},
        ${jobType},
        'default',
        ${status},
        ${priority},
        'scheduler',
        ${scheduledFor},
        ${createHash('sha256').update(`${tenantId}:${clientId}:${accountId}:${jobType}:${requestWindowStart}:${requestWindowEnd}`).digest('hex')},
        ${`${accountId}:${jobType}`},
        ${startedAt},
        ${finishedAt},
        ${status === 'queued' ? 0 : 1},
        3,
        ${status === 'queued' ? null : randomUUID()},
        ${status === 'queued' ? null : minutesFromNow(20)},
        ${requestWindowStart},
        ${requestWindowEnd},
        ${JSON.stringify({ source: 'local-demo-seed' })},
        ${errorCode},
        ${errorMessage},
        ${errorCode === null ? null : JSON.stringify({ retryable: true })}
      )
    `;

    return this.getLastInsertId(transactionClient);
  }

  private async insertSyncRun(
    transactionClient: Prisma.TransactionClient,
    tenantId: number,
    clientId: number,
    accountId: number,
    syncJobId: number,
    jobType: string,
    entityScope: string,
    status: 'running' | 'succeeded' | 'failed' | 'partial' | 'cancelled',
    requestWindowStart: string,
    requestWindowEnd: string,
    startedAt: Date,
    finishedAt: Date | null,
    rowsRead: number,
    rowsInserted: number,
    rowsUpdated: number,
    rowsUpserted: number,
    rowsSkipped: number,
    apiRequestCount: number,
    apiOperationCount: number,
    errorCode: string | null,
    errorMessage: string | null,
  ): Promise<number> {
    await transactionClient.$executeRaw`
      INSERT INTO sync_runs (
        tenant_id,
        client_id,
        google_ads_account_id,
        sync_job_id,
        run_uuid,
        job_type,
        entity_scope,
        status,
        attempt_number,
        request_window_start,
        request_window_end,
        started_at,
        finished_at,
        rows_read,
        rows_inserted,
        rows_updated,
        rows_upserted,
        rows_skipped,
        api_request_count,
        api_operation_count,
        last_google_request_id,
        error_code,
        error_message,
        error_context_json
      ) VALUES (
        ${tenantId},
        ${clientId},
        ${accountId},
        ${syncJobId},
        ${randomUUID()},
        ${jobType},
        ${entityScope},
        ${status},
        1,
        ${requestWindowStart},
        ${requestWindowEnd},
        ${startedAt},
        ${finishedAt},
        ${rowsRead},
        ${rowsInserted},
        ${rowsUpdated},
        ${rowsUpserted},
        ${rowsSkipped},
        ${apiRequestCount},
        ${apiOperationCount},
        ${createHash('sha256').update(`${syncJobId}:${jobType}`).digest('hex').slice(0, 24)},
        ${errorCode},
        ${errorMessage},
        ${errorCode === null ? null : JSON.stringify({ sample: 'local-demo-run' })}
      )
    `;

    return this.getLastInsertId(transactionClient);
  }

  private encryptDemoSecret(plainText: string): {
    readonly ciphertext: Buffer;
    readonly iv: Buffer;
    readonly tag: Buffer;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    return { ciphertext, iv, tag: cipher.getAuthTag() };
  }

  private getEncryptionKey(): Buffer {
    const configuredKey = this.configService.get('APP_ENCRYPTION_KEY', {
      infer: true,
    });

    return configuredKey.startsWith('base64:')
      ? Buffer.from(configuredKey.slice('base64:'.length), 'base64')
      : Buffer.from(configuredKey, 'hex');
  }

  private async getLastInsertId(
    transactionClient: Prisma.TransactionClient,
  ): Promise<number> {
    const rows = await transactionClient.$queryRaw<Array<{ id: bigint }>>`
      SELECT LAST_INSERT_ID() AS id
    `;

    return Number(rows[0]?.id ?? 0);
  }
}

function buildCampaignDayMetrics(
  campaignSeed: DemoCampaignSeed,
  dayIndex: number,
  isWeekend: boolean,
  isRecentWindow: boolean,
): {
  readonly impressions: number;
  readonly clicks: number;
  readonly cost: number;
  readonly conversions: number;
  readonly conversionsValue: number;
  readonly searchImpressionShare: number;
} {
  const seasonalFactor =
    1 + Math.sin((dayIndex + campaignSeed.phaseOffset) / 4) * campaignSeed.volatility;
  const weekendFactor = isWeekend ? 0.86 : 1.04;
  const recentPenaltyFactor = isRecentWindow ? 1 + campaignSeed.recentPenalty : 1;
  const impressions = Math.max(
    600,
    Math.round(campaignSeed.baseImpressions * seasonalFactor * weekendFactor),
  );
  const ctr = Math.max(
    0.008,
    campaignSeed.ctr *
      (isWeekend ? 0.93 : 1.02) *
      (1 - (isRecentWindow ? campaignSeed.recentPenalty * 0.3 : 0)),
  );
  const clicks = Math.max(14, Math.round(impressions * ctr));
  const averageCpc = roundNumber(
    campaignSeed.baseCpc * (0.92 + seasonalFactor * 0.08) * recentPenaltyFactor,
    6,
  );
  const conversions = roundNumber(
    clicks *
      campaignSeed.conversionRate *
      (isWeekend ? 0.88 : 1.06) *
      (1 - (isRecentWindow ? campaignSeed.recentPenalty * 0.55 : 0)),
    4,
  );
  const cost = roundNumber(clicks * averageCpc, 2);

  return {
    impressions,
    clicks,
    cost,
    conversions,
    conversionsValue: roundNumber(
      conversions * campaignSeed.valuePerConversion * (isWeekend ? 0.96 : 1.03),
      4,
    ),
    searchImpressionShare: roundNumber(
      Math.max(
        0.28,
        campaignSeed.impressionShare -
          (isRecentWindow ? campaignSeed.recentPenalty * 0.18 : 0),
      ),
      6,
    ),
  };
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundNullableNumber(value: number | null, digits: number): number | null {
  if (value === null) {
    return null;
  }

  return roundNumber(value, digits);
}

function toCostMicros(value: number): number {
  return Math.round(value * 1_000_000);
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function hoursAgo(hours: number): Date {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() - hours);
  return date;
}

function minutesFromNow(minutes: number): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
