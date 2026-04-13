# Dashboards Local-First - SaaS Multi-tenant Google Ads

Data de referencia: 2026-04-06

## 1. Regra principal

Os dashboards nunca devem depender da Google Ads API em tempo real.

Toda leitura da UI deve vir de:

- banco local
- agregados precomputados
- cache do backend

### Motivo

- reduz custo e risco de quota
- evita travar a tela por latencia externa
- garante comportamento previsivel para gestores e clientes
- permite mostrar recencia e integridade com clareza

## 2. Estrutura dos dashboards

### 2.1 Dashboard da agencia `/dashboard` [MVP]

Objetivo: dar ao `agency_admin` e ao `manager` uma visao operacional consolidada.

Blocos:

- `Agency KPI strip`
  - gasto total
  - conversoes
  - receita atribuida
  - ROAS medio
  - clientes com alerta
- `Clients performance table`
  - cliente
  - gasto
  - conversoes
  - CPA
  - ROAS
  - ultima sync
  - status da sync
- `Open insights`
  - insights criticos por cliente
- `Sync health panel`
  - contas atrasadas
  - contas com falha
  - jobs em fila
  - ultimo processamento noturno

Motivo:

- concentra o que a agencia precisa acompanhar sem abrir cada cliente
- mistura negocio e operacao sem depender da API

### 2.2 Dashboard do cliente `/clients/:clientId` [MVP]

Objetivo: ser a tela principal de analise e acompanhamento.

Blocos:

- `Header de recencia`
  - ultima sync bem-sucedida
  - status por granularidade
  - botao `Solicitar sincronizacao`
- `Scorecards`
  - spend
  - impressions
  - clicks
  - conversions
  - CPA
  - ROAS
  - comparativo com periodo anterior
- `Trend chart`
  - gasto, conversoes e receita por dia
- `Campaign leaders`
  - top campanhas por gasto, conversao, CPA e ROAS
- `Breakdowns`
  - dispositivo
  - horario
  - regiao
- `Insights panel`
  - insights abertos
  - impacto estimado
  - confianca
- `Reports panel`
  - ultimos relatorios gerados

Motivo:

- todas as decisoes principais cabem nessa tela
- evita obrigar o gestor a navegar por muitas telas para entender o cliente

### 2.3 Explorer de campanhas [MVP]

Pode ser uma aba dentro do dashboard do cliente.

Blocos:

- tabela de campanhas
- filtros por conta, campanha e periodo
- comparativo com periodo anterior
- detalhe expandido por dispositivo, horario e regiao

Motivo:

- campanhas sao o nivel mais util no MVP
- grupo, anuncio e search term podem entrar depois

### 2.4 Painel de integracao e sync `/integrations/google-ads` [MVP]

Objetivo: separar operacao tecnica do dashboard de negocio.

Blocos:

- conexoes Google Ads
- contas por cliente
- ultima sync por conta
- checkpoint por granularidade
- falhas recentes
- jobs em fila
- acoes manuais permitidas

Motivo:

- evita poluir a tela de negocio com detalhes operacionais
- acelera suporte e troubleshooting

### 2.5 Dashboards para depois

- `Keyword/Search Term Explorer`
- `Executive Client View`
- `Tenant Benchmark Dashboard`

## 3. Estrategia de leitura de dados agregados

### Camada 1: agregados prontos [MVP]

Usar primeiro:

- `agg_client_kpi_period`
- `agg_client_kpi_daily`

Motivo:

- essas tabelas alimentam scorecards e series principais sem recalcular fatos grandes

### Camada 2: fatos granulares [MVP]

Usar quando houver filtros ou cortes especificos:

- `fact_google_ads_campaign_daily`
- `fact_google_ads_campaign_device_daily`
- `fact_google_ads_campaign_hourly`
- `fact_google_ads_campaign_geo_daily`
- `fact_google_ads_account_intraday`
- `fact_google_ads_campaign_intraday`

Motivo:

- mantem flexibilidade para exploracao sem depender da API externa

### Camada 3: cache no backend [Recomendado]

Cachear por chave:

- `tenant_id`
- `client_id`
- `period_start`
- `period_end`
- `account_ids`
- `campaign_ids`
- `breakdown`

TTL recomendado:

- dashboard consolidado: 60 a 180 segundos
- tabelas de campanhas: 60 segundos
- painel de sync: 30 a 60 segundos

Motivo:

- alivia o MySQL sem tornar a recencia opaca

### Regra de backend

