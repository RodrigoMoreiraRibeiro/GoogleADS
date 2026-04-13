Gere a narrativa do insight a partir do payload abaixo.

Objetivo:
- explicar o problema ou oportunidade
- manter disciplina causal
- produzir saida JSON valida no schema informado

Payload:
{{INSIGHT_NARRATIVE_PAYLOAD_JSON}}

Regras de reforco:
- use somente `allowedHypotheses`
- use somente `allowedActions`
- se houver `dataGaps`, reflita isso em `dataLimitations`
- use numeros apenas quando eles existirem no payload
- prefira `probable` ou `correlated_only` a afirmar causalidade sem prova
- mantenha `technicalOutput.explanation` em ate {{TECHNICAL_MAX_SENTENCES}} frases
- mantenha `executiveOutput.explanation` em ate {{EXECUTIVE_MAX_SENTENCES}} frases
