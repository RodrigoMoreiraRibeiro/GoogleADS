# Google Ads SaaS

Plataforma SaaS multi-tenant para agências e gestores de tráfego pago que centraliza dados do Google Ads, sincroniza métricas para banco próprio, gera dashboards local-first, produz insights explicáveis e cria relatórios executivos para clientes.

Este repositório está público para facilitar análise técnica do código e colaboração arquitetural. Os testes com credenciais reais do Google Ads continuam sendo feitos apenas em ambiente local e privado.

## Status do projeto

O projeto está em fase de estruturação e validação técnica do MVP.

Já existe base funcional para:

- backend `NestJS + Fastify + TypeScript`
- frontend `React + Vite + TypeScript`
- modelagem inicial multi-tenant
- painel admin local para configuração segura da plataforma
- seed local de demonstração com dados simulados
- dashboards lendo apenas do banco local
- agente inicial de otimização com regras determinísticas
- geração programática de apresentação comercial em `.pptx`

Ainda não está pronto para produção.

## Princípios do produto

- `multi-tenant real`: isolamento por tenant desde a modelagem
- `local-first`: a UI não depende da Google Ads API em tempo real
- `security-first`: segredos nunca vão para o frontend
- `jobs-first`: coleta, agregação, insights e relatórios rodam de forma assíncrona
- `explainable analytics`: recomendações precisam de evidências, prioridade e confiança

## Stack atual

- `apps/api`: NestJS, Fastify, Prisma, TypeScript
- `apps/web`: React, Vite, TypeScript, TanStack Query
- `packages/shared`: contratos e tipos compartilhados
- `database`: schema SQL inicial
- `docs`: PRD, arquitetura, segurança, modelagem, ingestão, analytics e relatórios

## Estrutura do monorepo

```text
apps/
  api/
  web/
packages/
  shared/
database/
docs/
scripts/
```

## Como rodar localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar ambiente local

Use o arquivo de exemplo:

```bash
cp .env.example .env
```

Preencha apenas valores locais e seguros para desenvolvimento.

### 3. Gerar o Prisma Client

```bash
npx prisma generate --schema apps/api/prisma/schema.prisma
```

### 4. Subir a API

```bash
npm run dev:api:plain
```

### 5. Subir o frontend

```bash
npm run dev:web
```

### 6. Acessar a aplicação

- Frontend: `http://localhost:5173`
- Dashboard local: `http://localhost:5173/dashboard`
- Painel admin local: `http://localhost:5173/admin/settings`
- Healthcheck da API: `http://localhost:3000/api/health`

## Seed local de demonstração

O projeto inclui endpoints locais de demonstração para popular o banco com tenants, clientes, contas, campanhas, insights e relatórios simulados.

Depois de subir API e frontend, acesse o dashboard e use o botão `Popular base local`.

Ou chame manualmente:

```bash
POST /api/analytics/local-demo/seed
GET /api/analytics/local-demo/workspace?period=last_7d
```

Esses endpoints existem apenas para `development`.

## Segurança e publicação

Este repositório **não** deve conter:

- `tokens`
- `refresh tokens`
- `client secrets`
- `developer tokens`
- variáveis reais de ambiente
- logs locais
- arquivos de `storage/`

Por isso, arquivos locais e sensíveis ficam fora do versionamento via `.gitignore`.

## Testes com Google Ads API

As integrações reais com Google Ads não estão configuradas neste repositório público.

Regras atuais:

- credenciais reais ficam apenas em ambiente local privado
- segredos nunca são enviados ao frontend
- testes com OAuth e sync real são feitos fora do repositório público

## Scripts úteis

```bash
npm run dev:api
npm run dev:api:plain
npm run dev:web
npm run build
npm run typecheck
npm run generate:pitch:pptx
```

## Documentação principal

- [PRD do produto](./docs/prd-saas-google-ads.md)
- [Arquitetura](./docs/arquitetura-saas-google-ads.md)
- [Modelagem de banco](./docs/modelagem-banco-google-ads.md)
- [Segurança](./docs/autenticacao-autorizacao-seguranca.md)
- [Ingestão Google Ads](./docs/modulo-ingestao-google-ads.md)
- [Motor analítico](./docs/motor-analitico-google-ads.md)
- [Dashboards local-first](./docs/dashboards-local-first.md)
- [Slides executivos](./docs/modulo-slides-executivos.md)

## Observações importantes

- O projeto ainda possui módulos em evolução e partes mockadas para validação local.
- O painel admin atual existe para teste local e ainda precisa de autenticação forte antes de qualquer uso produtivo.
- O agente de otimização atual é assistivo: ele recomenda, mas não executa mudanças automáticas em campanhas.

## Objetivo deste repositório público

Permitir que outras IAs, desenvolvedores e revisores técnicos entendam a arquitetura, o código e a evolução do produto sem acesso a qualquer segredo operacional.
