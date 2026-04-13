# Regras Analiticas Iniciais - Horario, Regiao e Dispositivo

Data de referencia: 2026-04-06

## 1. Premissas

Estas regras sao deterministicas e devem operar apenas sobre dados locais.

### Janela recomendada

- janela principal: `ultimos 14 dias vs 14 dias anteriores`
- janela de confirmacao: `ultimos 7 dias vs 7 dias anteriores`
- janela rapida: `ontem vs anteontem` apenas para alerta

### Baselines

- `media da campanha` para horario, regiao e dispositivo dentro da campanha
- `media da conta` quando a regra pedir comparacao global
- `meta do cliente` quando existir em `client_kpi_targets`

### Formulas base

- `spend = SUM(cost_micros) / 1000000`
- `ctr = clicks / impressions`
- `cvr = conversions / clicks`
- `cpc = spend / clicks`
- `cpa = spend / conversions`
- `roas = conversions_value / spend`
- `spend_share = spend_segmento / spend_total`
- `conv_share = conversions_segmento / conversions_total`
- `value_share = conversions_value_segmento / conversions_value_total`

### Regra de seguranca

Se a amostra minima nao for atingida:

- a regra pode gerar insight de `monitorar`
- a regra nao deve recomendar pausar, cortar forte ou escalar forte com alta confianca

## 2. Regras de horario

### 2.1 `HOUR_WASTE_ZERO_CONV`

1. Nome da regra: `HOUR_WASTE_ZERO_CONV`
2. Objetivo: encontrar faixas horarias que consomem verba e nao geram conversao.
3. Condicoes de disparo: faixa horaria com `conversions = 0`, `spend_share >= 8%` e repeticao em `7d` ou `14d`.
4. Amostra minima: `clicks >= 25` e `spend >= 50`.
5. Formula ou logica: disparar se `spend_hour >= 0.08 * spend_campaign` e `conversions_hour = 0`.
6. Mensagem tecnica: `A faixa horaria [HH] concentrou gasto relevante, mas nao gerou conversoes no periodo analisado.`
7. Mensagem executiva para cliente: `Estamos investindo em horarios que nao estao trazendo resultado.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`, porque reduzir horario pode diminuir alcance util se a amostra ainda estiver no limite.
10. Dados necessarios: `fact_google_ads_campaign_hourly`, total da campanha no periodo, `client_kpi_targets`.

### 2.2 `HOUR_CPA_ABOVE_CAMPAIGN`

1. Nome da regra: `HOUR_CPA_ABOVE_CAMPAIGN`
2. Objetivo: identificar horarios com CPA muito pior que a campanha.
3. Condicoes de disparo: `cpa_hour >= 1.6 * cpa_campaign` e o horario responde por gasto relevante.
4. Amostra minima: `clicks >= 25`, `conversions >= 2`, `spend >= 50`.
5. Formula ou logica: comparar `cpa` da hora contra `cpa` medio da campanha na mesma janela.
6. Mensagem tecnica: `O horario [HH] opera com CPA [X]% acima da media da campanha.`
7. Mensagem executiva para cliente: `Em parte do dia estamos pagando mais caro por resultado do que no restante da campanha.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_hourly`, baseline da campanha, metas de CPA.

### 2.3 `HOUR_CVR_COLLAPSE`

1. Nome da regra: `HOUR_CVR_COLLAPSE`
2. Objetivo: detectar horarios em que a taxa de conversao desaba.
3. Condicoes de disparo: `cvr_hour <= 0.6 * cvr_campaign` com gasto ou clique relevantes.
4. Amostra minima: `clicks >= 30`, `conversions_total_campaign >= 5`.
5. Formula ou logica: `cvr_hour = conversions_hour / clicks_hour`; comparar contra `cvr_campaign`.
6. Mensagem tecnica: `O horario [HH] manteve volume de clique, mas converte muito abaixo da media da campanha.`
7. Mensagem executiva para cliente: `Em determinados horarios o trafego chega, mas vira resultado com muito menos eficiencia.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_hourly`, baseline de `cvr` da campanha.

### 2.4 `HOUR_CPC_SPIKE_WITHOUT_GAIN`

