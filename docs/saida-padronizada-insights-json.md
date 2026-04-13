# Saida Padronizada de Insights em JSON

Data de referencia: 2026-04-06

## 1. Decisao principal

Cada insight deve ter:

- um contrato JSON canonico para API e frontend
- um payload completo versionado para auditoria e recalculo
- uma representacao atual resumida no banco para listagem rapida

### Motivo

- o frontend precisa de um formato estavel
- o motor analitico precisa versionar recalculos sem perder historico
- a auditoria precisa saber o que foi gerado em cada execucao

## 2. Schema JSON

O schema JSON foi salvo em [insight-output.schema.json](C:/Users/digom/OneDrive/Documentos/GoogleADS/packages/shared/src/contracts/insight-output.schema.json) e o contrato TypeScript em [insight-output.ts](C:/Users/digom/OneDrive/Documentos/GoogleADS/packages/shared/src/contracts/insight-output.ts).

### Estrutura canonica

```json
{
  "id": "ins_01JQH0ZY3M4Q0Y0M8X9H7K2A1B",
  "tenant_id": "tnt_1001",
  "account_id": "acc_987",
  "entity_type": "device",
  "entity_id": "campaign:12345/mobile",
  "category": "device_efficiency",
  "severity": "warning",
  "priority_score": 82.4,
  "confidence_score": 0.84,
  "title": "Mobile concentrou gasto com eficiencia abaixo da conta",
  "summary": "Nos ultimos 14 dias, mobile ganhou participacao de gasto e operou com CPA acima da media da conta.",
  "evidence": [
    {
      "evidence_id": "ev_1",
      "metric": "cpa",
      "current_value": 82.3,
      "baseline_value": 54.7,
      "delta_pct": 50.5,
      "window": "last_14d_vs_previous_14d",
      "scope_label": "Campanha Institucional > Mobile",
      "note": "O CPA subiu fortemente na entidade analisada."
    }
  ],
  "diagnosis": "A piora de eficiencia foi puxada principalmente pelo mix de dispositivo, com maior peso de gasto em mobile e queda de taxa de conversao nesse segmento.",
  "primary_hypothesis": "Ha indicio de desalinhamento entre investimento em mobile e capacidade de conversao desse dispositivo.",
  "alternative_hypotheses": [
    "A experiencia mobile pode estar menos aderente apos o clique."
  ],
  "recommended_action": {
    "action_type": "shift_device",
    "action_target": "mobile",
    "description": "Redistribuir parte da verba para dispositivos mais eficientes.",
    "execution_mode": "manual"
  },
  "expected_impact": {
    "impact_type": "budget_allocation",
    "direction": "protect",
    "summary": "A acao tende a reduzir desperdicio e proteger o CPA medio."
  },
  "risk_level": "medium",
  "technical_explanation": "A entidade analisada mostra piora relevante em eficiencia quando comparada ao baseline do periodo anterior.",
  "executive_explanation": "O investimento nesta frente esta menos eficiente do que antes e precisa de ajuste.",
  "generated_at": "2026-04-06T10:15:00Z",
  "period_reference": {
    "analysis_window": "last_14d_vs_previous_14d",
    "period_start": "2026-03-23",
    "period_end": "2026-04-05",
    "baseline_start": "2026-03-09",
    "baseline_end": "2026-03-22",
    "comparison_label": "Ultimos 14 dias vs 14 dias anteriores"
  }
}
```

### Decisoes de formato

- usar `snake_case` no JSON externo
- ids em string para evitar problemas de precision no frontend
- `priority_score` de `0 a 100`
- `confidence_score` de `0 a 1`
- `severity` separada de `priority_score`

## 3. Exemplo preenchido

