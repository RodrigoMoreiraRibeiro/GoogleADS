# Motor Analitico - Google Ads

Data de referencia: 2026-04-06

## 1. Decisao principal

O motor analitico nao deve "inventar inteligencia".

Ele deve operar em 4 camadas:

1. detectar **sintomas** com base em dados locais
2. levantar **hipoteses provaveis** com evidencias observaveis
3. sugerir **acoes praticas**
4. explicar o raciocinio em linguagem tecnica e executiva

### Regra mais importante

- nunca declarar causa como fato sem evidencia direta
- quando houver apenas correlacao, escrever `causa provavel` ou `hipotese principal`
- quando faltar dado para afirmar algo, deixar isso explicito

Exemplo correto:

- `O CPA subiu porque a taxa de conversao caiu em mobile e a participacao de gasto em mobile aumentou.`

Exemplo incorreto:

- `O CPA subiu porque a landing page piorou.`  
  Motivo: isso exige dado adicional fora do Google Ads ou evidencia indireta forte.

## 2. Arquitetura do motor analitico

### 2.1 Arquitetura recomendada [MVP]

```mermaid
flowchart LR
    A["Facts e agregados locais"] --> B["Feature Builder"]
    B --> C["Comparator Engine"]
    C --> D["Symptom Detectors"]
    D --> E["Hypothesis Mapper"]
    E --> F["Action Recommender"]
    F --> G["Priority & Confidence Scoring"]
    G --> H["Explanation Builder"]
    H --> I["insights / insight_runs"]
```

### 2.2 Componentes

#### `Feature Builder` [MVP]

Responsabilidade:

- calcular metricas derivadas
- consolidar cortes por entidade
- preparar comparativos entre janelas

Entradas:

- `agg_client_kpi_daily`
- `fact_google_ads_account_daily`
- `fact_google_ads_campaign_daily`
- `fact_google_ads_campaign_device_daily`
- `fact_google_ads_campaign_hourly`
- `fact_google_ads_campaign_geo_daily`
- `client_kpi_targets`

Saidas:

- features por conta
- features por campanha
- features por dispositivo
- features por horario
- features por regiao

#### `Comparator Engine` [MVP]

Responsabilidade:

- comparar janela atual vs baseline
- medir delta absoluto
- medir delta percentual
- medir desvio contra meta
- medir desvio contra media da conta/campanha

#### `Symptom Detectors` [MVP]

Responsabilidade:

- detectar quedas, altas e desperdicios
- marcar o que mudou de forma relevante
- filtrar ruido estatistico e pouco volume

#### `Hypothesis Mapper` [MVP]

Responsabilidade:

- traduzir sintoma em hipoteses provaveis
- classificar se a evidencia aponta para anuncio, segmentacao, oferta, landing page, mensuracao ou orcamento

#### `Action Recommender` [MVP]

Responsabilidade:

- sugerir acao objetiva
- definir se a acao e aumentar, reduzir, pausar, revisar ou investigar

#### `Priority & Confidence Scoring` [MVP]

Responsabilidade:

- ordenar insights
- reduzir peso de leituras com pouca amostra
- diferenciar problema urgente de problema leve

#### `Explanation Builder` [MVP]

Responsabilidade:

- gerar texto tecnico para gestor
- gerar texto executivo para cliente leigo
- manter rastreabilidade da evidencia

## 3. Modelo logico do insight

### Formato de saida recomendado

```json
{
  "title": "CPA subiu em mobile nas ultimas 2 semanas",
  "affectedEntity": {
    "scopeType": "device",
    "scopeRef": "campaign:12345/mobile",
    "scopeLabel": "Campanha Institucional > Mobile"
  },
  "evidence": [
    {
      "metric": "cpa",
      "current": 82.3,
      "baseline": 54.7,
      "deltaPct": 50.5,
      "window": "last_14d_vs_previous_14d"
    }
  ],
  "diagnosis": "O aumento do CPA veio de piora de taxa de conversao com gasto ainda crescente em mobile.",
  "primaryHypothesis": "Ha desalinhamento de dispositivo: mobile esta absorvendo verba com eficiencia inferior.",
  "recommendedAction": "Reduzir o ajuste de lance em mobile ou redistribuir parte da verba para campanhas/dispositivos mais eficientes.",
  "expectedImpact": "Reducao de desperdicio e recuperacao gradual do CPA medio.",
  "priority": "high",
  "confidence": 0.83,
  "technicalVersion": "Nos ultimos 14 dias, mobile concentrou 41% do gasto da campanha, mas converteu 23% menos por clique do que no periodo anterior.",
  "executiveVersion": "Hoje estamos investindo demais no celular para o retorno que ele esta trazendo."
}
```

