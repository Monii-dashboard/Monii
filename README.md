# Monii

Monii is a personal wealth aggregation dashboard. Its first job is to answer a
simple question: **what is the current value of everything I own across my
financial accounts?**

The project is currently a pre-MVP foundation. The application and database
still contain scaffold code; the product documents below define the direction
for the first implementation.

## Project context

- [Product definition](docs/product.md) explains the vision, V1 outcome,
  boundaries, and possible future directions.
- [Domain and engineering principles](docs/domain-and-engineering.md) explains
  the concepts and boundaries that should guide implementation without
  prescribing a database schema or heavyweight architecture.

These documents are the durable source of product context. Keep them aligned
when product decisions change.

## Current stack

- Next.js 16 and React 19
- TypeScript and Tailwind CSS 4
- PostgreSQL with Drizzle ORM
- GraphQL Yoga and TypeGraphQL, consumed through Apollo Client
- Vitest and Testcontainers
- Specific for development and infrastructure

Powens is planned as the first financial data source, but no Powens integration
has been implemented yet.

## Workspace structure

Monii is a source-first pnpm workspace. Runtime code follows one dependency
direction: the web and CLI applications compose server adapters, and server
adapters depend on the framework-independent application package.

```text
apps/
  web/          Next.js UI, route bootstraps, Apollo, and frontend GraphQL code
  cli/          One-shot operator and cron commands
packages/
  application/  Domain concepts, use cases, and ports
  server/       PostgreSQL, GraphQL, and provider/Node adapters
tests/          Cross-package integration tests and fixtures
```

Shared packages are private and export TypeScript source through explicit
package entry points. Next.js and `tsx` consume that source directly; there is
no separate package build step or monorepo orchestrator.

## Development

Use the `pnpm` version declared in `package.json` for package management and
scripts. Use Specific to run the application and its PostgreSQL dependency:

```bash
specific dev
```

Useful checks and one-off commands include:

```bash
pnpm lint
pnpm typecheck
pnpm graphql:generate
pnpm graphql:check
pnpm test
specific exec web -- pnpm db:migrate
```

GraphQL operations may be declared in frontend TypeScript with the generated
`graphql()` function. Run `pnpm graphql:generate` after changing the backend
schema or an operation. Generated schema and client artifacts are committed
under `apps/web/src/generated/graphql` (frontend) and
`tests/generated/graphql` (test contracts); `pnpm graphql:check` fails when
they are stale. Backend operations are added as decorated TypeGraphQL resolver
classes under `packages/server/src/graphql`. Keep decorated GraphQL DTOs at the
transport boundary instead of annotating financial domain objects.

GitHub Actions runs lint, typechecking, tests, and the GraphQL staleness check
as separate required-check candidates for pull requests to and pushes on
`master`.

Infrastructure and development-environment changes belong in `specific.hcl`.
Run `specific check` after changing that file.