```json
{
  "id": "ins_01JQH0ZY3M4Q0Y0M8X9H7K2A1B",
  "tenant_id": "tnt_1001",
  "account_id": "acc_987",
  "entity_type": "device",
  "entity_id": "campaign:12345/mobile",
  "category": "device_efficiency",
  "severity": "warning",
  "priority_score": 82.4,
  "confidence_score": 0.84,
  "title": "Mobile concentrou gasto com eficiencia abaixo da conta",
  "summary": "Nos ultimos 14 dias, mobile recebeu 41% do gasto e operou com CPA 50,5% acima do periodo anterior.",
  "evidence": [
    {
      "evidence_id": "ev_1",
      "metric": "cpa",
      "current_value": 82.3,
      "baseline_value": 54.7,
      "delta_pct": 50.5,
      "window": "last_14d_vs_previous_14d",
      "scope_label": "Campanha Institucional > Mobile",
      "note": "O custo por aquisicao piorou fortemente no dispositivo."
    },
    {
      "evidence_id": "ev_2",
      "metric": "conversion_rate",
      "current_value": 0.021,
      "baseline_value": 0.028,
      "delta_pct": -25.0,
      "window": "last_14d_vs_previous_14d",
      "scope_label": "Campanha Institucional > Mobile",
      "note": "A taxa de conversao caiu e ajuda a explicar a alta do CPA."
    },
    {
      "evidence_id": "ev_3",
      "metric": "spend_share",
      "current_value": 0.41,
      "baseline_value": 0.30,
      "delta_pct": 36.7,
      "window": "last_14d_vs_previous_14d",
      "scope_label": "Conta",
      "note": "Mobile ganhou peso no mix de investimento."
    }
  ],
  "diagnosis": "A piora de eficiencia foi puxada principalmente pelo mix de dispositivo, com maior peso de gasto em mobile e queda de taxa de conversao nesse segmento.",
  "primary_hypothesis": "Ha indicio de desalinhamento entre investimento em mobile e capacidade de conversao desse dispositivo.",
  "alternative_hypotheses": [
    "A experiencia mobile pode estar menos aderente apos o clique.",
    "Parte do trafego mobile pode estar menos qualificado no periodo."
  ],
  "recommended_action": {
    "action_type": "shift_device",
    "action_target": "mobile",
    "description": "Reduzir parte da exposicao em mobile e redistribuir verba para dispositivos mais eficientes, acompanhando a evolucao em 7 dias.",
    "execution_mode": "manual"
  },
  "expected_impact": {
    "impact_type": "budget_allocation",
    "direction": "protect",
    "summary": "A tendencia e reduzir desperdicio e aproximar o CPA medio da conta do nivel anterior."
  },
  "risk_level": "medium",
  "technical_explanation": "Nos ultimos 14 dias, mobile concentrou 41% do gasto da conta e apresentou CPA de R$ 82,30, contra R$ 54,70 nos 14 dias anteriores. A piora foi acompanhada por queda de 25% na taxa de conversao e aumento de participacao de verba, o que sugere perda de eficiencia nesse dispositivo. O dado nao prova causa especifica apos o clique, mas sustenta a redistribuicao de verba como acao de curto prazo.",
  "executive_explanation": "Hoje estamos colocando mais verba no celular do que deveriamos para o retorno que ele esta trazendo. A recomendacao e reduzir parte dessa exposicao e concentrar mais investimento nos acessos que convertem melhor.",
  "generated_at": "2026-04-06T10:15:00Z",
  "period_reference": {
    "analysis_window": "last_14d_vs_previous_14d",
    "period_start": "2026-03-23",
    "period_end": "2026-04-05",
    "baseline_start": "2026-03-09",
    "baseline_end": "2026-03-22",
    "comparison_label": "Ultimos 14 dias vs 14 dias anteriores"
  }
}
```

## 4. Regras de validacao

### Regras estruturais

- JSON deve passar no schema
- sem campos extras
- `evidence` deve ter de `1` a `8` itens
- `alternative_hypotheses` no maximo `3`

### Regras de dominio

- `priority_score` entre `0` e `100`
- `confidence_score` entre `0` e `1`
- `severity` em `info | warning | critical`
- `risk_level` em `low | medium | high`
- `generated_at` em ISO 8601 UTC
- `period_reference.period_start <= period_reference.period_end`
- `baseline_start` e `baseline_end` devem vir juntos quando existirem

### Regras semanticas

- `title` e `summary` nao podem ser identicos
- `technical_explanation` deve citar ao menos uma evidencia numerica relevante
- `executive_explanation` nao deve repetir a tecnica literalmente
- `recommended_action.action_type` deve pertencer ao allowlist interno da regra
- `account_id` pode ser `null` apenas em insights de escopo agregado do tenant ou cliente

### Regras anti-alucinacao

