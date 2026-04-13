# Modulo de Ingestao da Google Ads API

Data de referencia: 2026-04-06

## 1. Objetivo do modulo

O modulo de ingestao existe para:

- puxar dados da Google Ads API em horarios controlados
- salvar tudo em banco local
- evitar consultas online no dashboard
- reduzir custo de API
- reduzir risco de `RESOURCE_EXHAUSTED`, throttling e bloqueios
- manter consistencia mesmo com conversoes atrasadas

## 2. Principio operacional

### Regra principal

**Nenhum dashboard deve depender de leitura online da Google Ads API.**

### Consequencia pratica

- a API externa e usada por jobs
- o app web le fatos e agregados locais
- a consistencia vem de:
  - ingestao incremental
  - janelas sobrepostas
  - reprocessamento recente
  - checkpoints idempotentes

## 3. Estrutura recomendada de jobs

## 3.1 Jobs de metadados

### `account_discovery`

Objetivo:

- descobrir contas acessiveis logo apos a conexao OAuth
- registrar `customer_id`, timezone, moeda, hierarchy/MCC

Quando rodar:

- imediatamente apos conectar Google Ads
- sob demanda quando houver reconnect

### `metadata_change_scan`

Objetivo:

- usar `change_status` para identificar recursos alterados
- evitar refresh completo desnecessario de campanhas, grupos e criterios

Quando rodar:

- a cada 3 horas para contas ativas
- 1 vez por dia para contas pouco ativas

Observacao importante:

- `change_status` cobre apenas a janela recente e requer filtro por data/hora
- ha limite de ate `10.000` mudancas por consulta e pode haver atraso de alguns minutos na refletancia das mudancas

### `metadata_refresh`

Objetivo:

- hidratar os recursos alterados encontrados pelo `metadata_change_scan`
- atualizar dimensoes locais

Quando rodar:

- logo apos um `change scan`
- tambem no backfill inicial

## 3.2 Jobs de metricas

### `intraday_account`

Objetivo:

- monitorar o dia atual com baixo custo

Query alvo:

- conta por `segments.date = TODAY`

### `intraday_campaign`

Objetivo:

- mostrar andamento do dia por campanha, sem granularidade pesada

Query alvo:

- campanha por `segments.date = TODAY`
- apenas campanhas prioritarias

### `daily_account`

Objetivo:

- consolidar resultado diario por conta

Query alvo:

- conta por `segments.date = YESTERDAY`

### `daily_campaign`

Objetivo:

- consolidar resultado diario por campanha

Query alvo:

- campanha por `segments.date = YESTERDAY`

### `daily_campaign_device`

Objetivo:

- consolidar por dispositivo

Query alvo:

- campanha + `segments.device`

### `daily_campaign_hourly`

Objetivo:

- consolidar por horario

Query alvo:

- campanha + `segments.date` + `segments.hour`

### `daily_campaign_geo`

Objetivo:

- consolidar por regiao

Query alvo:

- `geographic_view` + `segments.date`

### `daily_search_term`

Objetivo:

- capturar termos de pesquisa quando realmente houver beneficio analitico

Query alvo:

- `search_term_view` ou `campaign_search_term_view`

Regra recomendada:

- **nao rodar para todas as contas**
- limitar a:
  - contas com gasto recente
  - campanhas acima de limiar de gasto/clicks
  - janela curta

## 4. Estrategia de sincronizacao inicial

### Objetivo

Trazer historico util sem explodir custo logo no onboarding.

### Sequencia recomendada

1. `account_discovery`
2. `metadata_refresh` inicial
3. backfill de metricas em fases

### Fase A: historico essencial

- **ultimos 90 dias**
- `account_daily`
- `campaign_daily`

Tamanho de lote:

- 30 dias por requisicao

Motivo:

- entrega visao executiva e comparativos rapido
- baixo risco de resposta muito grande

### Fase B: segmentacoes importantes

- **ultimos 30 dias**
- `campaign_device_daily`
- `campaign_hourly`
- `campaign_geo_daily`

Tamanho de lote:

- 7 dias por requisicao

Motivo:

- device, horario e geo sao valiosos
- 30 dias costuma ser suficiente para o primeiro diagnostico

### Fase C: search terms

- **opcional no onboarding**
- **ultimos 7 a 14 dias**
- somente contas/campanhas com volume relevante

