# Modelagem Inicial de Banco - SaaS Multi-tenant Google Ads

Data de referencia: 2026-04-06

## 1. Principio de modelagem

### Objetivo

O banco deve servir como **fonte principal de leitura do sistema**, para que o dashboard, os insights e os relatorios sejam gerados a partir de dados locais e nao diretamente da Google Ads API.

### Regra central

- **Dados transacionais do SaaS** ficam em tabelas operacionais
- **Entidades da Google Ads** ficam em tabelas dimensionais
- **Metricas e snapshots** ficam em tabelas fato
- **Insights, recomendacoes e apresentacoes** ficam em tabelas de aplicacao
- **Seguranca, auditoria e sync** ficam em tabelas operacionais e de controle

### Decisao de simplicidade

- No **MVP**, priorizar fatos diarios e intradiarios apenas nos graos mais valiosos
- Deixar granularidade muito pesada, como search term completo para todas as contas, para a fase seguinte

## 2. Lista de tabelas

## 2.1 Tabelas de tenant, usuarios e acesso

### `tenants` [MVP]

Motivo: representa a agencia, que e o tenant raiz do sistema.

Campos principais:

- `id`
- `uuid`
- `name`
- `slug`
- `status`
- `timezone`
- `currency_code`
- `plan_code`
- `data_key_version`
- `created_at`
- `updated_at`

### `users` [MVP]

Motivo: identidade global de usuario.

Campos principais:

- `id`
- `uuid`
- `name`
- `email`
- `password_hash`
- `platform_role`
- `status`
- `mfa_enabled`
- `mfa_secret_ciphertext`
- `mfa_secret_iv`
- `mfa_secret_tag`
- `mfa_key_version`
- `last_login_at`
- `created_at`
- `updated_at`

### `tenant_memberships` [MVP]

Motivo: vincula usuarios a tenants com papel e status.

Campos principais:

- `id`
- `tenant_id`
- `user_id`
- `role`
- `status`
- `invited_by_user_id`
- `created_at`
- `updated_at`

### `auth_sessions` [MVP]

Motivo: sessoes server-side seguras, com suporte a revogacao, troca de tenant e confirmacao de MFA.

Campos principais:

- `id`
- `user_id`
- `active_tenant_id`
- `active_membership_id`
- `session_token_hash`
- `csrf_token_hash`
- `mfa_verified_at`
- `ip_hash`
- `user_agent_hash`
- `last_seen_at`
- `expires_at`
- `revoked_at`
- `created_at`
- `updated_at`

### `password_reset_tokens` [MVP]

Motivo: reset de senha seguro sem expor se a conta existe.

Campos principais:

- `id`
- `user_id`
- `token_hash`
- `requested_ip_hash`
- `expires_at`
- `used_at`
- `created_at`

### `clients` [MVP]

Motivo: representa o cliente final atendido pela agencia.

Campos principais:

- `id`
- `tenant_id`
- `name`
- `legal_name`
- `status`
- `timezone`
- `reporting_currency_code`
- `notes`
- `created_at`
- `updated_at`

### `client_access` [MVP]

Motivo: sub-isolamento dentro do tenant. Um gestor pode ver apenas parte dos clientes da agencia.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `membership_id`
- `access_level`
- `created_at`

## 2.2 Tabelas de integracao, credenciais e seguranca

### `google_ads_connections` [MVP]

Motivo: guarda a conexao OAuth e os tokens criptografados.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `oauth_subject`
- `google_email`
- `manager_customer_id`
- `login_customer_id`
- `developer_token_alias`
- `refresh_token_ciphertext`
- `refresh_token_iv`
- `refresh_token_tag`
- `token_key_version`
- `scopes_json`
- `status`
- `last_token_check_at`
- `last_sync_at`
- `sync_frequency_minutes`
- `created_by_user_id`
- `created_at`
- `updated_at`

### `google_ads_accounts` [MVP]

Motivo: representa cada conta Google Ads conectada ao sistema.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `connection_id`
- `customer_id`
- `customer_name`
- `descriptive_name`
- `currency_code`
- `time_zone`
- `status`
- `is_manager`
- `is_test_account`
- `last_metadata_sync_at`
- `last_metric_sync_at`
- `created_at`
- `updated_at`

