# Domain and engineering principles

## Purpose

This document establishes shared language and implementation guardrails for
Monii. It is deliberately not a database schema, provider contract, or mandate
for a particular architecture.

The repository is an early full-stack implementation: Next.js, TypeScript,
PostgreSQL with Drizzle, Vitest/Testcontainers, and Specific. The persisted
financial foundation and current-wealth dashboard read slice are implemented.

For a table-by-table description, relationship diagram, synchronization flow,
and code map of that foundation, see
[Financial persistence foundation](financial-foundation.md).

Testing ownership, suite boundaries, infrastructure policy, and the active
remediation backlog are defined in the
[testing strategy and remediation tracker](testing.md).

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
- `packages/accounts` owns canonical account, institution, merge-alias, and
  valuation-candidate language. It is portable.
- `packages/ingestion` owns provider-neutral source inputs, conservative
  external-account identity policy, and public and internal synchronization
  commands. Pure policy remains isolated from its Node persistence composition.
- `packages/wealth-calculation` owns inclusion and valuation-selection policy,
  exact aggregate calculation, immutable decision output, and wealth commands.
- `packages/wealth-query` owns the current-wealth query and presentation
  projection. It remains independent from worker orchestration.
- `packages/powens` owns Powens transport, configuration, DTOs, and normalization.
- `packages/postgres` owns Drizzle schemas, row models, database context,
  transaction mechanics, and reusable single-table queries registered by name
  on their owning model. Capability packages own their purpose-specific
  commands and multi-table queries.
- `packages/graphql` owns the GraphQL transport and resolver composition.
- Unit and integration tests live beside their owning package or app behavior,
  either in `src` or a focused `test` directory. Root `tests` currently owns
  only cross-cutting testkit infrastructure and repository-quality checks; a
  future root integration test is justified only when no package or app owns
  the composed behavior.

The private operator CLI uses oclif file-based discovery under
`apps/cli/src/commands` and generated help. Commands own parsing, metadata, and
exit status; framework-independent functions under `operations` compose server
adapters, report results, and await cleanup. Commands load operations only after
parsing, so help never initializes financial dependencies. The runner establishes
one operation context around dispatch and error handling. Nested directories
provide command groups without a central registry; source execution uses `tsx`.

Keep `packages/` flat and name packages after cohesive capabilities. App-specific
behavior stays in feature or command folders inside its owning app until a
meaningful independent API or reuse warrants extraction. A single consumer is
acceptable. Apps must not import another app's internals.

Every workspace manifest declares `monii.platform` as `portable` or `node`.
Portable packages may depend only on portable workspace packages and cannot use
Node APIs, environment access, or concrete backend/framework adapters. Node
packages may depend on portable or Node packages. Accounts is portable;
ingestion, wealth-calculation, wealth-query, PostgreSQL, Powens, GraphQL,
runtime, and the app composition roots are Node. Pure domain modules inside a
Node package still avoid Node and persistence imports. Web frontend code cannot
import Node packages outside HTTP route bootstraps.

Portable ownership applies to production APIs and manifest dependencies. A
recognized `.integration.test.ts` file may compose test capabilities through
the repository's virtual `@testkit/*` imports, and its package may own isolated
helpers under `test-support`. These are test-only composition roots: lint
rejects their use from production and unit tests, and workspace validation
rejects manifests that export `test-support`. This exception must not create a
production dependency edge or weaken package public boundaries.

The workspace graph must be acyclic. Capability commands may depend on
PostgreSQL models; PostgreSQL must not depend back on those capabilities.
Runtime remains independent of other workspace packages. Third-party
compatibility remains an explicit dependency-review responsibility: workspace
metadata does not certify external libraries.

Shared packages expose explicit package entry points and ship TypeScript source
directly. Cross-package production imports must use these public exports rather
than private source paths. Package compilation and a task orchestrator are
unnecessary at this scale. Adding a package requires its source, a manifest with
platform, dependencies and exports, and standard TypeScript configuration with a
`typecheck` script. Lint discovers manifests through `tooling/workspace-policy.mjs`
and checks metadata, dependency compatibility, cycles, and import boundaries.
Workspace typechecking runs recursively before the root TypeScript check.

`packages/runtime` exposes focused subpaths rather than a root barrel. Each HTTP
request, CLI run, console session, or future worker action establishes an
operation context at its surface before invoking deeper code. The current
context contains only a surface and an action ID and propagates through Node's
asynchronous execution for backend logging. Runtime generates each action ID as
the surface followed by a hyphen and a UUID. Capabilities receive business inputs
and dependencies explicitly; operation context must not become a service container.