1. Nome da regra: `HOUR_CPC_SPIKE_WITHOUT_GAIN`
2. Objetivo: encontrar horarios onde o clique fica mais caro sem compensacao em conversao.
3. Condicoes de disparo: `cpc_hour >= 1.25 * cpc_campaign`, `cvr_hour <= cvr_campaign` e `ctr_hour <= ctr_campaign`.
4. Amostra minima: `clicks >= 30`, `impressions >= 500`.
5. Formula ou logica: comparar `cpc`, `ctr` e `cvr` da hora contra a media da campanha.
6. Mensagem tecnica: `No horario [HH], o CPC esta pressionado e nao ha ganho proporcional em CTR ou conversao.`
7. Mensagem executiva para cliente: `Nesse horario o clique esta ficando mais caro sem trazer retorno melhor.`
8. Prioridade sugerida: `medium`
9. Risco da acao: `low`, porque o ajuste tende a ser fino.
10. Dados necessarios: `fact_google_ads_campaign_hourly`.

### 2.5 `HOUR_WINNER_ROAS`

1. Nome da regra: `HOUR_WINNER_ROAS`
2. Objetivo: identificar horarios com retorno claramente superior para concentrar verba.
3. Condicoes de disparo: `roas_hour >= 1.4 * roas_campaign` e o horario ainda nao recebe gasto proporcional ao valor gerado.
4. Amostra minima: `clicks >= 30`, `conversions >= 3`, `spend >= 50`.
5. Formula ou logica: disparar se `roas_hour` supera a media e `value_share - spend_share >= 0.10`.
6. Mensagem tecnica: `O horario [HH] entrega ROAS acima da media e gera mais valor do que a fatia de gasto que recebe.`
7. Mensagem executiva para cliente: `Ha horarios que estao trazendo retorno melhor e merecem mais concentracao de investimento.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`, porque escalar horario vencedor pode perder eficiencia marginal.
10. Dados necessarios: `fact_google_ads_campaign_hourly`, total da campanha.

### 2.6 `HOUR_WINNER_CPA`

1. Nome da regra: `HOUR_WINNER_CPA`
2. Objetivo: encontrar horarios com CPA consistentemente abaixo da media.
3. Condicoes de disparo: `cpa_hour <= 0.7 * cpa_campaign` e tendencia confirmada em `7d` e `14d`.
4. Amostra minima: `clicks >= 25`, `conversions >= 3`.
5. Formula ou logica: comparar `cpa_hour` nas duas janelas contra `cpa_campaign`.
6. Mensagem tecnica: `O horario [HH] opera com CPA significativamente melhor que a media da campanha e se repete em mais de uma janela.`
7. Mensagem executiva para cliente: `Temos um horario com custo por resultado melhor do que o restante da campanha.`
8. Prioridade sugerida: `medium`
9. Risco da acao: `low`
10. Dados necessarios: `fact_google_ads_campaign_hourly`, comparativos `7d` e `14d`.

### 2.7 `HOUR_UNDERFUNDED_WINNER`

1. Nome da regra: `HOUR_UNDERFUNDED_WINNER`
2. Objetivo: apontar horarios vencedores que recebem menos verba do que deveriam.
3. Condicoes de disparo: horario com `conv_share` ou `value_share` pelo menos `10 p.p.` acima de `spend_share`.
4. Amostra minima: `conversions >= 3` ou `conversions_value > 0`, `spend >= 50`.
5. Formula ou logica: disparar se `value_share - spend_share >= 0.10` ou `conv_share - spend_share >= 0.10`.
6. Mensagem tecnica: `O horario [HH] entrega participacao de resultado superior a participacao de gasto.`
7. Mensagem executiva para cliente: `Esse horario esta aproveitando melhor o investimento do que o restante do dia.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_hourly`, totais da campanha.

### 2.8 `HOUR_PERSISTENT_LOSER`

