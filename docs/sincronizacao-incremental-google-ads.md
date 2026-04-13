# Sincronizacao Incremental Google Ads

Data de referencia: 2026-04-06

## 1. Design do fluxo

### Fase 1. Planejamento

Entrada:

- conta Google Ads
- modo `initial | incremental | manual`
- hora de referencia
- checkpoints atuais por escopo

Passos:

1. carregar checkpoints por conta e escopo
2. calcular janelas por escopo
3. transformar janelas em jobs
4. gerar `dedupe_key`
5. filtrar jobs duplicados ainda abertos
6. enfileirar por prioridade e `queue_name`

Implementacao:

- [google-ads-sync-window-planner.service.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/google-ads-sync-window-planner.service.ts)
- [schedule-google-ads-sync.use-case.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/schedule-google-ads-sync.use-case.ts)

### Fase 2. Claim do job

Entrada:

- worker livre
- fila com prioridade

Passos:

1. selecionar job elegivel por prioridade
2. validar `dedupe_key`
3. aplicar `lease_token`
4. validar `concurrency_key`
5. iniciar `sync_run`

Observacao:

- a logica de claim atomico com `FOR UPDATE SKIP LOCKED` deve ser implementada no repositorio concreto

### Fase 3. Execucao

Passos:

1. consultar checkpoint do escopo
2. chamar gateway da Google Ads API
3. registrar `api_request_logs`
4. fazer `upsert` dos fatos
5. atualizar checkpoint somente em caso de sucesso
6. finalizar `sync_run`
7. atualizar status do `sync_job`

Implementacao:

- [execute-google-ads-sync.use-case.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/execute-google-ads-sync.use-case.ts)
- [google-ads-sync-checkpoint.service.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/google-ads-sync-checkpoint.service.ts)
- [google-ads-sync-retry-policy.service.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/google-ads-sync-retry-policy.service.ts)

## 2. Pseudo-codigo

```ts
function scheduleAccountSync(account, mode, checkpoints, now) {
  const plan = planner.plan({ account, mode, checkpoints, now });
  const openKeys = jobRepository.findOpenDedupeKeys(plan.map(x => x.dedupeKey));
  const newJobs = plan.filter(job => !openKeys.has(job.dedupeKey));
  jobRepository.enqueueMany(newJobs);
}

async function executeSyncJob(job) {
  if (!(await rateLimiter.acquire(job.concurrencyKey))) {
    return reschedule(job, 60_000);
  }

  const run = await runRepository.start(job);
  const checkpoint = await checkpointRepository.find(job.scope, job.accountId);

  try {
    const response = await googleAdsGateway.fetch(job);
    await apiRequestLogRepository.recordMany(response.requestLogs);

    const writeResult = await factWriter.write(job, response.rows);
    const nextCheckpoint = checkpointService.advanceAfterSuccess({
      currentCheckpoint: checkpoint,
      job,
      run,
      writeResult
    });

    await checkpointRepository.save(nextCheckpoint);
    await runRepository.finishSucceeded(run, writeResult);
    await jobRepository.markSucceeded(job);
  } catch (error) {
    const decision = retryPolicy.decide(job.attemptCount + 1, job.maxAttempts, error);
    await runRepository.finishFailed(run, error);

    if (decision.shouldRetry) {
      await jobRepository.reschedule(job, decision.nextDelayMs);
      return;
    }

    await checkpointRepository.save(
      checkpointService.keepPositionAfterFailure({ currentCheckpoint: checkpoint, run })
    );
    await deadLetterQueue.push(job, error);
    await jobRepository.markFailed(job, error);
  } finally {
    await rateLimiter.release(job.concurrencyKey);
  }
}
```

## 3. Tabelas de controle necessarias

### `sync_jobs`

Papel:

- fila logica
- prioridade
- deduplicacao
- lease
- status

Campos importantes:

- `queue_name`
- `priority`
- `dedupe_key`
- `concurrency_key`
- `attempt_count`
- `max_attempts`
- `lease_token`
- `lease_expires_at`

### `sync_runs`

Papel:

- tentativa real de execucao
- contadores de linhas e requests
- erro da tentativa

Campos importantes:

- `run_uuid`
- `status`
- `rows_upserted`
- `api_request_count`
- `last_google_request_id`