### `security_events` [MVP]

Motivo: trilha de eventos de seguranca separada da auditoria funcional, com foco em autenticacao, sessao, bloqueios, OAuth e tentativas suspeitas.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `user_id`
- `actor_membership_id`
- `auth_session_id`
- `request_id`
- `correlation_id`
- `event_key`
- `event_name`
- `event_category`
- `severity`
- `outcome`
- `actor_type`
- `source_type`
- `resource_type`
- `resource_id`
- `http_method`
- `route_path`
- `ip_hash`
- `user_agent_hash`
- `metadata_json`
- `occurred_at`
- `created_at`

## 2.3 Tabelas de metas e configuracoes

### `client_kpi_targets` [MVP]

Motivo: guardar metas que servem de base para insight e recomendacao.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `effective_from`
- `target_cpa`
- `target_roas`
- `target_ctr`
- `min_conversions_for_confidence`
- `alert_thresholds_json`
- `created_at`
- `updated_at`

### `client_reporting_settings` [Depois]

Motivo: separar preferencias de relatorio e narrativa do cadastro do cliente.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `default_period_days`
- `preferred_language`
- `executive_tone`
- `default_template_code`
- `created_at`
- `updated_at`

## 2.4 Tabelas dimensionais da Google Ads

### `dim_campaigns` [MVP]

Motivo: metadados de campanha para enriquecer os fatos.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `name`
- `advertising_channel_type`
- `bidding_strategy_type`
- `status`
- `start_date`
- `end_date`
- `source_updated_at`
- `last_seen_at`
- `created_at`
- `updated_at`

### `dim_ad_groups` [MVP]

Motivo: agrupar performance e futuras analises mais granulares.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `campaign_dim_id`
- `google_ad_group_id`
- `name`
- `status`
- `type`
- `source_updated_at`
- `last_seen_at`
- `created_at`
- `updated_at`

### `dim_ads` [Depois]

Motivo: necessario para analise por anuncio sem jogar esse custo no MVP inicial.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `campaign_dim_id`
- `ad_group_dim_id`
- `google_ad_id`
- `ad_type`
- `headline_snapshot`
- `status`
- `source_updated_at`
- `last_seen_at`

### `dim_keywords` [MVP]

Motivo: suporta analise por palavra-chave onde isso for relevante.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `ad_group_dim_id`
- `google_keyword_criterion_id`
- `keyword_text`
- `match_type`
- `status`
- `source_updated_at`
- `last_seen_at`
- `created_at`
- `updated_at`

### `dim_geo_targets` [Depois]

Motivo: padronizar regiao e evitar strings repetidas nas tabelas fato mais pesadas.

Campos principais:

- `id`
- `google_geo_target_id`
- `country_code`
- `region_name`
- `city_name`
- `target_type`
- `canonical_label`

### `dim_search_terms` [Depois]

Motivo: reduzir repeticao de strings em fatos de search term quando esse modulo entrar.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `search_term_hash`
- `search_term_text`
- `normalized_text`
- `created_at`

## 2.5 Tabelas fato de performance

### `fact_google_ads_account_daily` [MVP]

Motivo: scorecard diario por conta. Base para dashboards e comparativos de alto nivel.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `report_date`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`
- `ctr`
- `average_cpc`
- `average_cpm`
- `search_impression_share`
- `search_budget_lost_impression_share`
- `search_rank_lost_impression_share`
- `synced_at`

### `fact_google_ads_account_intraday` [MVP]

Motivo: snapshot intradiario leve para mostrar andamento do dia sem depender da API.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `snapshot_at`
- `snapshot_date`
- `snapshot_hour`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`
- `synced_at`

Observacao:

- intraday deve ser **coarse-grained**
- nao armazenar todas as segmentacoes intradiarias no MVP

### `fact_google_ads_campaign_daily` [MVP]