1. Nome da regra: `HOUR_PERSISTENT_LOSER`
2. Objetivo: reforcar acao quando um horario ruim persiste em mais de uma janela.
3. Condicoes de disparo: horario ruim em `7d` e `14d` para `cpa` ou `roas`.
4. Amostra minima: `clicks >= 25`, `spend >= 50`.
5. Formula ou logica: disparar se `cpa_hour >= 1.5 * cpa_campaign` nas duas janelas ou `roas_hour <= 0.7 * roas_campaign` nas duas janelas.
6. Mensagem tecnica: `O horario [HH] apresenta ineficiencia recorrente, sem sinal de recuperacao recente.`
7. Mensagem executiva para cliente: `Esse horario nao esta performando mal apenas por oscilacao; o problema esta se repetindo.`
8. Prioridade sugerida: `high`
9. Risco da acao: `low`
10. Dados necessarios: `fact_google_ads_campaign_hourly`, comparativos `7d` e `14d`.

### 2.9 `HOUR_WINNER_CLUSTER`

1. Nome da regra: `HOUR_WINNER_CLUSTER`
2. Objetivo: identificar blocos consecutivos de alta eficiencia para simplificar ajuste de programacao.
3. Condicoes de disparo: pelo menos `3` horas consecutivas com `roas >= 1.3 * roas_campaign` ou `cpa <= 0.75 * cpa_campaign`.
4. Amostra minima: `clicks >= 40` no bloco e `conversions >= 4`.
5. Formula ou logica: agrupar horas consecutivas vencedoras e emitir um insight unico para o bloco.
6. Mensagem tecnica: `O bloco [HH-HH] apresenta eficiencia superior de forma continua, o que justifica concentracao de entrega.`
7. Mensagem executiva para cliente: `Existe uma faixa do dia claramente mais forte para investir.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_hourly`, agregacao por faixa consecutiva.

### 2.10 `HOUR_LOW_QUALITY_EXPANSION`

1. Nome da regra: `HOUR_LOW_QUALITY_EXPANSION`
2. Objetivo: detectar horarios em que o alcance cresceu, mas a qualidade caiu.
3. Condicoes de disparo: `impressions_hour` crescem acima de `20%` vs baseline, `ctr_hour` cai acima de `15%` e `cvr_hour` cai acima de `20%`.
4. Amostra minima: `impressions >= 1000`, `clicks >= 25`.
5. Formula ou logica: comparar horario atual vs mesmo horario na janela anterior ou contra media da campanha.
6. Mensagem tecnica: `O horario [HH] ampliou alcance, mas com piora simultanea de CTR e CVR.`
7. Mensagem executiva para cliente: `Nesse horario estamos aparecendo mais, mas atraindo trafego de menor qualidade.`
8. Prioridade sugerida: `medium`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_hourly`, comparativo por periodo.

## 3. Regras de regiao

### 3.1 `GEO_WASTE_ZERO_CONV`

1. Nome da regra: `GEO_WASTE_ZERO_CONV`
2. Objetivo: encontrar regioes que gastam e nao convertem.
3. Condicoes de disparo: `conversions = 0`, `cost >= max(target_cpa * 1.5, 100)` e gasto relevante no periodo.
4. Amostra minima: `clicks >= 25`, `spend >= 100`.
5. Formula ou logica: disparar se a regiao consome verba acima do limite sem gerar conversao.
6. Mensagem tecnica: `A regiao [REGIAO] acumulou gasto relevante sem conversoes no periodo analisado.`
7. Mensagem executiva para cliente: `Estamos investindo em uma regiao que ainda nao esta trazendo resultado.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, `client_kpi_targets`, totais da campanha.

### 3.2 `GEO_CPA_ABOVE_ACCOUNT`

1. Nome da regra: `GEO_CPA_ABOVE_ACCOUNT`
2. Objetivo: destacar regioes com CPA muito acima da media da conta.
3. Condicoes de disparo: `cpa_geo >= 1.7 * cpa_account` e o gap persiste em `7d` ou `14d`.
4. Amostra minima: `clicks >= 25`, `conversions >= 2`, `spend >= 80`.
5. Formula ou logica: comparar o `cpa` da regiao com o `cpa` total da conta no mesmo periodo.
6. Mensagem tecnica: `A regiao [REGIAO] opera com CPA substancialmente acima da media da conta.`
7. Mensagem executiva para cliente: `Essa regiao custa bem mais caro por resultado do que a media da conta.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, `fact_google_ads_account_daily`.

### 3.3 `GEO_ROAS_BELOW_TARGET`

1. Nome da regra: `GEO_ROAS_BELOW_TARGET`
2. Objetivo: identificar regioes que nao batem a meta de retorno.
3. Condicoes de disparo: `roas_geo < 0.7 * target_roas` e gasto relevante.
4. Amostra minima: `spend >= 100`, `conversions_value > 0` ou `conversions >= 2`.
5. Formula ou logica: comparar `roas_geo` com `target_roas`; se nao houver meta, usar `roas_account`.
6. Mensagem tecnica: `A regiao [REGIAO] esta abaixo da meta de ROAS e abaixo do retorno medio esperado.`
7. Mensagem executiva para cliente: `Essa regiao esta retornando menos do que o nivel que buscamos.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, `client_kpi_targets`, baseline da conta.

