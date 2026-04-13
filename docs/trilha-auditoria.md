# Trilha de Auditoria - SaaS Multi-tenant Google Ads

Data de referencia: 2026-04-06

## 1. Decisao principal

### Modelo recomendado

Usar 3 trilhas separadas:

- `security_events` para autenticacao, sessao, bloqueios, OAuth, token refresh e eventos suspeitos
- `audit_logs` para acoes funcionais, administrativas e operacionais com valor de governanca
- `api_request_logs` + logs estruturados da aplicacao para diagnostico tecnico e performance

### Motivo

- evita misturar evento de seguranca com telemetria de debug
- melhora consulta por tenant, usuario, recurso e periodo
- reduz risco de vazamento porque a trilha funcional nao precisa carregar stack trace
- fica mais simples aplicar retencao diferente para cada tipo de log

### Regra estrutural

- `audit_logs` e `security_events` devem ser **append-only**
- update so pode acontecer para marcar arquivamento tecnico, nunca para reescrever o fato
- delete fisico apenas por politica de retencao e depois de backup/arquivo validado
- toda leitura de auditoria dentro do produto deve filtrar por `tenant_id`
- `superadmin` so pode ver tenant alheio em `support mode` auditado

## 2. Modelo de tabela de auditoria

### `audit_logs` [MVP]

Motivo: registrar quem fez o que, em qual tenant, em qual recurso, com qual resultado.

Campos principais:

- `id`: chave primaria
- `tenant_id`: tenant do evento
- `client_id`: cliente impactado, quando existir
- `user_id`: usuario ator, quando existir
- `actor_membership_id`: membership usada na acao
- `auth_session_id`: sessao que originou a acao
- `request_id`: correlacao com a request HTTP original
- `correlation_id`: correlacao entre web, fila, worker e scheduler
- `event_key`: chave idempotente para evitar duplicidade em retry
- `event_name`: nome canonico do evento
- `event_category`: familia do evento
- `severity`: impacto operacional
- `outcome`: `success`, `failure` ou `blocked`
- `actor_type`: `user`, `superadmin`, `system`, `worker`, `scheduler`, `api`
- `source_type`: `web`, `api`, `worker`, `scheduler`, `system`
- `actor_role`: papel efetivo no momento da acao
- `resource_type`: tipo do recurso afetado
- `resource_id`: id do recurso afetado
- `http_method`: metodo HTTP normalizado
- `route_path`: rota normalizada, sem query string
- `ip_hash`: hash/HMAC do IP
- `user_agent_hash`: hash/HMAC do user-agent
- `before_json`: estado anterior mascarado
- `after_json`: estado novo mascarado
- `metadata_json`: contexto adicional seguro
- `redaction_level`: `none`, `masked`, `strict`
- `occurred_at`: momento real do evento
- `created_at`: momento em que o log foi persistido

### `security_events` [MVP]

Motivo: trilha focada em autenticacao, sessao, acesso indevido, OAuth e sinais de abuso.

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

### `export_logs` [Depois]

Motivo: criar trilha especializada para exportacoes se o volume crescer ou se houver exigencia contratual de rastrear download, expiracao e revogacao de arquivo em separado.

No MVP, exportacao pode ficar apenas em `audit_logs`.

## 3. Campos obrigatorios

### Obrigatorios em toda escrita de auditoria

- `event_name`
- `event_category`
- `outcome`
- `actor_type`
- `source_type`
- `occurred_at`
- `request_id` ou `correlation_id`
- `event_key` quando o evento vier de worker, scheduler ou fluxo com retry

### Obrigatorios por contexto

- `tenant_id`: obrigatorio sempre que o evento acontecer dentro de tenant
- `client_id`: obrigatorio quando o recurso pertence a um cliente especifico
- `user_id` ou `auth_session_id`: obrigatorio quando a acao veio de usuario autenticado
- `resource_type` e `resource_id`: obrigatorios para eventos com recurso identificavel
- `before_json` e `after_json`: obrigatorios em mudanca de permissao e configuracao

### Campos que nao devem ser obrigatorios no schema

Nao forcar como `NOT NULL`:

- `tenant_id` em login falho antes da resolucao de tenant
- `user_id` em brute force anonimo
- `resource_id` em evento puramente de sessao

Motivo: manter a trilha correta mesmo em eventos pre-auth e eventos de sistema.

## 4. Eventos criticos

### Autenticacao e acesso

- `auth.login.succeeded`
- `auth.login.failed`
- `auth.logout.succeeded`
- `auth.mfa.challenge_failed`
- `auth.password_reset.requested`
- `auth.password_reset.completed`
- `auth.session.revoked`
- `tenant.access.blocked`
- `tenant.scope.mismatch_blocked`

### Google Ads e credenciais

- `oauth.google_ads.connected`
- `oauth.google_ads.connection_revoked`
- `oauth.google_ads.token_refresh.succeeded`
- `oauth.google_ads.token_refresh.failed`
- `oauth.google_ads.scope_changed`

### Sincronizacao

- `sync.job.started`
- `sync.job.succeeded`
- `sync.job.failed`
- `sync.job.dead_lettered`
- `sync.manual_triggered`