Motivo: principal tabela analitica do sistema.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `campaign_dim_id`
- `google_campaign_id`
- `report_date`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`
- `ctr`
- `average_cpc`
- `average_cpm`
- `search_impression_share`
- `search_budget_lost_impression_share`
- `search_rank_lost_impression_share`
- `synced_at`

### `fact_google_ads_campaign_intraday` [MVP]

Motivo: acompanhar o dia corrente por campanha, sem explodir volume em anuncio e keyword desde o inicio.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `snapshot_at`
- `snapshot_date`
- `snapshot_hour`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`
- `synced_at`

### `fact_google_ads_campaign_device_daily` [MVP]

Motivo: suporta recomendacao por dispositivo.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `report_date`
- `device_type`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`
- `ctr`
- `average_cpc`
- `synced_at`

### `fact_google_ads_campaign_hourly` [MVP]

Motivo: suporta recomendacao de horario.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `report_date`
- `hour_of_day`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`
- `synced_at`

### `fact_google_ads_campaign_dow_daily` [Depois]

Motivo: leitura pronta por dia da semana. Pode ser derivada de `report_date`, mas vira tabela propria se a consulta ficar frequente.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `report_week_start`
- `day_of_week`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`

### `fact_google_ads_campaign_geo_daily` [MVP]

Motivo: suporta recomendacao por regiao.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `report_date`
- `geo_target_type`
- `geo_target_id`
- `geo_label`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`
- `synced_at`

### `fact_google_ads_ad_group_daily` [Depois]

Motivo: analise por grupo de anuncio quando houver necessidade recorrente.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `google_ad_group_id`
- `report_date`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`

### `fact_google_ads_ad_daily` [Depois]

Motivo: analise por anuncio. Alto volume. Entrar so quando houver demanda real.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `google_ad_group_id`
- `google_ad_id`
- `report_date`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`

### `fact_google_ads_keyword_daily` [Depois]

Motivo: analise profunda de keyword com custo controlado.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `google_ad_group_id`
- `google_keyword_criterion_id`
- `report_date`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`

### `fact_google_ads_search_term_daily` [Depois]

Motivo: search term e muito valioso, mas volumoso. Nao deve entrar de forma indiscriminada.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `google_campaign_id`
- `google_ad_group_id`
- `google_keyword_criterion_id`
- `search_term_dim_id`
- `report_date`
- `match_type`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`

## 2.6 Tabelas de agregados, insights e relatorios

### `agg_client_kpi_daily` [MVP]

Motivo: acelerar dashboards do cliente sem recalcular toda hora.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `report_date`
- `spend`
- `impressions`
- `clicks`
- `conversions`
- `conversions_value`
- `ctr`
- `cpa`
- `roas`
- `synced_at`

### `agg_client_kpi_period` [MVP]

Motivo: leitura pronta para 7d, 30d, mes atual e comparativos.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `period_type`
- `period_start`
- `period_end`
- `spend`
- `impressions`
- `clicks`
- `conversions`
- `conversions_value`
- `ctr`
- `cpa`
- `roas`
- `generated_at`

### `insight_runs` [MVP]

Motivo: controla cada execucao do motor de insight.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `period_start`
- `period_end`
- `generated_by`
- `triggered_by_user_id`
- `status`
- `started_at`
- `finished_at`
- `created_at`

### `insights` [MVP]

Motivo: armazena o estado atual e consultavel de cada insight logico para dashboard, filtros, ordenacao e acao do usuario.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `insight_run_id`
- `insight_key`
- `scope_type`
- `scope_ref`
- `category`
- `severity`
- `title`
- `summary`
- `diagnosis`
- `primary_hypothesis`
- `explanation_short`
- `explanation_exec`
- `recommendation_action`
- `priority`
- `priority_score`
- `confidence`
- `estimated_monthly_impact`
- `risk_level`
- `evidence_json`
- `period_reference_json`
- `current_payload_json`
- `current_version_number`
- `status`
- `generated_at`
- `created_at`
- `updated_at`

### `insight_versions` [MVP]

Motivo: manter historico imutavel de cada recalculo, com payload JSON completo versionado para auditoria, comparacao e reproducao.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `insight_id`
- `insight_run_id`
- `version_number`
- `payload_schema_version`
- `payload_hash`
- `content_hash`
- `entity_type`
- `entity_id`
- `category`
- `severity`
- `priority_score`
- `confidence_score`
- `risk_level`
- `period_reference_json`
- `payload_json`
- `generated_at`
- `supersedes_version_id`
- `created_at`