O frontend nunca compoe query SQL e nunca chama Google Ads.

Fluxo:

1. UI envia filtro ao backend
2. backend valida `tenant_id`, `client_access` e allowlists
3. backend tenta cache
4. backend le agregados ou fatos locais
5. backend devolve dados + metadados de recencia/integridade

## 4. Estrategia de filtros

### Filtros base [MVP]

- periodo
- conta Google Ads
- campanha
- dispositivo
- regiao
- horario

### Regras de uso

- `periodo`: sempre obrigatorio, com presets `hoje`, `ontem`, `7d`, `30d`, `mes atual`, `custom`
- `conta`: multiselect, default em todas as contas do cliente
- `campanha`: carregamento lazy por conta selecionada
- `dispositivo`: `all`, `mobile`, `desktop`, `tablet`, `other`
- `regiao`: top regioes primeiro; busca textual depois
- `horario`: intervalo simples, como `00-23` ou blocos `madrugada/manha/tarde/noite`

### Regras de performance

- aplicar filtro de cliente e periodo antes de qualquer breakdown
- limitar `campaign_ids` no request
- em filtro custom muito amplo com muitos cortes, exigir refinamento
- nao permitir combinacao arbitraria que gere explosao de cardinalidade no MVP

### Ordem de aplicacao no backend

1. `tenant_id`
2. `client_id`
3. `period_start/period_end`
4. `account_ids`
5. `campaign_ids`
6. breakdown especifico

Motivo:

- preserva isolamento e evita query cara sem escopo

## 5. Indicadores de recencia do dado

### Campos que a API do dashboard deve sempre retornar

- `data_as_of`
- `last_successful_sync_at`
- `last_intraday_sync_at`
- `selected_period_complete_until`
- `is_intraday_partial`
- `sync_status`

### Regras visuais [MVP]

- `Atualizado`
  - ultima sync bem-sucedida dentro da janela esperada
- `Parcial`
  - periodo inclui hoje e os dados de hoje sao intraday
- `Atrasado`
  - ultima sync passou da frequencia esperada
- `Falha`
  - ultima tentativa relevante falhou e nao houve sucesso posterior

### Regra pratica por tela

- scorecards e graficos devem exibir `Dados atualizados em 06/04/2026 10:00 BRT`
- quando o periodo incluir `hoje`, mostrar `Hoje ainda esta em processamento`
- se apenas parte dos cortes estiver atrasada, mostrar o aviso no widget afetado, nao na tela inteira

## 6. Indicadores de integridade da sync

### O que medir [MVP]

- status da conta
- ultima sync bem-sucedida por granularidade
- checkpoint mais recente por granularidade
- dias em atraso
- ultima falha
- quantidade de jobs em fila

### Granularidades exibidas

- `account_daily`
- `campaign_daily`
- `campaign_device_daily`
- `campaign_hourly`
- `campaign_geo_daily`
- `intraday_account`
- `intraday_campaign`

### Regra de interpretacao

- `ok`: checkpoint atualizado e sem falha aberta
- `lagging`: atraso acima do SLA da granularidade
- `partial`: existem fatos diarios ok, mas algum breakdown esta atrasado
- `error`: ultima execucao falhou e excedeu a janela tolerada

### SLA objetivo para UI

- intraday: ate 2 horas
- diario consolidado: ate 06:00 no timezone da conta
- reprocessamento: invisivel para cliente, mas visivel no painel tecnico

## 7. UX para dados em processamento

### Quando mostrar estado de processamento

- logo apos sync manual solicitada
- quando houver job `queued` ou `running`
- quando periodo inclui hoje e o dado ainda e intraday

### Comportamento visual [MVP]

- manter ultimo dado valido na tela
- mostrar `badge` de `Em processamento`
- mostrar mensagem curta:
  - `Atualizando dados localmente. Isso pode levar alguns minutos.`
- exibir hora da ultima base consistente

### O que evitar

- nao zerar grafico
- nao trocar por spinner de tela inteira
- nao bloquear toda a navegacao

Motivo:

- o usuario precisa continuar trabalhando com a ultima base confiavel

## 8. UX para falhas de sincronizacao

### Comportamento por severidade

- falha de intraday:
  - aviso discreto no header
  - manter ultimo diario consolidado
- falha de breakdown especifico:
  - indisponibilidade apenas no card afetado
  - exibir `Ultima sync valida em ...`
- falha de sync diaria consolidada:
  - alerta mais forte no dashboard do cliente e no painel de integracao

### Conteudo do aviso