### Insights e relatorios

- `insight.run.generated`
- `insight.status.changed`
- `report.generated`
- `report.failed`
- `report.exported`
- `report.downloaded`

### Permissoes, configuracao e acoes manuais

- `permission.membership.changed`
- `permission.client_access.changed`
- `config.tenant.changed`
- `config.client_reporting.changed`
- `manual.recommendation.accepted`
- `manual.recommendation.dismissed`
- `manual.note.updated`

### Eventos que devem ser gravados nas 2 trilhas

Os eventos abaixo valem auditoria funcional e seguranca:

- conexao ou revogacao de conta Google Ads
- falha de renovacao de token
- mudanca de permissao
- entrada em `support mode`
- exportacao e download de relatorio

Motivo:

- `security_events` ajuda a detectar abuso
- `audit_logs` ajuda a explicar a decisao ou a acao de negocio

## 5. Politicas de retencao

### Recomendacao pratica para MVP na Hostinger

- `security_events`: 180 dias no MySQL + arquivo criptografado ate 12 meses
- `audit_logs`: 365 dias no MySQL + arquivo criptografado ate 24 meses
- `api_request_logs`: 15 a 30 dias no MySQL
- `sync_runs`: 90 dias no MySQL

### Regras operacionais

- arquivar por mes fechado
- validar checksum do arquivo antes de apagar do banco
- guardar arquivo fora do frontend e fora de pasta publica
- documentar restore de auditoria separadamente do restore transacional

### Quando aumentar a retencao

Aumentar o prazo se houver:

- exigencia contratual
- investigacao em andamento
- incidente de seguranca
- necessidade fiscal ou juridica

## 6. Politicas de mascaramento

### Nunca registrar em claro

- senha
- token de sessao
- cookie
- CSRF token
- `access_token`
- `refresh_token`
- `client_secret`
- `developer_token`
- cabecalho `Authorization`
- codigo OAuth

### Como mascarar

- `ip_hash`: usar HMAC-SHA-256 com chave privada da aplicacao
- `user_agent_hash`: usar HMAC-SHA-256 ou hash com pepper
- email: exibir somente formato mascarado, como `jo***@dominio.com`
- customer id Google Ads: preferir `google_ads_account_id` interno; quando precisar exibir, mascarar parcialmente
- `before_json` e `after_json`: registrar diff allowlist, nao dump completo da entidade

### Regras de payload

- `metadata_json` deve receber apenas contexto seguro
- query strings nao devem ser logadas integralmente
- ids internos podem ser logados
- segredo alterado deve ser logado como `alias`, `version` ou `rotated=true`, nunca como valor

## 7. Politica de observabilidade

### Correlacao obrigatoria

- gerar `request_id` na borda da API
- propagar `correlation_id` para job, worker, scheduler e chamadas internas
- registrar o mesmo `correlation_id` em `sync_runs`, `api_request_logs`, `security_events` e `audit_logs`

### Escrita de logs

- eventos criticos devem ser persistidos no mesmo banco da transacao principal
- se falhar gravar auditoria de `permission`, `config`, `google_ads connect/disconnect` ou `report.exported`, a operacao deve falhar
- eventos de baixa criticidade podem ser emitidos de forma assincrona com `event_key` para dedupe

### Alertas minimos

- pico de `auth.login.failed`
- aumento de `tenant.scope.mismatch_blocked`
- repeticao de `oauth.google_ads.token_refresh.failed`
- aumento de `sync.job.failed`
- crescimento anormal de `report.exported`

### Metricas uteis

- `audit_write_failures_total`
- `security_events_total` por `event_name/outcome`
- `audit_events_total` por `event_category`
- `audit_queue_lag_seconds` se houver emissao assincrona
- `masked_fields_total`

## 8. Diferenca entre log tecnico e log de auditoria

### Log de auditoria

- foco em governanca, rastreabilidade e investigacao
- responde: quem fez o que, onde, em qual recurso, com qual resultado
- baixo volume, alto valor
- retencao maior
- acesso restrito por permissao
- nao deve carregar stack trace nem segredo

### Log tecnico

- foco em diagnostico, debug, latencia e comportamento da aplicacao
- responde: o que quebrou, por que demorou, qual dependencia falhou
- alto volume
- retencao curta
- pode ter stack trace mascarado
- normalmente fica em arquivo/stream estruturado e em tabelas operacionais como `api_request_logs` e `sync_runs`

### Regra pratica

- se o objetivo e explicar uma decisao, acesso, alteracao ou exportacao: `audit_logs`
- se o objetivo e detectar abuso ou falha de controle: `security_events`
- se o objetivo e depurar erro, quota, timeout ou latencia: log tecnico

## 9. Recomendacao final

### MVP

- `audit_logs` como trilha funcional principal
- `security_events` como trilha de seguranca
- `api_request_logs` e `sync_runs` como apoio tecnico
- `event_key` para idempotencia
- `request_id` + `correlation_id` para observabilidade

### Depois

- `export_logs` especializado
- envio para SIEM
- trilha WORM externa para tenants enterprise