### `recommendation_actions` [Depois]

Motivo: separar recomendacao da observacao analitica quando voce quiser workflow de aprovacao.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `insight_id`
- `recommended_action`
- `rationale`
- `proposed_by`
- `approved_by_user_id`
- `status`
- `approved_at`

### `executive_reports` [MVP]

Motivo: historico de relatorios e apresentacoes geradas.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `period_start`
- `period_end`
- `audience_level`
- `status`
- `output_format`
- `storage_path`
- `summary_json`
- `generated_by_user_id`
- `generated_at`
- `expires_at`
- `created_at`
- `updated_at`

### `executive_report_slides` [Depois]

Motivo: permitir re-edicao ou auditoria por slide.

Campos principais:

- `id`
- `tenant_id`
- `executive_report_id`
- `slide_order`
- `slide_type`
- `title`
- `payload_json`

## 2.7 Tabelas operacionais de sync e processamento

### `sync_cursors` [MVP]

Motivo: guardar ate onde cada entidade foi sincronizada.

Campos principais:

- `id`
- `tenant_id`
- `google_ads_account_id`
- `entity_name`
- `cursor_date`
- `cursor_datetime`
- `last_success_at`
- `last_status`
- `cursor_meta_json`
- `created_at`
- `updated_at`

### `sync_jobs` [MVP]

Motivo: trilha operacional de jobs de coleta, agregacao, insight e slide.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `job_type`
- `status`
- `priority`
- `scheduled_for`
- `started_at`
- `finished_at`
- `attempt_count`
- `max_attempts`
- `request_window_start`
- `request_window_end`
- `cursor_payload_json`
- `error_code`
- `error_message`
- `error_context_json`
- `created_at`
- `updated_at`

### `sync_runs` [MVP]

Motivo: registrar cada tentativa real de execucao, separada da intencao enfileirada.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `sync_job_id`
- `run_uuid`
- `job_type`
- `entity_scope`
- `status`
- `attempt_number`
- `request_window_start`
- `request_window_end`
- `started_at`
- `finished_at`
- `rows_read`
- `rows_inserted`
- `rows_updated`
- `rows_upserted`
- `rows_skipped`
- `api_request_count`
- `api_operation_count`
- `last_google_request_id`
- `error_code`
- `error_message`
- `error_context_json`
- `created_at`
- `updated_at`

### `sync_checkpoints` [MVP]

Motivo: guardar watermarks e datas fechadas por conta, escopo e granularidade.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `checkpoint_scope`
- `checkpoint_key`
- `watermark_date`
- `watermark_datetime`
- `safe_reprocess_from`
- `last_complete_date`
- `last_status`
- `last_success_run_id`
- `checkpoint_meta_json`
- `created_at`
- `updated_at`

### `api_request_logs` [MVP]

Motivo: rastrear cada chamada externa relevante para troubleshooting, quota e performance.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `sync_job_id`
- `sync_run_id`
- `request_scope`
- `api_method`
- `resource_name`
- `google_request_id`
- `gaql_fingerprint`
- `gaql_query_excerpt`
- `date_from`
- `date_to`
- `http_status`
- `grpc_status_code`
- `success`
- `retry_attempt`
- `duration_ms`
- `response_row_count`
- `response_batch_count`
- `error_code`
- `error_message`
- `requested_at`
- `finished_at`
- `created_at`

### `dead_letter_queue` [MVP]

Motivo: separar falhas permanentes ou retries esgotados com possibilidade de requeue controlado.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `google_ads_account_id`
- `sync_job_id`
- `sync_run_id`
- `dedupe_key`
- `failure_class`
- `payload_json`
- `failure_reason`
- `resolution_status`
- `next_review_at`
- `resolved_at`
- `created_at`

## 2.8 Tabelas de auditoria e compliance

### `audit_logs` [MVP]