### 3.4 `GEO_CVR_BELOW_ACCOUNT`

1. Nome da regra: `GEO_CVR_BELOW_ACCOUNT`
2. Objetivo: apontar regioes com taxa de conversao muito inferior.
3. Condicoes de disparo: `cvr_geo <= 0.6 * cvr_account` e `ctr_geo` nao esta muito abaixo.
4. Amostra minima: `clicks >= 30`, `conversions_total_account >= 5`.
5. Formula ou logica: se o clique acontece, mas a conversao pos-clique desaba, a regiao merece revisao.
6. Mensagem tecnica: `A regiao [REGIAO] recebe clique, mas converte muito abaixo da media da conta.`
7. Mensagem executiva para cliente: `Nessa regiao o trafego chega, mas vira resultado com menos eficiencia.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, baseline da conta.

### 3.5 `GEO_GOOD_CTR_BAD_POSTCLICK`

1. Nome da regra: `GEO_GOOD_CTR_BAD_POSTCLICK`
2. Objetivo: separar problema de clique de problema apos o clique.
3. Condicoes de disparo: `ctr_geo >= 0.9 * ctr_account` e `cvr_geo <= 0.6 * cvr_account`.
4. Amostra minima: `impressions >= 1000`, `clicks >= 30`.
5. Formula ou logica: a regiao atrai clique em nivel saudavel, mas nao entrega conversao proporcional.
6. Mensagem tecnica: `A regiao [REGIAO] nao mostra problema de atratividade do anuncio, mas sim de eficiencia apos o clique.`
7. Mensagem executiva para cliente: `Essa regiao clica bem, mas o retorno depois do clique esta fraco.`
8. Prioridade sugerida: `medium`
9. Risco da acao: `medium`, porque a correcao pode envolver oferta, pagina ou cobertura comercial.
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, baseline de `ctr` e `cvr` da conta.

### 3.6 `GEO_HIGH_CPC_LOW_RETURN`

1. Nome da regra: `GEO_HIGH_CPC_LOW_RETURN`
2. Objetivo: detectar regioes caras no leilao sem retorno proporcional.
3. Condicoes de disparo: `cpc_geo >= 1.25 * cpc_account` e `roas_geo <= roas_account` ou `conversions <= 1`.
4. Amostra minima: `clicks >= 25`, `spend >= 80`.
5. Formula ou logica: comparar `cpc_geo` com `cpc_account` e validar que o retorno nao compensou o custo.
6. Mensagem tecnica: `A regiao [REGIAO] esta pagando mais por clique sem gerar retorno compativel.`
7. Mensagem executiva para cliente: `Nessa regiao o clique esta caro e o retorno nao acompanha.`
8. Prioridade sugerida: `medium`
9. Risco da acao: `low`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, baseline da conta.

### 3.7 `GEO_WINNER_SCALE`

1. Nome da regra: `GEO_WINNER_SCALE`
2. Objetivo: identificar regioes que merecem mais investimento.
3. Condicoes de disparo: `cpa_geo <= 0.7 * target_cpa` ou `roas_geo >= 1.3 * target_roas`, com resultado recorrente.
4. Amostra minima: `clicks >= 25`, `conversions >= 3`, `spend >= 80`.
5. Formula ou logica: disparar se a regiao supera meta e ainda recebe menos `spend_share` do que `conv_share` ou `value_share`.
6. Mensagem tecnica: `A regiao [REGIAO] entrega eficiencia acima da meta e parece subalocada no mix atual.`
7. Mensagem executiva para cliente: `Ha uma regiao com retorno melhor que a media que pode receber mais foco.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, metas, totais de campanha/conta.

