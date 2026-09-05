# Domain and engineering principles

## Purpose

This document establishes shared language and implementation guardrails for
Monii. It is deliberately not a database schema, provider contract, or mandate
for a particular architecture.

The repository is an early full-stack implementation: Next.js, TypeScript,
PostgreSQL with Drizzle, Vitest/Testcontainers, and Specific. The persisted
financial foundation is implemented; the generated home page remains a
placeholder and does not represent a product decision.

For a table-by-table description, relationship diagram, synchronization flow,
and code map of that foundation, see
[Financial persistence foundation](financial-foundation.md).

## Source workspace boundaries

Monii is organized as a small, source-first pnpm workspace:

- `apps/web` owns the Next.js UI, frontend GraphQL client, and thin HTTP route
  bootstraps.
- `apps/cli` owns one-shot operator and scheduled-command bootstraps.
- `apps/console` owns the local, interactive TypeScript developer bootstrap.
  It discovers explicit workspace-package exports without making private source
  files part of those packages' supported APIs.
- `packages/runtime` owns Node-backed operation context, logging, and future
  process-wide observability capabilities used across backend code.
- `packages/application` owns framework-independent domain concepts, use cases,
  and ports. It must not read environment variables or depend on Next.js,
  GraphQL, Drizzle, provider SDKs, or Node bootstraps.
- `packages/server` owns PostgreSQL, GraphQL transport, provider integrations,
  environment-backed configuration, and other Node adapters.
- root `tests` owns cross-package integration tests and their fixtures.

The main dependency direction is `apps/web`, `apps/cli`, and `apps/console` to
`packages/server` to `packages/application`. Apps, server, and application may
also depend on `packages/runtime`; runtime must not depend on them. Shared
packages expose only explicit package entry points and ship TypeScript source
directly; package compilation and a monorepo task orchestrator are intentionally
unnecessary at this scale. A future UI or worker should be added at the boundary
that owns its runtime responsibility rather than weakening this direction.

`packages/runtime` exposes focused subpaths rather than a root barrel. Each HTTP
request, CLI run, console session, or future worker action establishes an
operation context at its surface before invoking deeper code. The current
context contains only a surface and an action ID, propagates through Node's
asynchronous execution, and is available to application and adapter logging
without explicit parameter threading. The runtime generates each action ID as
the surface followed by a hyphen and a UUID. Business inputs and dependencies
remain explicit; operation context must not become a general service container.

## Conceptual model

External financial data should be understood through distinct concepts:

```text
Data source (Powens)
        -> reports a financial institution
        -> reports accounts or financial containers
        -> may report positions held by an account
        -> positions may reference financial instruments

Synchronization and valuation observations record what was known, from where,
and at what time.
```

### Data source

A service or import mechanism from which Monii retrieves financial information.
Powens is the first planned data source. Direct APIs, other aggregators, files,
or manual entry could be added later, but are not V1 requirements.

### Financial institution

The bank, broker, or other organization that holds an account, such as Crédit
Agricole, Revolut, or Trade Republic. An institution is not the same concept as
the data source that reports it.

### Account or financial container

A place that holds monetary value or investments: for example, a current
account, savings account, PEA, PER, or brokerage account. For V1, an account's
latest usable valuation is the unit that contributes to current wealth.

### Position or holding

An amount of an investment held within an account. Position data is optional:
some sources or institutions may expose detailed positions while others expose
only an account value. V1 does not require a holdings interface.

### Asset or financial instrument

The security or other financial object referenced by a position. Instrument
identity and metadata may later support analysis across accounts and sources,
but comprehensive instrument normalization is not needed to calculate V1
wealth.

### Valuation or observation

A monetary value known at a point in time. An observation should distinguish
when Monii retrieved the data from when the source says it was valid, when both
are available. Current wealth uses the most recent usable account valuation;
retained observations make future history possible.

### External reference

The identity assigned to an object by a data source. External references exist
for synchronization and correlation. They are not the fundamental identity of
Monii's domain objects.

### Synchronization state

Information about an attempt to retrieve and normalize source data, including
success, failure, and the last successful synchronization. Synchronization
state is related to financial data but is not itself an account or valuation.

## Core boundaries and invariants

### Own the internal model

Powens payloads and identifiers must remain at the integration boundary.
Adapters should translate provider-specific data into concepts the application
owns. Core wealth calculation and display logic should not require Powens
response shapes.

Monii should assign internal identities. A provider ID belongs in an external
reference associated with an internal object. This leaves room to correlate a
future second source with the same institution, account, position, or
instrument without replacing internal identity.

This boundary does not require a large hierarchy of interfaces or a separate
type for every layer. Add an abstraction only when it performs meaningful
translation, policy, validation, orchestration, or isolation.

### Treat missing data as normal

Sources and institutions will expose different subsets of balances, positions,
transactions, timestamps, and cost information. Optional data must remain
optional unless it is truly required for a specific behavior.

An incomplete account should retain the behavior its available data can
support. Missing position details, for example, must not invalidate an
otherwise usable account valuation. Unknown values must not silently become
zero.

### Keep valuation semantics explicit

The V1 aggregate is based on account-level valuations in EUR:

- Cash-account balances are signed, so a negative balance reduces the total.
- An investment account contributes its current estimated value rather than
  invested capital or cost basis.
- Stale last-valid valuations remain usable when their freshness is visible.
- Accounts without any usable valuation do not contribute and make the
  aggregate incomplete.
- Positions and cash inside an investment account must not be counted again if
  they are already represented by the account valuation.

For V1, cash accounts use an account-level EUR balance and investment accounts
use an account-level EUR valuation. Investment balances and position-derived
values are not fallbacks. The normalized observation retains both account-level
candidates when supplied, while the wealth snapshot records the one candidate
selected by this policy.

