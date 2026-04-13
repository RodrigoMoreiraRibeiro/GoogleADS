# Estrutura Inicial do Projeto - Node.js + TypeScript

Data de referencia: 2026-04-06

## 1. Estrutura de pastas

```text
GoogleADS/
├─ apps/
│  ├─ api/
│  │  ├─ prisma/
│  │  └─ src/
│  │     ├─ bootstrap/
│  │     ├─ common/
│  │     │  ├─ config/
│  │     │  ├─ errors/
│  │     │  ├─ guards/
│  │     │  ├─ http/
│  │     │  └─ logging/
│  │     └─ modules/
│  │        ├─ auth/
│  │        ├─ tenancy/
│  │        ├─ users/
│  │        ├─ clients/
│  │        ├─ google-ads/
│  │        ├─ sync/
│  │        ├─ analytics/
│  │        ├─ insights/
│  │        ├─ reports/
│  │        ├─ audit/
│  │        └─ health/
│  └─ web/
│     ├─ public/
│     └─ src/
│        ├─ app/
│        │  ├─ providers/
│        │  └─ router/
│        ├─ assets/
│        ├─ modules/
│        │  ├─ auth/
│        │  ├─ dashboard/
│        │  ├─ clients/
│        │  ├─ google-ads/
│        │  └─ reports/
│        └─ shared/
│           ├─ api/
│           ├─ components/
│           ├─ config/
│           ├─ hooks/
│           ├─ layouts/
│           ├─ lib/
│           └─ styles/
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ constants/
│        ├─ contracts/
│        └─ types/
├─ database/
├─ docs/
├─ package.json
└─ tsconfig.base.json
```

## 2. Modulos do backend

### `auth`

Responsabilidade:

- login
- logout
- MFA
- sessao server-side
- reset de senha
- support mode do superadmin

### `tenancy`

Responsabilidade:

- resolver tenant
- validar membership
- validar client scope
- impedir vazamento entre tenants

### `users`

Responsabilidade:

- usuarios
- convites
- memberships
- papeis

### `clients`

Responsabilidade:

- clientes da agencia
- metas
- atribuicao de gestores
- configuracoes de relatorio

### `google-ads`

Responsabilidade:

- OAuth Google Ads
- conexoes
- contas Google Ads
- refresh token criptografado
- descoberta de contas

### `sync`

Responsabilidade:

- jobs agendados
- cursores
- backfill
- ingestao incremental
- retries

### `analytics`

Responsabilidade:

- leitura de fatos e agregados
- scorecards
- comparativos
- consultas para dashboard

### `insights`

Responsabilidade:

- regras de diagnostico
- confianca
- recomendacoes
- explicacao executiva

### `reports`

Responsabilidade:

- gerar PPTX/PDF/HTML
- templates
- historico de relatorios

### `audit`

Responsabilidade:

- trilha de auditoria
- security events
- export logs

### `health`

Responsabilidade:

- health checks
- readiness
- liveness

## 3. Modulos do frontend

### `auth`

- login
- MFA
- selecao de tenant

### `dashboard`

- visao consolidada
- KPIs
- graficos
- cards de insight

### `clients`

- dados do cliente
- metas
- filtros
- escopo de acesso

### `google-ads`

- conectar conta
- status da integracao
- contas conectadas
- ultimos syncs

### `reports`

- lista de relatorios
- gerar apresentacao
- download

## 4. Convencoes de nomenclatura

### Pastas

- `kebab-case`
- exemplos:
  - `google-ads`
  - `client-access`

### Arquivos TypeScript

- `kebab-case`
- exemplos:
  - `auth.module.ts`
  - `tenant-context.guard.ts`
  - `create-client.use-case.ts`

### Classes

- `PascalCase`
- exemplos:
  - `AuthModule`
  - `TenantContextGuard`
  - `CreateClientUseCase`

### Interfaces e types

- `PascalCase`
- sem prefixo `I`
- exemplos:
  - `TenantContext`
  - `AuthenticatedUser`

### Funcoes

- `camelCase`
- exemplos:
  - `getApiEnvironment`
  - `buildTenantQuery`

### Constantes

- `UPPER_SNAKE_CASE` quando forem globais/imutaveis
- exemplos:
  - `TENANT_ROLES`
  - `PLATFORM_ROLES`

## 5. Configuracao de ambiente

### Arquivo base

- usar `.env` local baseado em `.env.example`

### Regras

- validar tudo na inicializacao
- falhar o bootstrap se faltarem variaveis obrigatorias
- nunca acessar `process.env` direto dentro de regra de negocio

### Separacao

- variaveis do backend no `apps/api`
- variaveis do frontend apenas com prefixo `VITE_`

## 6. Arquivos principais

### Raiz

- `package.json`: workspaces e scripts globais
- `tsconfig.base.json`: regras strict comuns
- `.env.example`: contrato minimo do ambiente
- `README.md`: onboarding rapido

### Backend

- `src/bootstrap/main.ts`: bootstrap do servidor
- `src/app.module.ts`: composicao de modulos
- `src/common/config/environment.ts`: schema e parse de ambiente
- `prisma/schema.prisma`: datasource e client

### Frontend

- `src/main.tsx`: entrada React
- `src/app/providers/app-providers.tsx`: providers globais
- `src/app/router/app-router.tsx`: rotas
- `src/shared/config/env.ts`: parse do ambiente web

### Shared

- `packages/shared/src/index.ts`: exports compartilhados

## 7. Responsabilidades de cada camada

## 7.1 Backend

### `domain`

Contem:

- entidades
- value objects
- regras invariantes
- interfaces de repositorio

Nao contem:

- ORM
- HTTP
- framework

### `application`

Contem:

- use cases
- orchestration
- DTOs internos
- servicos de aplicacao

Nao contem:

- detalhes de banco
- controller HTTP

### `infrastructure`

Contem:

- Prisma repositories
- clients externos
- criptografia
- storage
- fila

### `presentation`

Contem:

- controllers HTTP
- request/response DTOs
- guards
- serializers

## 7.2 Frontend

### `app`

- bootstrap da aplicacao
- providers
- router

### `modules`

- features de negocio
- telas
- hooks e chamadas de API por feature

### `shared`

- componentes reutilizaveis
- helper functions
- cliente HTTP
- config

## 8. Quando usar domain/application/infrastructure/presentation

### Recomendacao

Sim, faz sentido usar.

Motivo:

- o backend vai crescer muito
- multi-tenant e seguranca precisam de fronteiras claras
- Google Ads, jobs e relatorios vao aumentar o acoplamento se tudo ficar “flat”

### Regra pratica

- modulo pequeno pode nascer simples
- quando a regra de negocio crescer, ele ja tem lugar certo para evoluir

## 9. O que ja esta pronto nesta base

- monorepo com workspaces
- backend `NestJS + Fastify`
- frontend `React + Vite`
- shared package
- TypeScript estrito
- bootstrap seguro com cookie, CORS e helmet
- modulos base do backend
- rotas base do frontend
- schema Prisma inicial
- documentacao de arquitetura, banco e seguranca

## 10. Proximo passo recomendado

1. Implementar `auth` com sessao server-side.
2. Implementar `tenancy` com middleware/guard de tenant.
3. Traduzir o schema SQL inicial para Prisma.
4. Criar modulo `google-ads` com OAuth seguro.
5. Criar `sync` com jobs e scheduler.