### Como persistir no modelo atual [MVP]

- `title` -> `insights.title`
- `diagnosis` -> `insights.explanation_short`
- `executiveVersion` -> `insights.explanation_exec`
- `recommendedAction` -> `insights.recommendation_action` + detalhamento em `evidence_json`
- `priority` -> `insights.priority`
- `confidence` -> `insights.confidence`
- `evidence`, `primaryHypothesis`, `technicalVersion`, `expectedImpact` -> `insights.evidence_json`

Motivo:

- evita aumentar schema cedo demais
- mantem flexibilidade para evoluir o motor

## 4. Regras deterministicas iniciais

## 4.1 Familia: por que o CPA subiu?

### Regra `CPA_UP_CVR_DOWN` [MVP]

Dispara quando:

- `cpa` sobe acima de `20%`
- `conversions >= 5`
- `clicks >= 80`
- `conversion_rate` cai acima de `15%`
- `cpc` nao explica sozinho a piora

Diagnostico:

- sintoma: CPA piorou por queda de taxa de conversao
- hipotese principal: trafego esta menos qualificado ou a experiencia apos clique piorou

Acao sugerida:

- revisar campanhas/segmentos que mais cresceram em gasto
- revisar landing page ou oferta se a queda de CVR for generalizada
- cortar segmentos piores se a queda estiver concentrada

### Regra `CPA_UP_CPC_UP` [MVP]

Dispara quando:

- `cpa` sobe acima de `20%`
- `cpc` sobe acima de `15%`
- `ctr` cai ou se mantem
- `conversion_rate` esta estavel

Diagnostico:

- sintoma: o custo por clique aumentou e esta pressionando o CPA
- hipotese principal: perda de eficiencia no leilao, piora de anuncio ou aumento de concorrencia

Acao sugerida:

- revisar qualidade de anuncio e termos
- revisar estrategia de lance e teto de CPC
- revisar share perdido por rank quando disponivel

### Regra `CPA_UP_MIX_SHIFT` [MVP]

Dispara quando:

- CPA da conta sobe
- existe mudanca relevante na distribuicao de gasto entre campanhas, dispositivos, horarios ou regioes
- os segmentos que ganharam gasto performam pior que a media anterior

Diagnostico:

- sintoma: o problema veio do mix de investimento
- hipotese principal: a verba migrou para segmentos menos eficientes

Acao sugerida:

- redistribuir verba
- aplicar ajuste por dispositivo, horario ou geografia
- conter campanhas que cresceram gasto sem acompanhar retorno

### Regra `CPA_UP_TRACKING_SUSPECT` [MVP]

Dispara quando:

- gasto e cliques estaveis
- conversoes caem abruptamente acima de `40%`
- queda acontece ao mesmo tempo em varias campanhas

Diagnostico:

- sintoma: queda abrupta de conversoes sem equivalente no topo do funil
- hipotese principal: problema de mensuracao ou atraso de conversao

Acao sugerida:

- verificar tag, importacao de conversoes e reprocessamento recente
- reduzir confianca de qualquer conclusao operacional

## 4.2 Familia: por que o CTR caiu?

### Regra `CTR_DOWN_IMPRESSIONS_UP` [MVP]

Dispara quando:

- `ctr` cai acima de `15%`
- `impressions` sobem acima de `20%`
- `clicks` crescem menos que `impressions`

Diagnostico:

- sintoma: houve expansao de alcance com menor taxa de clique
- hipotese principal: segmentacao mais ampla ou anuncios menos aderentes a novas consultas

Acao sugerida:

- revisar segmentacao
- revisar copy/anuncio
- reduzir expansao se ela estiver degradando trafego

### Regra `CTR_DOWN_RANK_OR_FATIGUE` [MVP]

