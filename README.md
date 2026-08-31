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

Powens is the first financial data source. Its server package is a thin adapter
over the provider API; synchronization and persistence are intentionally
separate concerns.

## Workspace structure

Monii is a source-first pnpm workspace. Runtime code follows one dependency
direction: the web and CLI applications compose server adapters, and server
adapters depend on the framework-independent application package.

```text
apps/
  web/          Next.js UI, route bootstraps, Apollo, and frontend GraphQL code
  cli/          One-shot operator and cron commands
  console/      Local TypeScript console for developer exploration
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
specific exec web -- pnpm console
```

The local console runs a complete session inside a `console` operation context
and automatically exposes every explicit `@monii/*` package export under the
`monii` namespace. For example, database exports are available from
`monii.server.database`, and runtime context helpers are available from
`monii.runtime.context`.

Console input supports TypeScript syntax and top-level `await`, but it is
transpiled without type-checking or editor-style TypeScript completion. Node's
REPL does not accept static `import` declarations. Public package entry points
are already preloaded; a private source file can be loaded explicitly from the
repository root instead:

```ts
const schema = await import("./packages/server/src/database/schema.ts");
```

The console does not retain command history between sessions. It is trusted
local development tooling and must not be exposed as a network or production
service.

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

## Powens adapter

The normal adapter is exported from `@monii/server/powens`. It requires only a
versioned API base URL and a permanent user token, and supports:

- `getCurrentUser()`;
- `listConnections()` with each connection's connector expanded;
- `getConnector(connectorUuid)`, which uses Powens' unauthenticated connector
  endpoint; and
- `listAccounts()` for active accounts, their current balances and optional
  Wealth valuations, freshness metadata, currencies, and aggregate balances.

The console-only adapter is exported separately from
`@monii/server/powens/console`. It uses project credentials to create a permanent
user with `createUser()` or renew a user's permanent token with
`renewUserAccessToken()`. These calls refuse to run outside a `console` operation
context, and ordinary client requests never receive or send project credentials.

The adapters read the following environment variables:

- `POWENS_API_BASE_URL`: the full versioned API URL, such as
  `https://example-sandbox.biapi.pro/2.0`;
- `POWENS_CLIENT_ID`: the project client ID;
- `POWENS_CLIENT_SECRET`: the project client secret; and
- `POWENS_USER_ACCESS_TOKEN`: the permanent access token for the configured
  Powens user.

`readPowensConfig()` reads the base URL and user token;
`readPowensConsoleConfig()` reads the base URL and project credentials. Specific
injects all four values into the `daily-sync` cron. For local development,
Specific prompts for missing values and stores them in the gitignored
`specific.local`; deployed values are managed as Specific config and secrets.
The user access token represents the Powens user, so a separate Powens user ID
and the user's bank credentials are not application configuration.

Run the local TypeScript console with the cron's Powens environment:

```bash
specific exec daily-sync -- pnpm console
```

Then create a console client from the preloaded package export:

```ts
const powens = monii.server.powens.console;
const client = powens.createPowensConsoleClient(powens.readPowensConsoleConfig());
```