Tamanho de lote:

- 1 dia por requisicao

Motivo:

- search term tem alto volume e alto custo operacional

### Como reduzir custo no backfill inicial

- nao incluir muitas colunas na mesma GAQL
- nao combinar `device + hour + geo + search term` na mesma consulta
- usar `SearchStream` para cargas maiores
- dividir por janelas de data
- priorizar contas com gasto recente primeiro

## 5. Estrategia de sincronizacao incremental

### Objetivo

Manter o banco fresco sem depender da API em tempo real.

### Regras

- 1 conta = 1 pipeline logico de sync
- 1 job pesado por conta por vez
- jobs leves podem coexistir, mas nunca com mesmo `concurrency_key`
- dados intradiarios e diarios ficam separados

### Pipeline incremental recomendado

1. `metadata_change_scan`
2. `metadata_refresh` dos recursos alterados
3. `intraday_account`
4. `intraday_campaign`
5. `daily_account`
6. `daily_campaign`
7. `daily_campaign_device`
8. `daily_campaign_hourly`
9. `daily_campaign_geo`
10. `daily_search_term` seletivo

## 6. Estrategia de reprocessamento recente

### Problema

Conversoes e ajustes podem chegar atrasados.

### Solucao

Reprocessar janelas recentes com sobreposicao.

### Politica recomendada

#### Diariamente

- `recent_reprocess_account`: ultimos **14 dias**
- `recent_reprocess_campaign`: ultimos **14 dias**

#### Diariamente para segmentacoes pesadas

- `recent_reprocess_campaign_device`: ultimos **3 dias**
- `recent_reprocess_campaign_hourly`: ultimos **3 dias**
- `recent_reprocess_campaign_geo`: ultimos **3 dias**
- `recent_reprocess_search_term`: ultimos **3 dias**, somente contas elegiveis

#### Semanalmente

- domingo ou segunda de madrugada
- `account` e `campaign`: ultimos **30 dias**
- `device/hour/geo`: ultimos **7 a 14 dias**
- `search term`: ultimos **7 dias** e apenas top contas

### Motivo

- cobre atraso de conversao sem explodir consumo
- concentra custo onde o ganho analitico e maior

## 7. Frequencia objetiva recomendada

### Sync leve intraday

- **a cada 2 horas**
- janela: `TODAY`
- jobs:
  - `intraday_account`
  - `intraday_campaign`

Regra adicional:

- rodar apenas entre `06:00` e `22:00` no timezone da conta
- para `intraday_campaign`, limitar a top campanhas por gasto recente

### Sync completo diario

- **diariamente entre 02:00 e 04:00 no timezone da conta**
- janela: `YESTERDAY`
- jobs:
  - `daily_account`
  - `daily_campaign`
  - `daily_campaign_device`
  - `daily_campaign_hourly`
  - `daily_campaign_geo`

### Reprocessamento dos ultimos dias

- **diariamente entre 04:00 e 05:30**
- janelas:
  - `account/campaign`: ultimos `14 dias`
  - `device/hour/geo`: ultimos `3 dias`
  - `search term`: ultimos `3 dias`, seletivo

### Agregacoes noturnas

- **apos fechar ingestao diaria e reprocessamento**
- exemplo: `05:30` ou `06:00`
- jobs:
  - agregados por cliente
  - scorecards
  - insights
  - geracao de relatorios agendados

## 8. Jobs separados por granularidade

## 8.1 Conta

- menor custo
- maior prioridade
- usado para saude do dashboard e scorecard

## 8.2 Campanha

- principal base analitica
- sempre ligado

## 8.3 Dispositivo

- importante para recomendacao
- custo moderado
- rodar diariamente e reprocessar curto

## 8.4 Horario

- util para dayparting
- custo moderado
- rodar diariamente e reprocessar curto

## 8.5 Regiao

- util para geo split
- custo moderado
- rodar diariamente e reprocessar curto

## 8.6 Termos de pesquisa

- custo alto
- volume alto
- usar thresholds
- nunca habilitar indiscriminadamente no MVP

Thresholds iniciais recomendados:

- campanha com pelo menos `100` cliques nos ultimos `7 dias`
- ou gasto acima de um limiar configuravel

## 9. Politica de retries com backoff exponencial

### Classificacao

#### Retry automatico