### `sync_checkpoints`

Papel:

- watermark e data fechada por conta, recurso e periodo

Campos importantes:

- `checkpoint_scope`
- `checkpoint_key`
- `watermark_date`
- `watermark_datetime`
- `safe_reprocess_from`
- `last_complete_date`

### `api_request_logs`

Papel:

- rastrear consumo, latencia e troubleshooting da API externa

Campos importantes:

- `google_request_id`
- `gaql_fingerprint`
- `duration_ms`
- `response_row_count`
- `success`

### `dead_letter_queue`

Papel:

- falhas esgotadas
- requeue manual
- revisao operacional

## 4. Algoritmo de checkpoint

### Regra principal

Checkpoint so avanca se:

- leitura da API terminou
- escrita local terminou
- status final do run foi `succeeded`

### Sucesso

- `watermark_date` recebe a maior data observada
- `watermark_datetime` recebe o maior cursor temporal observado
- `last_complete_date` avanca ate o fim da janela
- `safe_reprocess_from` anda para tras com a janela de reprocessamento

### Falha

- `last_complete_date` nao avanca
- `watermark_*` nao avanca
- `last_status` fica `failed` ou `partial`

Motivo:

- permite retomada segura apos erro
- evita "pular" dados nao gravados

Implementacao:

- [google-ads-sync-checkpoint.service.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/google-ads-sync-checkpoint.service.ts)

## 5. Tratamento de erro

### Retry automatico

- timeout
- erro de rede
- `UNAVAILABLE`
- `DEADLINE_EXCEEDED`
- `INTERNAL`
- `RESOURCE_EXHAUSTED`

### Falha terminal

- token revogado
- permissao insuficiente
- query invalida
- erro estrutural de validacao

### Falha parcial

Se houve `upsert` antes do erro:

- `sync_run.status = partial`
- checkpoint nao avanca
- rerun pode repetir a janela com seguranca

## 6. Estrategia de retry/backoff

### Politica

- maximo de tentativas controlado por `JOB_MAX_ATTEMPTS`
- exponential backoff com jitter
- backoff especial para quota

### Delays sugeridos

- erro transiente comum: `30s`, `60s`, `120s`, `240s`
- `RESOURCE_EXHAUSTED`: `5m`, `15m`, `60m`

Implementacao:

- [google-ads-sync-retry-policy.service.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/google-ads-sync-retry-policy.service.ts)

## 7. Estrategia de idempotencia

### Nivel fila

- `dedupe_key` por `tenant + account + scope + job_type + start + end`

### Nivel banco

- `upsert` nas chaves naturais dos fatos

### Nivel checkpoint

- nao avancar checkpoint antes de commit final

### Nivel rerun

- mesma janela pode ser reexecutada sem duplicar fatos

Implementacao:

- [sync-dedupe-key-builder.service.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/sync-dedupe-key-builder.service.ts)

## 8. Exemplos de codigo em TypeScript

### Planejamento de janelas

Arquivo:

- [google-ads-sync-window-planner.service.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/google-ads-sync-window-planner.service.ts)

Pontos chave:

- `initial_backfill`
- `catchup`
- `reprocess`
- `intraday`

### Agendamento deduplicado

Arquivo:

- [schedule-google-ads-sync.use-case.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/schedule-google-ads-sync.use-case.ts)

Pontos chave:

- carrega checkpoints
- gera plano
- remove jobs com `dedupe_key` aberta
- enfileira por prioridade

### Execucao resiliente

Arquivo:

- [execute-google-ads-sync.use-case.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/apps/api/src/modules/sync/application/execute-google-ads-sync.use-case.ts)

Pontos chave:

- respeita `concurrency_key`
- inicia `sync_run`
- chama gateway
- grava logs da API
- escreve fatos
- atualiza checkpoint
- reprograma retry ou manda para dead letter

## 9. Recomendacao final

### Para implementacao real

1. criar repositorios concretos com MySQL/Prisma
2. implementar claim atomico por prioridade
3. ligar worker e scheduler
4. plugar gateway real da Google Ads API
5. plugar writers reais por granularidade

### O que ja esta codificado

- modelo de tipos do modulo
- planner incremental
- algoritmo de checkpoint
- retry policy
- dedupe key
- use case de agendamento
- use case de execucao