### 3.8 `GEO_BUDGET_OVERWEIGHT`

1. Nome da regra: `GEO_BUDGET_OVERWEIGHT`
2. Objetivo: detectar regioes com peso de gasto acima do peso de resultado.
3. Condicoes de disparo: `spend_share - conv_share >= 0.10` ou `spend_share - value_share >= 0.10`.
4. Amostra minima: `spend >= 100`, `clicks >= 25`.
5. Formula ou logica: medir desbalanceamento de mix; a regiao recebe verba demais para o retorno que entrega.
6. Mensagem tecnica: `A regiao [REGIAO] absorve parcela de gasto superior a sua participacao em conversoes ou valor.`
7. Mensagem executiva para cliente: `Estamos colocando peso demais nessa regiao para o resultado que ela devolve.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, totais da campanha/conta.

### 3.9 `GEO_PERSISTENT_LOSER`

1. Nome da regra: `GEO_PERSISTENT_LOSER`
2. Objetivo: reforcar acao quando a regiao ruim se repete em mais de uma janela.
3. Condicoes de disparo: regiao ruim em `7d` e `14d` para `cpa`, `roas` ou `cvr`.
4. Amostra minima: `clicks >= 25`, `spend >= 80`.
5. Formula ou logica: disparar se `cpa_geo >= 1.5 * cpa_account` nas duas janelas ou `roas_geo <= 0.7 * roas_account` nas duas janelas.
6. Mensagem tecnica: `A regiao [REGIAO] mostra perda recorrente de eficiencia, sem sinal de recuperacao no curto prazo.`
7. Mensagem executiva para cliente: `O desempenho ruim dessa regiao nao parece ser oscilacao temporaria.`
8. Prioridade sugerida: `high`
9. Risco da acao: `low`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, comparativos `7d` e `14d`.

### 3.10 `GEO_ISOLATED_DROP`

1. Nome da regra: `GEO_ISOLATED_DROP`
2. Objetivo: identificar deterioracao localizada, em vez de problema geral da conta.
3. Condicoes de disparo: uma regiao cai mais de `30%` em `cvr` ou `roas`, enquanto o restante da conta fica estavel dentro de `10%`.
4. Amostra minima: `clicks >= 25`, `spend >= 80`.
5. Formula ou logica: comparar a regiao contra `rest_of_account` na mesma janela.
6. Mensagem tecnica: `A piora esta concentrada na regiao [REGIAO], enquanto o restante da conta se manteve estavel.`
7. Mensagem executiva para cliente: `O problema parece localizado nessa regiao, e nao no conjunto inteiro da operacao.`
8. Prioridade sugerida: `medium`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_geo_daily`, agregacao da conta sem a regiao afetada.

## 4. Regras de dispositivo

### 4.1 `DEVICE_CLICK_HEAVY_NO_CONV`

1. Nome da regra: `DEVICE_CLICK_HEAVY_NO_CONV`
2. Objetivo: detectar dispositivo que gera clique, consome verba e nao converte.
3. Condicoes de disparo: `conversions = 0`, `spend_share >= 15%` e clique alto.
4. Amostra minima: `clicks >= 40`, `spend >= 80`.
5. Formula ou logica: disparar se o dispositivo recebe fatia material do gasto sem nenhuma conversao.
6. Mensagem tecnica: `O dispositivo [DEVICE] concentra clique e gasto, mas nao gerou conversoes na janela analisada.`
7. Mensagem executiva para cliente: `Estamos investindo em um tipo de acesso que ainda nao esta trazendo resultado.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, totais da campanha/conta.

### 4.2 `DEVICE_CPA_ABOVE_ACCOUNT`

1. Nome da regra: `DEVICE_CPA_ABOVE_ACCOUNT`
2. Objetivo: identificar dispositivo com CPA muito acima da conta.
3. Condicoes de disparo: `cpa_device >= 1.6 * cpa_account`.
4. Amostra minima: `clicks >= 30`, `conversions >= 2`, `spend >= 80`.
5. Formula ou logica: comparar `cpa_device` contra `cpa_account` na mesma janela.
6. Mensagem tecnica: `O dispositivo [DEVICE] esta convertendo com CPA muito acima da media da conta.`
7. Mensagem executiva para cliente: `Esse tipo de acesso esta ficando bem mais caro por resultado do que a media.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, `fact_google_ads_account_daily`.