- timeout
- erro de rede
- `UNAVAILABLE`
- `DEADLINE_EXCEEDED`
- `INTERNAL`
- `RESOURCE_EXHAUSTED` com cooldown

#### Nao retry automatico

- refresh token revogado
- permissao insuficiente
- query invalida
- erro de mapeamento local

### Politica recomendada

- maximo de `4` tentativas por job
- backoff exponencial com jitter

Exemplo:

1. tentativa 1: imediato
2. tentativa 2: `+30s a 90s`
3. tentativa 3: `+2m a 6m`
4. tentativa 4: `+10m a 30m`

Para `RESOURCE_EXHAUSTED`:

- aplicar cooldown maior
- `+5m`, `+15m`, `+60m`
- reduzir concorrencia global temporariamente

### Regra de seguranca

- falha de auth vai para `dead_letter_queue`
- falha de quota reincidente reduz prioridade do tenant/conta automaticamente

## 10. Politica de deduplicacao

### Em nivel de fila

Cada job deve gerar um `dedupe_key`:

`sha256(account_id + job_type + window_start + window_end + scope)`

Regra:

- se ja existir job `queued` ou `running` com mesmo `dedupe_key`, nao enfileirar outro

### Em nivel de escrita

Todas as tabelas fato devem usar `upsert` na chave do grao.

Exemplos:

- `account + report_date`
- `campaign + report_date`
- `campaign + report_date + device`
- `campaign + report_date + hour`
- `campaign + report_date + geo`

### Em nivel de run

- `sync_runs` representa a tentativa
- o job pode falhar e ser reexecutado sem duplicar fatos

## 11. Politica de checkpoints

### Regra central

**Checkpoint so avanca depois que a escrita foi concluida com sucesso.**

### Tipos de checkpoint

#### Metadados

- `watermark_datetime`
- baseado em `change_status.last_change_date_time`
- aplicar lag de seguranca de `5 minutos`

#### Diario

- `last_complete_date`
- usado para saber ate que data o fato esta fechado

#### Intraday

- `watermark_datetime`
- indica ultimo snapshot do dia

#### Reprocessamento

- `safe_reprocess_from`
- controla a menor data que deve ser reavaliada nas janelas sobrepostas

### Estrutura recomendada

- `sync_checkpoints`
  - `checkpoint_scope`
  - `checkpoint_key`
  - `watermark_date`
  - `watermark_datetime`
  - `safe_reprocess_from`
  - `last_complete_date`
  - `last_success_run_id`

## 12. Politica de logs e observabilidade

## 12.1 Tabelas de controle

### `sync_jobs`

Fila logica de intencao.

Responsavel por:

- enfileiramento
- prioridade
- lease
- deduplicacao
- concorrencia

### `sync_runs`

Tentativas reais de execucao.

Responsavel por:

- status da tentativa
- metricas de leitura e escrita
- ultimo `google request-id`
- erro da tentativa

### `sync_checkpoints`

Watermarks e datas fechadas.

Responsavel por:

- continuidade incremental
- reprocessamento seguro

### `api_request_logs`

Log por requisicao externa.

Responsavel por:

- `google request-id`
- GAQL fingerprint
- latencia
- volume retornado
- erro

### `dead_letter_queue`

Fila de falhas permanentes ou esgotadas.

Responsavel por:

- revisao manual
- requeue controlado
- rastreabilidade

## 12.2 Campos obrigatorios de observabilidade

Para cada `sync_run`:

- `rows_read`
- `rows_inserted`
- `rows_updated`
- `rows_upserted`
- `rows_skipped`
- `api_request_count`
- `api_operation_count`
- `duration`
- `error_code`
- `last_google_request_id`

Para cada `api_request_log`:

- `api_method`
- `resource_name`
- `google_request_id`
- `gaql_fingerprint`
- `date_from`
- `date_to`
- `duration_ms`
- `response_row_count`
- `success`

### Alarmes recomendados

- conta sem sync diario ha mais de 24h
- pico de `RESOURCE_EXHAUSTED`
- refresh token revogado
- muitos `partial` seguidos
- fila acumulada acima do normal

## 13. Politica de limitacao interna

### Limites recomendados para iniciar

- concorrencia global Google Ads: **3 requests simultaneas**
- concorrencia por conta: **1 job pesado por vez**
- concorrencia de search term: **1 job global por vez**
- sync manual: **1 por conta a cada 30 minutos**