- o que falhou
- desde quando esta desatualizado
- ultimo sucesso conhecido
- se ha retry automatico em andamento
- se o usuario tem permissao, botao `Solicitar nova sincronizacao`

### Regra de permissao

- `agency_admin` e `manager`: podem solicitar sync manual
- `analyst`: opcional, sob limite
- `client_viewer`: nao pode disparar sync

## 9. Consultas SQL ou pseudo-consultas

### 9.1 Scorecards do cliente por periodo

Usar `agg_client_kpi_period` para presets e `agg_client_kpi_daily` para custom.

Preset rapido:

```sql
SELECT
  spend,
  impressions,
  clicks,
  conversions,
  conversions_value,
  ctr,
  cpa,
  roas,
  generated_at AS data_as_of
FROM agg_client_kpi_period
WHERE tenant_id = ?
  AND client_id = ?
  AND period_type = ?
  AND period_start = ?
  AND period_end = ?;
```

Faixa custom:

```sql
SELECT
  SUM(spend) AS spend,
  SUM(impressions) AS impressions,
  SUM(clicks) AS clicks,
  SUM(conversions) AS conversions,
  SUM(conversions_value) AS conversions_value,
  CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) / SUM(impressions) ELSE NULL END AS ctr,
  CASE WHEN SUM(conversions) > 0 THEN SUM(spend) / SUM(conversions) ELSE NULL END AS cpa,
  CASE WHEN SUM(spend) > 0 THEN SUM(conversions_value) / SUM(spend) ELSE NULL END AS roas,
  MAX(synced_at) AS data_as_of
FROM agg_client_kpi_daily
WHERE tenant_id = ?
  AND client_id = ?
  AND report_date BETWEEN ? AND ?;
```

### 9.2 Serie temporal principal

```sql
SELECT
  report_date,
  spend,
  impressions,
  clicks,
  conversions,
  conversions_value,
  synced_at
FROM agg_client_kpi_daily
WHERE tenant_id = ?
  AND client_id = ?
  AND report_date BETWEEN ? AND ?
ORDER BY report_date;
```

### 9.3 Top campanhas

```sql
SELECT
  f.google_campaign_id,
  COALESCE(c.name, CONCAT('Campaign ', f.google_campaign_id)) AS campaign_name,
  SUM(f.cost_micros) / 1000000 AS spend,
  SUM(f.clicks) AS clicks,
  SUM(f.impressions) AS impressions,
  SUM(f.conversions) AS conversions,
  SUM(f.conversions_value) AS conversions_value,
  CASE WHEN SUM(f.conversions) > 0
    THEN (SUM(f.cost_micros) / 1000000) / SUM(f.conversions)
    ELSE NULL
  END AS cpa,
  CASE WHEN SUM(f.cost_micros) > 0
    THEN SUM(f.conversions_value) / (SUM(f.cost_micros) / 1000000)
    ELSE NULL
  END AS roas,
  MAX(f.synced_at) AS data_as_of
FROM fact_google_ads_campaign_daily f
LEFT JOIN dim_campaigns c
  ON c.tenant_id = f.tenant_id
 AND c.google_ads_account_id = f.google_ads_account_id
 AND c.google_campaign_id = f.google_campaign_id
WHERE f.tenant_id = ?
  AND f.client_id = ?
  AND f.report_date BETWEEN ? AND ?
  AND (? IS NULL OR f.google_ads_account_id IN (...))
GROUP BY f.google_campaign_id, campaign_name
ORDER BY spend DESC
LIMIT 10;
```

### 9.4 Breakdown por dispositivo

```sql
SELECT
  device_type,
  SUM(cost_micros) / 1000000 AS spend,
  SUM(clicks) AS clicks,
  SUM(impressions) AS impressions,
  SUM(conversions) AS conversions,
  SUM(conversions_value) AS conversions_value
FROM fact_google_ads_campaign_device_daily
WHERE tenant_id = ?
  AND client_id = ?
  AND report_date BETWEEN ? AND ?
  AND google_campaign_id IN (...)
GROUP BY device_type
ORDER BY spend DESC;
```

### 9.5 Breakdown por horario

```sql
SELECT
  hour_of_day,
  SUM(cost_micros) / 1000000 AS spend,
  SUM(clicks) AS clicks,
  SUM(conversions) AS conversions
FROM fact_google_ads_campaign_hourly
WHERE tenant_id = ?
  AND client_id = ?
  AND report_date BETWEEN ? AND ?
  AND google_campaign_id IN (...)
GROUP BY hour_of_day
ORDER BY hour_of_day;
```