Motivo: trilha de auditoria funcional e administrativa para governanca, compliance, suporte e investigacao.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `user_id`
- `actor_membership_id`
- `auth_session_id`
- `resource_type`
- `resource_id`
- `request_id`
- `correlation_id`
- `event_key`
- `event_name`
- `event_category`
- `severity`
- `outcome`
- `actor_type`
- `source_type`
- `actor_role`
- `http_method`
- `route_path`
- `ip_hash`
- `user_agent_hash`
- `before_json`
- `after_json`
- `metadata_json`
- `redaction_level`
- `occurred_at`
- `created_at`

### `export_logs` [Depois]

Motivo: detalhar exportacoes e downloads sensiveis em separado.

Campos principais:

- `id`
- `tenant_id`
- `client_id`
- `user_id`
- `export_type`
- `resource_ref`
- `status`
- `created_at`

## 3. Relacionamentos principais

### Estrutura SaaS

- `tenants 1:N tenant_memberships`
- `users 1:N tenant_memberships`
- `tenants 1:N clients`
- `tenant_memberships N:N clients` via `client_access`

### Integracao Google Ads

- `clients 1:N google_ads_connections`
- `google_ads_connections 1:N google_ads_accounts`
- `clients 1:N google_ads_accounts`

### Dimensoes

- `google_ads_accounts 1:N dim_campaigns`
- `dim_campaigns 1:N dim_ad_groups`
- `dim_ad_groups 1:N dim_keywords`
- `dim_ad_groups 1:N dim_ads` quando ativado

### Fatos

- `google_ads_accounts 1:N fact_google_ads_account_daily`
- `google_ads_accounts 1:N fact_google_ads_account_intraday`
- `google_ads_accounts 1:N fact_google_ads_campaign_daily`
- `google_ads_accounts 1:N fact_google_ads_campaign_intraday`
- `dim_campaigns 1:N fact_google_ads_campaign_daily` por `campaign_dim_id`
- `google_ads_accounts 1:N fact_google_ads_campaign_device_daily`
- `google_ads_accounts 1:N fact_google_ads_campaign_hourly`
- `google_ads_accounts 1:N fact_google_ads_campaign_geo_daily`

### Aplicacao

- `clients 1:N client_kpi_targets`
- `clients 1:N insight_runs`
- `insight_runs 1:N insights`
- `insights 1:N insight_versions`
- `clients 1:N executive_reports`

### Operacao

- `google_ads_accounts 1:N sync_cursors`
- `google_ads_accounts 1:N sync_jobs`

## 4. Indices recomendados

### Regra geral

- toda tabela de negocio deve ter indice iniciado por `tenant_id`
- tabelas fato devem ter indice por `tenant_id + client_id + periodo`
- chaves externas mais consultadas devem ter indice dedicado

### Indices chave por dominio

#### SaaS e acesso

- `tenants.slug` unico
- `users.email` unico
- `tenant_memberships (tenant_id, user_id)` unico
- `client_access (client_id, membership_id)` unico
- `clients (tenant_id, status)`

#### Integracao

- `google_ads_connections (tenant_id, oauth_subject)` unico
- `google_ads_connections (tenant_id, status)`
- `google_ads_accounts (tenant_id, customer_id)` unico
- `google_ads_accounts (tenant_id, client_id, status)`
- `google_ads_accounts (tenant_id, last_metric_sync_at)`

#### Dimensoes

- `dim_campaigns (tenant_id, google_ads_account_id, google_campaign_id)` unico
- `dim_ad_groups (tenant_id, google_ads_account_id, google_ad_group_id)` unico
- `dim_keywords (tenant_id, google_ads_account_id, google_keyword_criterion_id)` unico
- `dim_ads (tenant_id, google_ads_account_id, google_ad_id)` unico quando entrar

#### Fatos diarios