### 4.3 `DEVICE_CVR_BELOW_ACCOUNT`

1. Nome da regra: `DEVICE_CVR_BELOW_ACCOUNT`
2. Objetivo: apontar dispositivo com baixa eficiencia apos o clique.
3. Condicoes de disparo: `cvr_device <= 0.6 * cvr_account` com trafego significativo.
4. Amostra minima: `clicks >= 40`, `conversions_total_account >= 5`.
5. Formula ou logica: se o dispositivo recebe clique, mas converte muito abaixo da conta, ha evidencia de baixa eficiencia pos-clique.
6. Mensagem tecnica: `O dispositivo [DEVICE] mantem volume de clique, mas converte muito abaixo da media da conta.`
7. Mensagem executiva para cliente: `Nesse tipo de acesso o usuario chega, mas fecha menos.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, baseline da conta.

### 4.4 `DEVICE_CPC_UP_CVR_DOWN`

1. Nome da regra: `DEVICE_CPC_UP_CVR_DOWN`
2. Objetivo: detectar dupla piora de custo e conversao em um dispositivo.
3. Condicoes de disparo: `cpc_device` sobe acima de `20%` e `cvr_device` cai acima de `20%` vs baseline.
4. Amostra minima: `clicks >= 40`, `spend >= 80`.
5. Formula ou logica: comparar dispositivo atual vs mesmo dispositivo na janela anterior.
6. Mensagem tecnica: `O dispositivo [DEVICE] ficou mais caro por clique e piorou em taxa de conversao ao mesmo tempo.`
7. Mensagem executiva para cliente: `Esse tipo de acesso esta ficando mais caro e entregando menos resultado.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, comparativo `7d` ou `14d`.

### 4.5 `DEVICE_MOBILE_WASTE`

1. Nome da regra: `DEVICE_MOBILE_WASTE`
2. Objetivo: detectar quando mobile esta puxando a conta para baixo.
3. Condicoes de disparo: `device = mobile`, `spend_share >= 40%` e `roas_mobile <= 0.7 * roas_account` ou `cpa_mobile >= 1.5 * cpa_account`.
4. Amostra minima: `clicks >= 50`, `conversions >= 3`, `spend >= 100`.
5. Formula ou logica: medir peso do mobile no gasto e comparar sua eficiencia com a conta.
6. Mensagem tecnica: `Mobile absorve parcela relevante do investimento com retorno inferior ao padrao da conta.`
7. Mensagem executiva para cliente: `Hoje estamos colocando verba demais no celular para o retorno que ele traz.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, `fact_google_ads_account_daily`.

### 4.6 `DEVICE_DESKTOP_WINNER_SCALE`

1. Nome da regra: `DEVICE_DESKTOP_WINNER_SCALE`
2. Objetivo: identificar dispositivo vencedor com espaco para receber mais verba.
3. Condicoes de disparo: `device = desktop` ou outro dispositivo vencedor, `roas_device >= 1.3 * roas_account` ou `cpa_device <= 0.7 * cpa_account`, com `spend_share < value_share`.
4. Amostra minima: `clicks >= 30`, `conversions >= 3`, `spend >= 80`.
5. Formula ou logica: comparar eficiencia do dispositivo e verificar se ele esta subalocado.
6. Mensagem tecnica: `O dispositivo [DEVICE] entrega retorno superior e participa menos do gasto do que do valor gerado.`
7. Mensagem executiva para cliente: `Esse tipo de acesso esta respondendo melhor e pode receber mais foco.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, totais da conta/campanha.

### 4.7 `DEVICE_TABLET_LEAK`