Dispara quando:

- `ctr` cai acima de `15%`
- `impressions` e `cpc` sobem
- share perdido por rank piora ou a queda se concentra em campanhas antigas com alto volume

Diagnostico:

- sintoma: anuncio perdeu atratividade no leilao
- hipotese principal: fadiga criativa ou piora de posicao media relativa

Acao sugerida:

- testar novas copys/ativos
- revisar relevancia de anuncio e grupos

## 4.3 Familia: regiao gasta e nao converte

### Regra `GEO_WASTE` [MVP]

Dispara quando:

- `cost >= max(target_cpa * 1.5, 100)`
- `conversions = 0` ou `cpa` acima de `50%` da media da campanha
- `clicks >= 25`

Diagnostico:

- sintoma: regiao consome verba e nao entrega retorno proporcional
- hipotese principal: baixa aderencia geografica, oferta fraca para a regiao ou qualidade ruim do trafego local

Acao sugerida:

- reduzir ajuste geografico
- excluir regiao de baixa eficiencia
- separar campanha especifica se a regiao ainda tiver volume relevante

## 4.4 Familia: melhores e piores horarios

### Regra `HOUR_BEST_WINDOW` [MVP]

Dispara quando:

- determinado bloco horario tem `roas` ou `cvr` acima da media da campanha por margem relevante
- `clicks >= 30`
- `conversions >= 3`

Acao sugerida:

- priorizar verba nesse horario
- testar ajuste de lance positivo

### Regra `HOUR_WASTE_WINDOW` [MVP]

Dispara quando:

- bloco horario gasta acima de `10%` do total
- `conversions = 0` ou `roas` muito abaixo da media
- `clicks >= 25`

Acao sugerida:

- reduzir exposicao nesse horario
- limitar agendamento

## 4.5 Familia: campanhas que devem receber mais verba

### Regra `BUDGET_EXPAND_WINNER` [MVP]

Dispara quando:

- campanha tem `roas` acima da meta ou `cpa` abaixo da meta
- `conversions >= 10`
- share perdido por orcamento e relevante quando disponivel
- tendencia estavel em 7d e 14d

Diagnostico:

- sintoma: campanha entrega eficiencia acima da meta com espaco para escalar
- hipotese principal: existe demanda nao capturada por limitacao de orcamento

Acao sugerida:

- aumentar verba gradualmente
- monitorar deterioracao marginal apos aumento

## 4.6 Familia: campanhas que devem ser reduzidas ou pausadas

### Regra `CAMPAIGN_REDUCE_OR_PAUSE` [MVP]

Dispara quando:

- `cost >= max(target_cpa * 3, 200)`
- `conversions <= 1` ou `roas` muito abaixo da meta
- problema persiste em 7d e 14d

Diagnostico:

- sintoma: campanha consome verba sem retorno suficiente
- hipotese principal: segmentacao ruim, oferta fraca ou anuncio nao aderente

Acao sugerida:

- reduzir verba
- pausar se houver baixo potencial e pouca recuperacao
- abrir revisao de termo/anuncio/landing

## 4.7 Familia: termos que geram desperdicio

### Regra `SEARCH_TERM_WASTE` [Depois]

Dispara quando:

- search term tem `clicks >= 20`
- `cost >= target_cpa`
- `conversions = 0`

Acao sugerida:

- negativar termo
- mover para campanha/grupo mais aderente
- ajustar correspondencia

## 4.8 Familia: onde parece estar o problema?

### Sinal de anuncio

Usar quando:

- `ctr` cai
- share ou alcance estavel
- queda concentrada em campanhas/grupos especificos

Conclusao permitida:

- `ha evidencia de piora de atratividade do anuncio`

Nao concluir:

- `a copy esta errada` como fato

### Sinal de segmentacao

Usar quando:

- regioes, horarios, dispositivos ou termos ruins concentram gasto
- CTR pode ate estar aceitavel, mas CVR e CPA pioram

Conclusao permitida:

- `ha evidencia de trafego menos qualificado em segmentos especificos`

### Sinal de oferta ou landing page

Usar quando:

- cliques e CTR permanecem saudaveis
- CVR cai de forma ampla em varios segmentos

Conclusao permitida:

