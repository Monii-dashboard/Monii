# Domain and engineering principles

## Purpose

This document establishes shared language and implementation guardrails for
Monii. It is deliberately not a database schema, provider contract, or mandate
for a particular architecture.

The repository is currently an early full-stack scaffold: Next.js, TypeScript,
PostgreSQL with Drizzle, Vitest/Testcontainers, and Specific. Its `dummy` table
and generated home page are placeholders and do not represent domain decisions.

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

The exact precedence between a provider-reported account value, position-derived
value, and other fallbacks is intentionally undecided. That policy should be
made explicit and tested when the available Powens data is understood.

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

A background process will synchronize approximately once per day. Whether that
process is a Specific cron, worker, workflow, or another simple mechanism should
be chosen when implementation requirements are clearer. Whatever mechanism is
selected must be defined through Specific with the rest of the project's
infrastructure.

Synchronization should isolate failures by connection or source where
practical. A failure must preserve prior valid data, expose useful failure state,
and allow unaffected data to remain readable. Retries and error categorization
should be introduced in proportion to observed needs rather than designed
speculatively.

## Historical observations

V1 must retain daily observations rather than overwriting the only known value.
This is a data-collection requirement, not a requirement to deliver historical
charts or advanced performance calculations.

The storage strategy remains open. It should preserve enough meaning to
reconstruct best-known account and total wealth over time without assuming that
every account updates successfully every day.

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

## Intentionally deferred decisions

The following should be decided from real provider data and implementation
needs, not inferred from this document:

- the relational schema and migration sequence;
- Powens endpoint selection, field mapping, and authentication details;
- adapter interfaces and normalized ingestion types;
- synchronization scheduling, orchestration, retries, and concurrency;
- valuation precedence and fallback rules;
- the threshold and language used to classify data as stale;
- account matching, deduplication, and cross-source reconciliation;
- the representation and retention policy for historical observations;
- whether and how optional positions and instrument metadata are persisted;
- self-service authentication, multi-user ownership, and tenant isolation;
- non-EUR valuation and foreign-exchange policy; and
- the eventual observability stack and operational alerting policy.

Deferring these choices is intentional. Future implementation should select the
simplest design that satisfies the product behavior while respecting the
boundaries above.