1. Nome da regra: `DEVICE_TABLET_LEAK`
2. Objetivo: encontrar vazamento tipico em tablet ou dispositivo secundario.
3. Condicoes de disparo: `device = tablet` ou `other`, `clicks >= 25`, `conversions <= 1` e `spend >= 50`.
4. Amostra minima: `clicks >= 25`, `spend >= 50`.
5. Formula ou logica: focar dispositivos secundarios que geram custo sem retorno proporcional.
6. Mensagem tecnica: `O dispositivo [DEVICE] apresenta baixa eficiencia e parece funcionar como vazamento de verba.`
7. Mensagem executiva para cliente: `Existe um tipo de acesso menor que esta consumindo verba sem devolver resultado suficiente.`
8. Prioridade sugerida: `medium`
9. Risco da acao: `low`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`.

### 4.8 `DEVICE_MIX_SHIFT_DEGRADATION`

1. Nome da regra: `DEVICE_MIX_SHIFT_DEGRADATION`
2. Objetivo: explicar piora da conta por mudanca de distribuicao entre dispositivos.
3. Condicoes de disparo: um dispositivo ganha pelo menos `15 p.p.` de `spend_share` e ele performa pior que a media anterior.
4. Amostra minima: `spend_total >= 200`, `clicks_total >= 100`, `conversions_total >= 5`.
5. Formula ou logica: disparar se a conta piora em CPA/ROAS e a piora coincide com aumento de participacao do dispositivo mais fraco.
6. Mensagem tecnica: `A piora global parece ter sido puxada por mudanca de mix para [DEVICE], que recebeu mais verba sem sustentar a mesma eficiencia.`
7. Mensagem executiva para cliente: `Parte da piora veio porque deslocamos mais investimento para um tipo de acesso menos eficiente.`
8. Prioridade sugerida: `high`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, comparacao de mix por periodo, baseline da conta.

### 4.9 `DEVICE_GOOD_CTR_BAD_POSTCLICK`

1. Nome da regra: `DEVICE_GOOD_CTR_BAD_POSTCLICK`
2. Objetivo: sugerir revisao de experiencia quando o clique vai bem, mas a conversao nao acompanha.
3. Condicoes de disparo: `ctr_device >= ctr_account` e `cvr_device <= 0.6 * cvr_account`.
4. Amostra minima: `impressions >= 1000`, `clicks >= 40`.
5. Formula ou logica: o anuncio funciona para gerar clique no dispositivo, mas o problema aparece depois do clique.
6. Mensagem tecnica: `O dispositivo [DEVICE] nao mostra fraqueza de CTR, mas sim baixa eficiencia apos o clique, o que sugere revisar experiencia, pagina ou oferta.`
7. Mensagem executiva para cliente: `Esse tipo de acesso desperta interesse, mas esta convertendo mal depois que a pessoa entra.`
8. Prioridade sugerida: `medium`
9. Risco da acao: `medium`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, baseline de `ctr` e `cvr`.

### 4.10 `DEVICE_STABLE_WINNER`

1. Nome da regra: `DEVICE_STABLE_WINNER`
2. Objetivo: reforcar redistribuicao para dispositivo vencedor recorrente.
3. Condicoes de disparo: o mesmo dispositivo supera a media em `7d` e `14d` para `cpa` ou `roas`.
4. Amostra minima: `clicks >= 30`, `conversions >= 3`, `spend >= 80`.
5. Formula ou logica: disparar se `cpa_device <= 0.75 * cpa_account` nas duas janelas ou `roas_device >= 1.25 * roas_account` nas duas janelas.
6. Mensagem tecnica: `O dispositivo [DEVICE] e vencedor recorrente nas janelas curta e intermediaria, o que fortalece a recomendacao de redistribuicao de verba.`
7. Mensagem executiva para cliente: `Esse tipo de acesso nao foi bem so por acaso; ele vem entregando melhor de forma consistente.`
8. Prioridade sugerida: `high`
9. Risco da acao: `low`
10. Dados necessarios: `fact_google_ads_campaign_device_daily`, comparativos `7d` e `14d`.

## 5. Recomendacao de implementacao

### MVP

- versionar cada regra com `rule_code`
- persistir `thresholds` no proprio codigo ou em configuracao interna
- gravar em `evidence_json`:
  - metricas atuais
  - baseline
  - deltas
  - janela
  - motivo do disparo

### Recomendado

- permitir override por tenant para limites como `target_cpa`, `target_roas` e cortes minimos
- rebaixar confianca automaticamente quando:
  - periodo inclui hoje
  - sync esta parcial
  - amostra esta no limite minimo