- `ha indicio de problema apos o clique, como oferta, experiencia de pagina ou mensuracao`

### Sinal de orcamento

Usar quando:

- campanhas boas batem meta
- share perdido por orcamento e alto
- a eficiencia se mantem em 7d e 14d

Conclusao permitida:

- `ha evidencia de limitacao por orcamento`

## 5. Score de prioridade

### Objetivo

Prioridade define o que aparece primeiro para o gestor.

### Formula recomendada [MVP]

`priority_score = impact_score * 0.45 + efficiency_gap_score * 0.25 + urgency_score * 0.15 + consistency_score * 0.15`

### Componentes

#### `impact_score` 0-100

Mede:

- gasto afetado
- perda potencial
- volume de conversoes ou receita em risco

#### `efficiency_gap_score` 0-100

Mede:

- distancia da meta de CPA
- distancia da meta de ROAS
- diferenca contra media da conta

#### `urgency_score` 0-100

Mede:

- piora recente acelerando
- velocidade da deterioracao
- falha ou risco atual alto

#### `consistency_score` 0-100

Mede:

- repeticao do problema em mais de uma janela
- consistencia em 7d e 14d

### Conversao para prioridade textual

- `critical`: `>= 85`
- `high`: `70-84`
- `medium`: `45-69`
- `low`: `< 45`

## 6. Calculo de confianca

### Regra principal

Confianca e a qualidade da inferencia, nao a gravidade do problema.

### Formula recomendada [MVP]

`confidence = sample_score * 0.35 + consistency_score * 0.20 + evidence_coverage_score * 0.20 + freshness_score * 0.10 + target_alignment_score * 0.05 + causal_specificity_score * 0.10`

### Componentes

#### `sample_score`

Baseado em:

- impressoes
- cliques
- conversoes
- gasto

#### `consistency_score`

Baseado em:

- repeticao entre `yesterday`, `7d`, `14d`, `30d`

#### `evidence_coverage_score`

Baseado em:

- quantos sinais sustentam a leitura
- exemplo: CPA ruim + CVR ruim + mix pior = cobertura maior

#### `freshness_score`

Baseado em:

- qualidade e recencia da sync
- se o dado esta parcial ou atrasado, a confianca cai

#### `target_alignment_score`

Baseado em:

- existencia de meta clara para comparar

#### `causal_specificity_score`

Baseado em:

- quao especifica a hipotese pode ser sem extrapolacao
- `problema em mobile` recebe score maior do que `landing page ruim`

### Regras de rebaixamento obrigatorio

Reduzir confianca quando:

- `conversions < 5` para conclusoes de CPA/CVR
- periodo inclui hoje e a base e intraday
- existe falha ou lag em sync relevante
- a leitura depende de search terms e essa granularidade nao esta disponivel
- a queda e muito recente e ainda nao apareceu em mais de uma janela

### Faixas recomendadas

- `0.85 - 1.00`: muito alta
- `0.70 - 0.84`: alta
- `0.50 - 0.69`: moderada
- `< 0.50`: baixa

## 7. Regras de volume minimo

### Conta

- `CTR`: `impressions >= 1000`
- `CPC`: `clicks >= 100`
- `CPA/CVR`: `clicks >= 80` e `conversions >= 5`
- `ROAS`: `cost >= 200` e `conversions_value > 0`

### Campanha

- `CTR`: `impressions >= 500`
- `CPC`: `clicks >= 50`
- `CPA/CVR`: `clicks >= 40` e `conversions >= 3`
- `ROAS`: `cost >= 100`

### Dispositivo, horario e regiao

- `clicks >= 25`
- `cost >= 50`
- `conversions >= 2` para conclusao forte

### Palavra e termo

- `clicks >= 20`
- `cost >= 1 * target_cpa` para alerta
- `cost >= 1.5 * target_cpa` para recomendacao forte

### Regra de seguranca

Se nao atingir volume minimo:

- pode gerar `monitorar`
- nao pode gerar `pausar` ou `aumentar verba` com alta confianca

## 8. Estrategia de comparacao de periodos

### Janela operacional curta

#### `ontem vs anteontem`

Uso:

- detectar mudancas bruscas
- util para operacao diaria

Regra:

