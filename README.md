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
- Vitest and Testcontainers
- Specific for development and infrastructure

Powens is planned as the first financial data source, but no Powens integration
has been implemented yet.

## Development

Use the `pnpm` version declared in `package.json` for package management and
scripts. Use Specific to run the application and its PostgreSQL dependency:

```bash
specific dev
```

Useful checks and one-off commands include:

```bash
pnpm lint
pnpm test
specific exec web -- pnpm db:migrate
```

Infrastructure and development-environment changes belong in `specific.hcl`.
Run `specific check` after changing that file.