Operational logs are structured records, not domain events. Every record has a
stable machine-queryable event name, a human-readable message, severity,
timestamp, surface, action ID, and contextual fields. Domain events represent
business facts for explicit handlers; logs explain execution and are not an
event bus, outbox, or durable financial record.

Financial operations log lifecycle summaries, state changes, degraded inputs,
failures, duplicate resolution, incomplete wealth decisions, and snapshot
outcomes. Routine observations and successful valuation writes remain visible
through persisted facts rather than repetitive log lines. Transactional records
are emitted only after commit. Production records may contain internal identifiers, amounts,
currencies, timestamps, counts, and reason codes, but not financial names,
provider identifiers, identity fingerprints, account numbers, raw payloads,
secrets, or raw exception messages. Existing observations, match assessments,
merges, and snapshot decisions remain the durable audit trail.

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

An account may eventually have several valuation producers, such as a provider
report, a manually entered balance, or a ledger-derived balance. Producers write
their own facts and publish a common immutable account-valuation candidate. A
separate account policy explicitly selects the authoritative valuation method;
the calculator does not guess or silently fall back to another producer.

### Ledger and transactions

A ledger is a sequence of economic events from which balances, holdings, and
performance may be derived. It is not a replacement for snapshots and is not
part of V1. Future manual-ledger accounts and imported provider transaction
history should share ledger concepts while retaining different ingestion and
provenance boundaries.

Account management mode controls valid writes. A manual-balance account accepts
manual valuation facts, a manual-ledger account accepts manual ledger entries,
and an external account accepts facts only through an integration or import.
Manual-balance and manual-ledger modes are mutually exclusive. An external
account may eventually contain provider reports and an imported provider ledger;
its selected valuation method determines which derived or reported candidate is
authoritative, so account value and underlying entries are never counted twice.

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
A confirmed merge creates a durable alias from the redundant account to the
canonical account. It never reparents external references, valuation facts, or
historical decisions. Later contradictory evidence creates a visible conflict
rather than automatically splitting identity. The newest healthy candidate
across the canonical account and its aliases supplies the canonical value.
Historical snapshots and merge aliases remain immutable and traceable.

Stable domain facts use relational PostgreSQL columns. Monetary values use exact
decimal storage and unknown values remain null. Provider payloads are not kept
as JSON or JSONB in the domain database. If replay becomes necessary, raw
payload retention should be introduced as a separate, access-controlled,
time-bounded integration facility rather than a shadow domain model.

V1 retains immutable normalized account observations and valuation candidates
rather than overwriting the only known value. It records a wealth snapshot after
each synchronization and account-policy change. Each decision freezes the
account and institution labels, classification, selected candidate metadata,
contribution, exclusion reason, duplicate role, and uncertainty known then.
Reads therefore need no join to mutable account or ingestion tables. Backdated
facts create a new knowledge-time snapshot; they never rewrite an old snapshot.

Observations answer “what did a source report?”, ledger entries will answer
“what economic event happened?”, valuation candidates answer “what account value
could a producer support?”, and snapshot decisions answer “what did Monii count,
and why?”. Similar amounts across these records are intentional provenance, not
duplicate ownership of the same concept.

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
- Emit typed domain events from capability packages, but invoke handlers
  synchronously and explicitly for now. A persisted outbox or external event bus
  is justified only when delivery, retry, or independent deployment requires it.

### PostgreSQL models and transactions

Monii has one PostgreSQL database. Persistence-aware Node code accesses it
through lightweight table models in `@monii/postgres/models`; normal callers do
not accept or pass a database client. The client resolver uses the active
asynchronous database context when one exists and otherwise uses the configured
process database.

Each table has a small class extending the shared `modelFor` base. The base
provides typed `create`, `find`, `findMany`, `update`, and `delete` operations,
including support for non-`id` and composite primary keys. A concrete model does
not repeat those methods. It may add a clearly named table-owned operation such
as `Account.archive`, but models must remain representations of persisted rows,
not service containers. Do not add implicit relation loading, mutable dirty
tracking, lifecycle hooks, or generic business workflows to the base model.

Simple equality lookups belong on the inherited model API. A reusable read that
still concerns one table—such as the latest snapshot, current claims, or the
latest synchronization status—is registered under a snake-case literal name in
that table's model file. Callers use `Model.query("query_name").load()`,
`.loadOne()`, or `.count()`. The registry preserves the result inferred from
each Drizzle selection, so a query name exposes only its actual projected
fields and an unknown name fails typechecking. Do not replace an ordinary
`find` or `findMany` equality lookup with a named query.

Joins, cross-table projections, window-function reads, locking reads, and SQL
whose meaning exists only inside one workflow belong in internal logic owned by
the capability that needs them. A workflow belongs in one public or internal
command and composes model methods and focused queries. Pure domain modules
continue to own rules and domain language without importing models.

