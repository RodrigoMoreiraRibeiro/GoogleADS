# Estrategia de Geracao de Apresentacoes

Data de referencia: 2026-04-06

## 1. Recomendacao objetiva

### Melhor opcao para MVP

- `HTML/CSS -> PDF`

### Melhor opcao para longo prazo

- `deck JSON canonico + dois renderers`
- `HTML/CSS -> PDF` como saida padrao
- `PPTX programatico` como saida adicional para clientes/agencias que precisem editar a apresentacao

### Motivo

- o PDF gerado a partir de HTML/CSS entrega melhor estetica, mais rapidez de iteracao e menos esforco de layout
- o PPTX e melhor quando o cliente ou a agencia precisa editar manualmente o arquivo
- manter um `deck JSON` como fonte unica evita duplicar logica de negocio nos dois formatos

## 2. Comparacao das abordagens

## 2.1 HTML/CSS e exportacao para PDF

### Vantagens

- melhor fidelidade visual no MVP
- mais facil criar visual profissional
- aproveita habilidades e componentes web
- mais facil revisar no navegador antes de exportar
- muito bom para tipografia, espacamento e identidade visual

### Desvantagens

- depende de navegador headless no servidor
- exige cuidado com `print CSS`, quebra de pagina e fontes
- PDF e pouco editavel pelo cliente

### Melhor uso

- apresentacao mensal e semanal automatica
- cliente final leigo
- foco em visual bonito e consistencia

## 2.2 PPTX programatico

### Vantagens

- entrega arquivo nativo editavel
- bom para agencias que ajustam slides manualmente
- nao depende de exportar HTML no runtime

### Desvantagens

- mais trabalhoso para ficar bonito
- layout e tipografia sao mais rigidos
- coordenadas e alinhamentos manuais aumentam manutencao
- mais facil ficar com cara de slide "programatico"

### Melhor uso

- decks premium
- clientes que pedem arquivo editavel
- operacao madura com templates mais estabilizados

## 3. Recomendacao final por fase

### MVP

- gerar `ExecutiveDeck` em JSON
- renderizar HTML com template
- exportar PDF
- armazenar HTML de debug opcionalmente

### Fase 2

- manter o mesmo `ExecutiveDeck`
- adicionar renderer `PPTX`
- permitir selecao de formato por tenant ou template

## 4. Bibliotecas recomendadas em Node.js/TypeScript

### Para HTML/CSS -> PDF

- `Handlebars`
- `Puppeteer`

### Alternativa para HTML/CSS -> PDF

- `Playwright`

### Para PPTX

- `PptxGenJS`

### Minha recomendacao pratica

- `Handlebars + Puppeteer` no MVP
- `PptxGenJS` depois, como segundo renderer

### Motivo das escolhas

- `Handlebars` e simples para templates server-side
- `Puppeteer` gera PDF a partir de pagina HTML
- `PptxGenJS` e a opcao mais madura em Node/TypeScript para gerar `.pptx`

## 5. Vantagens e desvantagens resumidas

### HTML/PDF

- melhor visual: sim
- editavel pelo cliente: nao
- manutencao: baixa a media
- dependencia de browser: sim
- velocidade de iteracao: alta

### PPTX

- melhor visual: medio
- editavel pelo cliente: sim
- manutencao: media a alta
- dependencia de browser: nao
- velocidade de iteracao: media

## 6. Problemas comuns

### HTML/PDF

- fontes diferentes no servidor
- quebra de pagina ruim
- elementos cortados no fim da pagina
- grafico carregando tarde demais antes da captura
- dependencia de Chromium no VPS

### PPTX

- muito ajuste manual de `x/y/w/h`
- overflow de texto
- diferenca visual entre PowerPoint, Google Slides e Keynote
- graficos e tabelas grandes ficando "duros"
- mais dificil manter design sofisticado

## 7. Pipeline recomendado

### Pipeline base

1. gerar `ExecutiveDeck` JSON a partir de KPIs, comparativos e insights
2. selecionar `template_code` e `template_version`
3. aplicar branding do tenant/agencia/cliente
4. renderizar saida
5. validar slide count, campos obrigatorios e tamanho de texto
6. exportar arquivo final
7. armazenar metadados e artefato
8. registrar auditoria

### Renderer de MVP

1. `ExecutiveDeckBuilder`
2. `HandlebarsTemplateRenderer`
3. `PuppeteerPdfRenderer`
4. `StorageWriter`

### Renderer de longo prazo

1. `ExecutiveDeckBuilder`
2. `PptxDeckRenderer`
3. `StorageWriter`

## 8. Como armazenar templates

### Recomendacao

Separar em 3 camadas:

- `base template`
- `brand theme`
- `client override`

### Estrutura pratica

- layout base em arquivo no repositorio
- tokens visuais em JSON
- logos e imagens em storage privado

### Exemplo de estrutura

```text
apps/api/src/modules/reports/domain/templates/
  monthly/
    base-v1/
      template.hbs
      print.css
      manifest.json
  weekly/
    base-v1/
      template.hbs
      print.css
      manifest.json
```

### O que colocar no `manifest.json`

- `template_code`
- `template_version`
- `report_type`
- `supported_audiences`
- `max_slides`
- `theme_slots`
- `renderer_type`

## 9. Como versionar templates por agencia ou cliente

### Regra principal

Nao copiar templates inteiros por cliente sem necessidade.

### Estrategia recomendada

- `template base global`
- `agency theme override`
- `client content/branding override`

### O que variar por agencia

- logo
- paleta
- tipografia
- tom de texto
- ordem opcional de algumas secoes

### O que variar por cliente

- logo do cliente
- nome comercial
- observacoes de linguagem
- metrica principal de negocio

### Como versionar

- `template_code = monthly_exec`
- `template_version = 1.0.0`
- `theme_version = agencia-x@1.2.0`
- `client_override_version = cliente-y@1.0.1`

### O que persistir em `executive_reports`

- `template_code`
- `template_version`
- `renderer_type`
- `payload_hash`
- `storage_path`
- `summary_json`

## 10. Recomendacao operacional para Hostinger

### Se quiser simplicidade maxima

- use VPS
- gere HTML e PDF no backend
- nao tente editar PPTX no MVP

### Motivo

- browser headless e fontes ficam sob seu controle
- deploy continua simples
- o resultado visual tende a ficar melhor mais cedo

## 11. Decisao final

### Melhor opcao para MVP

- `Handlebars + Puppeteer + PDF`

### Melhor opcao para longo prazo

- `ExecutiveDeck JSON + HTML/PDF como default + PptxGenJS como renderer adicional`

### O que eu nao recomendo

- começar direto com PPTX como unico formato

### Motivo

- voce vai gastar mais tempo brigando com layout do que entregando apresentacoes boas