### 9.6 Breakdown por regiao

```sql
SELECT
  geo_label,
  SUM(cost_micros) / 1000000 AS spend,
  SUM(clicks) AS clicks,
  SUM(conversions) AS conversions,
  SUM(conversions_value) AS conversions_value
FROM fact_google_ads_campaign_geo_daily
WHERE tenant_id = ?
  AND client_id = ?
  AND report_date BETWEEN ? AND ?
GROUP BY geo_label
ORDER BY spend DESC
LIMIT 15;
```

### 9.7 Intraday de hoje

```sql
SELECT
  snapshot_at,
  SUM(cost_micros) / 1000000 AS spend,
  SUM(clicks) AS clicks,
  SUM(conversions) AS conversions
FROM fact_google_ads_account_intraday
WHERE tenant_id = ?
  AND client_id = ?
  AND snapshot_date = CURRENT_DATE()
GROUP BY snapshot_at
ORDER BY snapshot_at;
```

### 9.8 Recencia por conta

```sql
SELECT
  a.id AS google_ads_account_id,
  a.descriptive_name,
  a.last_metric_sync_at,
  MAX(CASE WHEN sc.checkpoint_scope = 'campaign_daily' THEN sc.last_success_at END) AS campaign_daily_last_success_at,
  MAX(CASE WHEN sc.checkpoint_scope = 'campaign_daily' THEN sc.last_complete_date END) AS campaign_daily_complete_until,
  MAX(CASE WHEN sc.checkpoint_scope = 'campaign_device_daily' THEN sc.last_success_at END) AS device_last_success_at,
  MAX(CASE WHEN sc.checkpoint_scope = 'campaign_hourly' THEN sc.last_success_at END) AS hourly_last_success_at,
  MAX(CASE WHEN sc.checkpoint_scope = 'campaign_geo_daily' THEN sc.last_success_at END) AS geo_last_success_at
FROM google_ads_accounts a
LEFT JOIN sync_checkpoints sc
  ON sc.tenant_id = a.tenant_id
 AND sc.google_ads_account_id = a.id
WHERE a.tenant_id = ?
  AND a.client_id = ?
GROUP BY a.id, a.descriptive_name, a.last_metric_sync_at;
```

### 9.9 Falhas recentes de sincronizacao

```sql
SELECT
  sr.google_ads_account_id,
  sr.entity_scope,
  sr.status,
  sr.started_at,
  sr.finished_at,
  sr.error_code,
  sr.error_message
FROM sync_runs sr
WHERE sr.tenant_id = ?
  AND sr.client_id = ?
  AND sr.status IN ('failed', 'partial')
ORDER BY sr.started_at DESC
LIMIT 20;
```

### 9.10 Jobs em fila ou rodando

```sql
SELECT
  status,
  job_type,
  priority,
  COUNT(*) AS total
FROM sync_jobs
WHERE tenant_id = ?
  AND client_id = ?
  AND status IN ('queued', 'leased', 'running')
GROUP BY status, job_type, priority
ORDER BY priority DESC, status;
```

## 10. Contrato minimo de resposta para a UI

Cada endpoint de dashboard deve devolver:

```json
{
  "data": {},
  "meta": {
    "dataAsOf": "2026-04-06T10:00:00Z",
    "lastSuccessfulSyncAt": "2026-04-06T09:45:00Z",
    "lastIntradaySyncAt": "2026-04-06T09:45:00Z",
    "selectedPeriodCompleteUntil": "2026-04-05",
    "isIntradayPartial": true,
    "syncStatus": "partial",
    "syncWarnings": [
      "Breakdown por regiao ainda nao foi atualizado hoje."
    ]
  }
}
```

### Motivo

- a UI nunca precisa adivinhar se o dado esta fresco
- o frontend fica simples e seguro
- o mesmo contrato serve para dashboard, relatorio e exportacao

## 11. O que entra no MVP e o que fica para depois

### MVP

- dashboard da agencia
- dashboard do cliente
- top campanhas
- breakdown por dispositivo, horario e regiao
- header de recencia
- painel simples de sync health
- botao de sync manual que apenas enfileira job

### Recomendado

- cache no backend
- contracto padrao de `meta` para recencia e integridade
- degradacao por widget quando um breakdown falhar

### Depois

- explorer de search term
- benchmark entre clientes
- visao executiva separada para cliente final
- drill-down por anuncio e keyword