Use `transaction(async () => { ... })` only when an operation owns an atomic
consistency boundary. A read, a single atomic SQL statement, or independent
writes do not acquire a transaction merely because they are inside a command.
The transaction helper installs its Drizzle transaction in asynchronous context,
so every model and query called below it automatically uses the same client.
The transaction boundary itself must remain explicit at the operation level;
asynchronous context removes client plumbing, not ownership of atomicity. Nested
commands participate automatically, and a nested command that independently
requires atomicity uses a database savepoint. Register logging or another effect
that must describe committed state with `afterCommit` and await all work started
inside the transaction. Keep external API calls outside database transactions.

The `commands` directory contains one externally callable operation per file.
Package-private commands live under `internal/commands`; other private helpers
are grouped under a named internal responsibility rather than a flat junk
drawer. Commands may call public or internal commands. The package entry point
exports only its supported commands, queries, domain functions, and public
types; internal modules are never exported or deep-imported by another package.

Do not add a repository, persistence interface, or reusable repository-contract
suite for a table when PostgreSQL is the only implementation. Add an interface
only for a real external boundary or demonstrated second implementation.

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

The GraphQL resolver calls the `wealth-query` package's public query, which
loads the current snapshot through the active PostgreSQL context. The dashboard
consumes only the generated GraphQL operation rather than database or provider
types.

This decision does not introduce multiple GraphQL services, federation,
subscriptions, or provider-facing GraphQL APIs. Add those only for a concrete
need.

## Frontend theme boundary

The web app uses Tailwind's CSS-first configuration with a layered token system.
`apps/web/src/styles/theme/` is the canonical source. Its `index.css` composes
foundation palette, semantic roles, system tokens, reusable visual effects, and
the Tailwind adapter in a deliberate order. The adapter exposes semantic roles
as Tailwind utilities. Foundation palette values are private to the theme;
components consume only `--theme-*` properties or semantic utilities such as
canvas, surface, content, accent, and danger.

Use Tailwind utilities in `className` for ordinary component layout, spacing,
type, color, border, responsive, and interaction styling. Use scoped CSS Modules
only where CSS itself is the clearest representation, such as pseudo-elements,
layered backgrounds, intricate visual geometry, or keyframe animation. Inline
styles are reserved for values that only exist at runtime, such as chart widths
or a data series' `--signal`; they should feed a semantic custom property rather
than contain a static style recipe. Global CSS owns imports, resets, tokens, and
truly application-wide behavior, not component selectors.

Reusable typography, radius, shadow, and motion decisions also belong in the
theme. Tailwind's standard spacing scale remains the default layout vocabulary;
add a named token only when a value represents a recurring Monii design
decision. Component variants own repeated class recipes. Page-specific geometry
remains local in utilities or a scoped module. Data-driven values, such as chart
positions and contribution widths, remain local and may use inline styles.

Frontend components are split at responsibilities and ownership boundaries,
not at arbitrary line counts. Route/query boundaries remain thin, feature
components stay under their feature, pure presentation calculations live in the
feature library, and reusable application chrome lives outside features. Promote
a component or class recipe only after it has a concrete second consumer; do
not add wrapper components that merely forward props.

Product UI typography uses a compact but readable role scale: labels do not go
below 12px/16px, compact financial values use 13px/18px, primary component text
uses 14px/20px, and component titles start at 16px/24px. Display values may use
tighter leading while ordinary text must remain resilient to browser
text-spacing overrides. Product spacing uses a 4px step with an 8px primary
rhythm; use 12–24px for most component gaps and internal padding, and 32px or
more for page-level grouping.

Themes override semantic custom properties under a `data-theme` selector while
leaving component classes unchanged. The current product defines only its dark
Nebula Bloom theme: a black-violet workspace with controlled violet, magenta,
cyan, and amber light fields, a fine technical grid and grain, glass panels,
and high-contrast financial signals. Branded treatments such as canvas
lighting, data gradients, and the wealth lens are reusable effect tokens rather
than page-local color recipes. Add another theme only with a deliberate palette
and user-visible theme selection behavior.

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
- ledger entry shape, balancing rules, transaction import deduplication, and
  valuation derivation for manual or externally imported ledgers;
- activation of manual-balance and manual-ledger account modes and their write
  commands (the mode exclusivity and valuation-authority rules above are not deferred);
- self-service authentication, multi-user ownership, and tenant isolation;
- non-EUR valuation and foreign-exchange policy; and
- the eventual observability stack and operational alerting policy.

Deferring these choices is intentional. Future implementation should select the
simplest design that satisfies the product behavior while respecting the
boundaries above.