- nunca usar sozinha para recomendacao estrutural forte

### Janela de estabilidade curta

#### `ultimos 7 dias vs 7 dias anteriores`

Uso:

- primeira janela de decisao
- melhor equilibrio entre velocidade e ruido

### Janela de validacao

#### `ultimos 14 dias vs 14 dias anteriores`

Uso:

- confirmar persistencia
- melhorar confianca

### Janela de consolidacao

#### `ultimos 30 dias vs 30 dias anteriores`

Uso:

- decisoes de verba, geo e estrutura
- mais robusta para sazonalidade curta

### Regras de uso combinadas

- alerta rapido: `ontem vs anteontem`
- recomendacao inicial: `7d`
- confirmacao: `14d`
- decisao estrutural: `30d`

### Regra de consistencia

Quanto mais janelas apontarem para a mesma direcao, maior a confianca.

Exemplo:

- `7d` ruim
- `14d` ruim
- `30d` ruim

Resultado:

- alta chance de problema estrutural

## 9. Separacao entre sintoma, hipotese e acao

### Sintoma

O que o dado mostra de forma objetiva.

Exemplos:

- `CPA subiu 38%`
- `CTR caiu 21%`
- `Mobile consumiu 46% do gasto com ROAS 32% abaixo da media`

### Hipotese

Interpretacao provavel, mas nao provada causalmente.

Exemplos:

- `Ha indicio de perda de qualidade do trafego em mobile`
- `Ha indicio de expansao para regioes menos qualificadas`

### Acao sugerida

Intervencao pratica e controlavel pelo gestor.

Exemplos:

- `reduzir lance em mobile`
- `redistribuir verba para campanhas eficientes`
- `revisar termos e negativos`

### Regra de ouro

- sintoma usa linguagem factual
- hipotese usa linguagem probabilistica
- acao usa linguagem imperativa e pratica

## 10. Como gerar explicacao tecnica

### Template [MVP]

`[titulo]. No periodo [janela_atual], [entidade] registrou [metrica_principal] de [valor_atual], contra [valor_base] no periodo de comparacao ([delta_pct]). A piora/melhora foi acompanhada por [sinal_secundario_1] e [sinal_secundario_2]. Isso sugere [hipotese_principal], mas [limitacao_se_houver].`

### Exemplo

`CPA acima da meta em mobile. Nos ultimos 14 dias, a Campanha X registrou CPA de R$ 82,30 em mobile, contra R$ 54,70 nos 14 dias anteriores (+50,5%). A piora foi acompanhada por queda de 19% na taxa de conversao e aumento de 11% na participacao de gasto em mobile. Isso sugere perda de eficiencia no trafego mobile, mas nao prova causa especifica apos o clique.`

### Regras

- incluir numeros
- incluir janela
- incluir baseline
- incluir limitacao se houver
- nao exagerar certeza

## 11. Como gerar explicacao executiva para leigos

### Template [MVP]

`[titulo curto]. Estamos [investindo/perdendo/aproveitando] [mais/menos] do que deveriamos em [entidade]. O principal sinal e que [resultado simples]. A recomendacao e [acao], porque isso tende a [impacto esperado].`

### Exemplo

`Mobile esta menos eficiente. Hoje estamos colocando verba demais no celular para o retorno que ele esta entregando. O principal sinal e que o custo por conversao subiu enquanto a taxa de conversao caiu. A recomendacao e reduzir parte dessa exposicao e redistribuir verba para segmentos mais eficientes, porque isso tende a diminuir desperdicio.`

### Regras

- sem siglas demais
- sem jargao de leilao
- foco em problema, acao e impacto
- no maximo 3 frases

## 12. Recomendacao final de implementacao

### MVP

- motor 100% deterministico
- regras por campanha, dispositivo, horario e regiao
- prioridade + confianca
- explicacao tecnica e executiva
- bloqueio de recomendacoes fortes sem volume minimo

### Recomendado

- biblioteca de regras versionada com `rule_code`
- persistir comparacoes em `evidence_json`
- score de consistencia multi-janela
- job separado para `insight_generation`

### Depois

- search term e keyword com cobertura seletiva
- anomalia estatistica complementar
- dados externos de landing page/CRM para melhorar causalidade