- a evidencia deve sustentar `diagnosis`
- `primary_hypothesis` nao pode afirmar causa como fato quando a evidencia for apenas correlacional
- quando houver falta de dado relevante, isso deve aparecer em `diagnosis`, `summary` ou `technical_explanation`

## 5. Como persistir isso no banco

### Estrategia recomendada [MVP]

Usar 2 niveis:

- `insights`: estado atual consultavel
- `insight_versions`: historico imutavel de cada recalculo

### `insights`

Tabela de leitura rapida para dashboard, listagem e filtros.

Persistir nela:

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
- `recommendation_action`
- `priority`
- `priority_score`
- `confidence`
- `risk_level`
- `evidence_json`
- `period_reference_json`
- `current_payload_json`
- `current_version_number`
- `generated_at`

### `insight_versions`

Tabela append-only para auditoria, comparacao e historico.

Persistir nela:

- `insight_id`
- `version_number`
- `payload_schema_version`
- `payload_hash`
- `content_hash`
- `payload_json`
- `generated_at`
- `supersedes_version_id`

### Regra pratica de mapeamento

- o JSON canonico vai inteiro em `payload_json`
- os campos mais usados em filtros e cards ficam denormalizados em `insights`

### Motivo

- consulta rapida no dashboard
- historico completo para auditoria
- versao antiga preservada quando o insight muda

## 6. Como mostrar isso no frontend

### Lista de insights

Usar:

- `severity`
- `priority_score`
- `confidence_score`
- `title`
- `summary`
- `recommended_action.action_type`
- `generated_at`

### Card expandido

Exibir:

- `diagnosis`
- `primary_hypothesis`
- `alternative_hypotheses`
- `expected_impact.summary`
- `risk_level`
- `technical_explanation`
- `executive_explanation`
- `evidence`
- `period_reference.comparison_label`

### Regras de UX

- ordenar por `priority_score DESC`, depois `confidence_score DESC`
- usar badge para `severity`
- mostrar `confidence_score` como faixa:
  - `>= 0.85`: muito alta
  - `0.70-0.84`: alta
  - `0.50-0.69`: moderada
  - `< 0.50`: baixa
- permitir alternar entre visao `tecnica` e `executiva`
- mostrar `recalculado em ...` com `generated_at`

### O que nao fazer no frontend

- nao recalcular prioridade ou confianca
- nao inferir impacto sem `expected_impact`
- nao montar explicacao a partir de dados crus

## 7. Como versionar insights recalculados

### Conceito central

Um insight logico precisa de um identificador estavel.

Use:

- `insight_key = sha256(tenant_id + account_id + entity_type + entity_id + category + recommended_action.action_type)`

### Fluxo de recalculo

1. motor gera novo JSON canonico
2. sistema calcula `payload_hash`
3. sistema calcula `content_hash` normalizando campos volateis
4. busca `insights` por `tenant_id + insight_key`
5. se nao existir:
   - cria `insights`
   - cria `insight_versions` com `version_number = 1`
6. se existir e o `content_hash` for igual ao da ultima versao:
   - nao cria nova versao
   - opcionalmente atualiza somente `generated_at` do estado atual
7. se existir e o `content_hash` for diferente:
   - incrementa `current_version_number`
   - atualiza snapshot atual em `insights`
   - cria nova linha em `insight_versions`

### O que entra no `content_hash`

Entrar:

- entidade
- categoria
- severidade
- scores
- titulo
- summary
- diagnosis
- hypothesis
- action
- impact
- evidence normalizada
- period_reference

Nao entrar:

- `generated_at`
- ids tecnicos da execucao
- campos puramente operacionais

### Regra de supersessao

Quando a nova versao substituir a anterior:

- `insights.current_version_number` sobe
- `insight_versions.supersedes_version_id` aponta para a versao anterior

### Quando encerrar insight

Se o insight deixar de existir em recalculo posterior:

- nao apagar historico
- marcar `insights.status` como resolvido/arquivado em camada de aplicacao
- manter `insight_versions` intacto

## 8. Recomendacao final

### MVP

- schema JSON canonico
- DTO compartilhado
- `insights` + `insight_versions`
- dedupe por `insight_key`
- versionamento por `content_hash`

### Recomendado

- endpoint de listagem retornar somente `current_payload_json` ou DTO derivado
- endpoint de detalhe poder abrir historico por `version_number`
- frontend permitir comparar versao atual com versao anterior