- `fact_google_ads_account_daily (tenant_id, google_ads_account_id, report_date)` unico
- `fact_google_ads_account_daily (tenant_id, client_id, report_date)`
- `fact_google_ads_campaign_daily (tenant_id, google_ads_account_id, google_campaign_id, report_date)` unico
- `fact_google_ads_campaign_daily (tenant_id, client_id, report_date)`
- `fact_google_ads_campaign_device_daily (tenant_id, google_ads_account_id, google_campaign_id, report_date, device_type)` unico
- `fact_google_ads_campaign_hourly (tenant_id, google_ads_account_id, google_campaign_id, report_date, hour_of_day)` unico
- `fact_google_ads_campaign_geo_daily (tenant_id, google_ads_account_id, google_campaign_id, report_date, geo_target_type, geo_label)` unico

#### Fatos intradiarios

- `fact_google_ads_account_intraday (tenant_id, google_ads_account_id, snapshot_at)`
- `fact_google_ads_account_intraday (tenant_id, client_id, snapshot_date, snapshot_hour)`
- `fact_google_ads_campaign_intraday (tenant_id, google_ads_account_id, google_campaign_id, snapshot_at)` unico
- `fact_google_ads_campaign_intraday (tenant_id, client_id, snapshot_date, snapshot_hour)`

#### Agregados e insights

- `agg_client_kpi_daily (tenant_id, client_id, report_date)` unico
- `agg_client_kpi_period (tenant_id, client_id, period_type, period_start, period_end)` unico
- `insight_runs (tenant_id, client_id, period_start, period_end)`
- `insights (tenant_id, insight_key)` unico
- `insights (tenant_id, client_id, status, priority)`
- `insights (tenant_id, google_ads_account_id, category, severity)`
- `insight_versions (insight_id, version_number)` unico
- `insight_versions (tenant_id, google_ads_account_id, category, generated_at)`
- `executive_reports (tenant_id, client_id, period_start, period_end)`

#### Operacao e auditoria

- `sync_cursors (tenant_id, google_ads_account_id, entity_name)` unico
- `sync_jobs (tenant_id, status, scheduled_for)`
- `sync_jobs (google_ads_account_id, job_type, status)`
- `security_events (tenant_id, event_category, occurred_at)`
- `security_events (user_id, event_name, occurred_at)`
- `audit_logs (tenant_id, event_category, occurred_at)`
- `audit_logs (tenant_id, resource_type, resource_id, occurred_at)`
- `audit_logs (user_id, occurred_at)`

## 5. Estrategia de particionamento ou arquivamento

### Para o MVP

- **Nao particionar fisicamente logo de cara**
- usar:
  - indices compostos corretos
  - fatos diarios no grao certo
  - intraday apenas no nivel conta/campanha
  - search term fora do MVP

Motivo:

- particionamento cedo demais aumenta complexidade operacional
- MySQL na Hostinger vai performar melhor com modelagem e indices corretos do que com particionamento prematuro

### Quando o volume crescer

Aplicar arquivamento por politica:

- manter `intraday` por 30 a 90 dias
- manter fatos diarios por 24 meses ou mais
- mover search terms antigos para tabela archive
- mover auditoria antiga para particoes logicas ou export historico

### Estrategia pratica

- `*_intraday`: retenção curta
- `fact_*_daily`: retenção longa
- `audit_logs`: arquivamento anual
- `executive_reports`: guardar metadado no banco e arquivo em storage privado

### Opcional depois

- particionar por `report_date` em fatos muito grandes
- particionar por mes apenas em tabelas de maior volume

## 6. Diferenca entre tabelas dimensionais e tabelas de fatos

### Tabelas dimensionais

Guardam **quem e o que** esta sendo medido.

Exemplos:

- `dim_campaigns`
- `dim_ad_groups`
- `dim_keywords`
- `dim_ads`

Caracteristicas:

- menor volume
- mudam menos
- servem para dar contexto aos fatos
- normalmente tem nomes, status, tipo, hierarquia

### Tabelas de fatos

Guardam **as metricas ao longo do tempo**.

Exemplos:

- `fact_google_ads_campaign_daily`
- `fact_google_ads_campaign_hourly`
- `fact_google_ads_campaign_geo_daily`
- `fact_google_ads_campaign_intraday`

Caracteristicas:

- maior volume
- sempre relacionadas a periodo ou snapshot
- guardam impressoes, cliques, custo, conversoes e valor
- sao a base das analises

## 7. Como armazenar snapshots e agregados