### Ordem de prioridade

1. `intraday_account`
2. `daily_account`
3. `daily_campaign`
4. `recent_reprocess_account`
5. `recent_reprocess_campaign`
6. `device/hour/geo`
7. `search_term`

### Regra para contas frias

Se a conta nao teve gasto nos ultimos `30 dias`:

- nao rodar intraday
- reduzir `metadata_change_scan`
- manter apenas sync diario leve ou semanal

## 14. Como reduzir custo de API

- usar `SearchStream` em cargas maiores; uma chamada `Search` ou `SearchStream` conta como uma operacao de API independentemente dos lotes retornados
- selecionar apenas colunas necessarias
- separar jobs por segmentacao
- evitar consultas gigantes que excedam limite de resposta
- usar `change_status` para metadados
- nao ligar `search_term_view` para tudo
- reduzir frequencia de contas frias
- usar banco local para leitura do dashboard

## 15. Como reduzir risco de quota e throttling

- limitar concorrencia global por developer token
- limitar concorrencia por conta
- backoff exponencial com jitter
- cooldown maior em `RESOURCE_EXHAUSTED`
- nao disparar sync manual em massa
- distribuir horarios ao longo do dia e por timezone da conta
- usar janelas pequenas para jobs pesados

## 16. Como evitar inconsistencias

- separar intraday de daily
- usar `upsert` idempotente
- avancar checkpoint so depois de commit
- reprocessar janelas sobrepostas
- marcar `partial` quando parte da carga falhar
- nunca considerar dia atual como fechado
- registrar o `request-id` do Google para diagnostico

## 17. Como montar uma fila de sincronizacao segura

### Modelo recomendado

- `sync_jobs` como fila logica
- `sync_runs` como execucao
- worker com `lease`
- `FOR UPDATE SKIP LOCKED` para claim atomico

### Fluxo

1. Scheduler insere jobs `queued`.
2. Worker seleciona o proximo job elegivel.
3. Claim atomico com `lease_token` e `lease_expires_at`.
4. Worker cria `sync_run`.
5. Worker executa chamadas da API.
6. Worker grava fatos em transacao.
7. Worker atualiza checkpoint.
8. Worker marca job como `succeeded`, `partial` ou `failed`.
9. Se falhar definitivamente, envia para `dead_letter_queue`.

### Regras de seguranca

- um worker nao processa job sem lease valida
- job vencido pode ser reclamado por outro worker
- `concurrency_key` impede dois jobs pesados da mesma conta simultaneamente
- `dedupe_key` impede jobs duplicados
- payloads nunca carregam tokens em claro

## 18. Recomendacao objetiva final

### Frequencia

- `intraday leve`: a cada **2 horas**, hoje, conta + top campanhas
- `sync completo diario`: diariamente, `YESTERDAY`, entre **02:00 e 04:00**
- `reprocessamento curto`: diariamente, ultimos **14 dias** para conta/campanha
- `reprocessamento pesado`: diariamente, ultimos **3 dias** para device/hour/geo/search term seletivo
- `agregacoes noturnas`: apos a ingestao, por volta de **05:30/06:00**

### Janela inicial

- `90 dias` para conta e campanha
- `30 dias` para device/hour/geo
- `7 a 14 dias` para search term seletivo

### Concorrencia inicial

- **3 requests simultaneas no total**
- **1 job pesado por conta**
- **1 job de search term global**

### Tabelas operacionais obrigatorias

- `sync_jobs`
- `sync_runs`
- `sync_checkpoints`
- `api_request_logs`
- `dead_letter_queue`

## 19. Fontes atuais usadas

- Google Ads API quotas: [API Limits and Quotas](https://developers.google.com/google-ads/api/docs/best-practices/quotas)
- Google Ads API errors: [Understand API errors](https://developers.google.com/google-ads/api/docs/best-practices/understand-api-errors)
- Google Ads API change tracking: [Change Status](https://developers.google.com/google-ads/api/docs/change-status)
- Google Ads API search: [Search and SearchStream](https://developers.google.com/google-ads/api/rest/common/search)
- Google Ads API search terms: [SearchTermView](https://developers.google.com/google-ads/api/reference/rpc/v21/SearchTermView)