### Preserve provenance and freshness

Where available and relevant, normalized financial information should remain
traceable to:

- the data source and external object that produced it;
- the time Monii retrieved it;
- the time the source says it was valid; and
- the last successful synchronization for the relevant connection.

The exact storage shape is deferred. Provenance should be sufficient to explain
freshness and investigate unexpected values without leaking provider structures
through the whole application.

## Synchronization and read path

The user-facing dashboard reads normalized, persisted data. It must not call
external financial APIs as part of page rendering.

```text
External source
      -> source adapter and normalization
      -> internal PostgreSQL data and observations
      -> wealth calculation and dashboard
```

A Specific cron runs the synchronization worker daily. It uses the application's
build and invokes the CLI synchronization entrypoint with the same PostgreSQL
database as the web service. The synchronization implementation may split into
more jobs or move to durable workflows if real orchestration requirements emerge;
that complexity is not needed for the initial once-daily fetch.

Synchronization isolates failures by source, connection, and identifiable
account item. A failure must preserve prior valid data, expose useful failure
state, and allow unaffected data to remain readable. A complete listing may
mark a known account as not seen; a truncated listing may not infer absence.
Run finalization, identity reconciliation, and snapshot creation are atomic,
and overlapping runs for the same source are rejected. Retries and error categorization
should be introduced in proportion to observed needs rather than designed
speculatively.

## Persistence and historical observations

Financial concepts use Monii UUID identities. Source-scoped text references map
external institutions, connections, and accounts to those identities. A new
source reference initially creates a new domain object. Monii may then merge it
automatically only from strong provider-boundary evidence: the same canonical
institution, a validated matching IBAN, currency, compatible account kind, and
no contradictory account-number evidence. Names alone never confirm identity;
they may create a likely-duplicate candidate when strong identifiers are
unavailable. Candidates remain included until a future review surface resolves
them.

Sensitive identity evidence is persisted only as versioned keyed fingerprints.
A confirmed merge is durable and retains every source reference; later
contradictory evidence creates a visible conflict rather than automatically
splitting identity. The newest healthy observation across all linked references
supplies the canonical value. Historical snapshots and merged account records
remain immutable and traceable.

Stable domain facts use relational PostgreSQL columns. Monetary values use exact
decimal storage and unknown values remain null. Provider payloads are not kept
as JSON or JSONB in the domain database. If replay becomes necessary, raw
payload retention should be introduced as a separate, access-controlled,
time-bounded integration facility rather than a shadow domain model.

V1 retains immutable normalized account observations rather than overwriting
the only known value. It also records a wealth snapshot, including every
account's contribution or exclusion decision, after each synchronization and
inclusion change. A failed refresh may therefore reuse an earlier usable value
without changing its provenance. This is a data-collection requirement, not a
requirement to deliver historical charts or advanced performance calculations.

Source-explicit disabled or deleted accounts are excluded automatically;
temporary absence or failure leaves the source lifecycle unchanged. An account
value becomes stale after 48 hours, while a newer failed synchronization is
reported immediately. Professional accounts are excluded by automatic policy
but can be deliberately included. Unknown account types remain visible, do not
contribute, and make the total incomplete.

## Single-user and currency assumptions

V1 serves one known user and reports in EUR. Provider credentials and
connection configuration may initially be managed through environment and
operator workflows.

The core financial concepts should not depend unnecessarily on global
singletons or provider credentials embedded in domain objects. This does not
justify building tenants, user onboarding, authorization layers, or FX
accounting before they are needed.

## Implementation principles

- Keep business rules separate from Next.js routes, provider clients,
  persistence details, and infrastructure where practical.
- Keep route handlers thin and place code with the feature that owns it.
- Prefer explicit, locally understandable code over generic frameworks.
- Introduce adapters at external boundaries, not across every internal call.
- Test observable wealth-calculation and degradation behavior independently
  from provider transport details.
- Keep synchronization integration tests separate from domain behavior tests
  and repository-quality checks.
- Use PostgreSQL through the existing Drizzle setup unless an actual
  requirement supports a change.
- Define services, databases, schedules, workflows, secrets, and development
  environments with Specific.

## Application API boundary

For now, frontend code communicates with Monii application services through a
single GraphQL endpoint. GraphQL is the application transport and contract; it
does not replace the internal domain model or provider adapters.

The backend schema is defined with TypeGraphQL resolver and transport DTO
classes and served through GraphQL Yoga. Decorated GraphQL classes belong to
the transport boundary; financial domain objects should not depend on
TypeGraphQL metadata. Apollo Client consumes generated typed operation
documents. A generated SDL schema and operation types are committed under an
explicit `generated` directory and checked for staleness. Powens and future
provider payloads must still be normalized before they reach GraphQL-facing
application logic.

This decision does not introduce multiple GraphQL services, federation,
subscriptions, or provider-facing GraphQL APIs. Add those only for a concrete
need.

## Intentionally deferred decisions

The following should be decided from real provider data and implementation
needs, not inferred from this document:

- Powens endpoint selection, field mapping, and authentication details;
- synchronization retries, concurrency, and any orchestration beyond the daily
  Specific cron;
- operator confirmation or dismissal of likely duplicates and broader
  cross-provider institution reconciliation;
- the long-term retention policy for historical observations and snapshots;
- whether and how optional positions and instrument metadata are persisted;
- self-service authentication, multi-user ownership, and tenant isolation;
- non-EUR valuation and foreign-exchange policy; and
- the eventual observability stack and operational alerting policy.

Deferring these choices is intentional. Future implementation should select the
simplest design that satisfies the product behavior while respecting the
boundaries above.