### Snapshots diarios

Usar fatos diarios por grao.

Exemplo:

- uma linha por `campaign + date`
- uma linha por `campaign + date + device`
- uma linha por `campaign + date + hour`

### Snapshots intradiarios

Usar tabelas separadas.

Motivo:

- intraday e dado de monitoramento, nao de historico final consolidado
- evita misturar numero parcial com numero fechado do dia

Regra recomendada:

- snapshots a cada 1h ou 2h
- guardar apenas nivel conta e campanha no MVP
- apagar snapshots muito antigos depois que o daily estiver consolidado

### Agregados

Usar tabelas de agregacao prontas para leitura:

- `agg_client_kpi_daily`
- `agg_client_kpi_period`

Motivo:

- dashboards ficam rapidos
- reduz leitura pesada nas tabelas fato
- simplifica geracao de slides e scorecards

## 8. Como modelar isolamento por tenant

### Regra obrigatoria

Toda tabela de negocio deve carregar `tenant_id`.

### Regra de leitura

Nenhuma consulta deve buscar registro apenas por `id`.

Sempre buscar por:

- `tenant_id`
- `id` ou chave natural

Exemplos:

- errado: `WHERE id = 15`
- certo: `WHERE tenant_id = ? AND id = 15`
- melhor em fatos: `WHERE tenant_id = ? AND client_id = ? AND report_date BETWEEN ...`

### Regras praticas

- `tenant_id` em tabelas SaaS, integracao, dimensoes, fatos, insights e auditoria
- chaves unicas compostas com `tenant_id`
- policies no backend sempre verificam `tenant_id`
- escopo por cliente via `client_access`
- exportacoes validam tenant e client scope

### Quando evoluir o isolamento

- **MVP:** shared database com `tenant_id`
- **Depois:** chaves de criptografia segregadas por tenant
- **Enterprise:** schema ou banco por tenant, se houver exigencia comercial ou regulatoria

## 9. Tabelas que entram no MVP

### Core SaaS

- `tenants`
- `users`
- `tenant_memberships`
- `auth_sessions`
- `password_reset_tokens`
- `clients`
- `client_access`

### Integracao e metas

- `google_ads_connections`
- `google_ads_accounts`
- `client_kpi_targets`

### Dimensoes

- `dim_campaigns`
- `dim_ad_groups`
- `dim_keywords`

### Fatos

- `fact_google_ads_account_daily`
- `fact_google_ads_account_intraday`
- `fact_google_ads_campaign_daily`
- `fact_google_ads_campaign_intraday`
- `fact_google_ads_campaign_device_daily`
- `fact_google_ads_campaign_hourly`
- `fact_google_ads_campaign_geo_daily`

### Analytics e aplicacao

- `agg_client_kpi_daily`
- `agg_client_kpi_period`
- `insight_runs`
- `insights`
- `insight_versions`
- `executive_reports`

### Operacao e seguranca

- `sync_cursors`
- `sync_jobs`
- `sync_runs`
- `sync_checkpoints`
- `api_request_logs`
- `dead_letter_queue`
- `security_events`
- `audit_logs`

## 10. Tabelas para adicionar depois

- `client_reporting_settings`
- `dim_ads`
- `dim_geo_targets`
- `dim_search_terms`
- `fact_google_ads_campaign_dow_daily`
- `fact_google_ads_ad_group_daily`
- `fact_google_ads_ad_daily`
- `fact_google_ads_keyword_daily`
- `fact_google_ads_search_term_daily`
- `recommendation_actions`
- `executive_report_slides`
- `export_logs`

## 11. Recomendacao final de modelagem

### Melhor equilibrio para o inicio

- multi-tenant em banco compartilhado com `tenant_id`
- metadados em dimensoes
- metricas em fatos diarios
- intraday apenas para conta e campanha
- agregados prontos por cliente
- insights e relatorios como entidades proprias
- auditoria e tokens criptografados desde o dia 1

### Motivo

- entrega performance boa
- limita crescimento de volume no inicio
- reduz dependencia da API
- facilita backup e restore
- permite crescer para ad, keyword e search term sem quebrar o modelo
