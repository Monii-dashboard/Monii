# Financial persistence foundation

## Purpose

This document maps Monii's implemented financial model to PostgreSQL and source
packages. Product semantics remain canonical in [Product definition](product.md)
and domain rules in [Domain and engineering principles](domain-and-engineering.md).

The foundation intentionally implements the current Powens wealth path only.
It establishes boundaries for manual balances, ledgers, imported transactions,
positions, and additional valuation methods without claiming those features exist.

## Model at a glance

```text
financial                         ingestion
  institutions <--------------- external_institutions <- connections
  accounts <-------------------- external_accounts
    |                                  |
    +-- account_merges                 +-- external_account_observations
    +-- account_valuation_candidates <-+-- reported_account_valuations
                                       +-- account_identity_claims

reconciliation
  account_match_assessments

ingestion.synchronization_runs
  +-- synchronization_connection_results
  +-- synchronization_account_results
  +------------------------------------------> wealth.snapshots

wealth
  account_policies
  snapshots -> snapshot_account_decisions
```

The schemas are responsibility boundaries:

- `financial` owns canonical identity and producer-neutral value candidates.
- `ingestion` owns external references, reported facts, provenance, and attempts.
- `reconciliation` owns durable cross-reference identity assessments.
- `wealth` owns selection policy and immutable calculation/read records.
- `public` contains no application tables.

PostgreSQL schemas improve discovery and naming, but package boundaries remain the
primary code boundary. Code must not depend on cross-schema table placement as a
substitute for an explicit application contract.

## `financial` schema

### `institutions`

Canonical banks, brokers, or other account holders. `name` is nullable because a
source may not supply one. Once created, provider refreshes update only the
external reported label; they never silently overwrite this canonical name.

### `accounts`

Canonical financial containers with nullable institution and name. The explicit
fields are:

- `category`: `cash`, `investment`, or `unknown`;
- `purpose`: `personal`, `business`, or `unknown`;
- `management_mode`: currently `external` only; and
- `archived_at`: an explicit domain lifecycle decision.

Unsupported provider products are not modeled as a fake account category. Their
support state belongs to the external account, allowing `known_unsupported` to be
distinguished from a new, unrecognized type.

### `account_merges`

A stable alias from `merged_account_id` to `canonical_account_id`. A confirmed
merge inserts an alias; it does not mutate old account identities or reparent
external references, observations, candidates, or snapshot decisions. Consumers
resolve aliases when they need the current canonical group. Cycles and self-merges
are rejected by application rules and constraints.

### `account_valuation_candidates`

Immutable, producer-neutral candidates for an account value. Each candidate has
an exact amount, nullable normalized currency, valuation method and basis,
optional effective time, and required recorded time. V1 supports the `reported`
method with `balance` and `estimated_value` bases.

This table is the seam for future producer-specific models. A manual balance or
ledger projection should publish a candidate and retain a link to its own source
fact, like `ingestion.reported_account_valuations` does today.

## `ingestion` schema

### Source identity

- `source_instances` identifies one configured adapter instance with stable
  `source_key`, adapter kind, and guarded external subject.
- `external_institutions` maps a source-scoped ID to a canonical institution and
  retains its latest reported name.
- `connections` maps a source-scoped connection ID to an external institution.
- `external_accounts` maps a source-scoped account ID to the canonical account it
  originally created. It retains reported name/type, normalized support and
  lifecycle. That account link stays stable after a merge.

Names and raw types are evidence and diagnostic context, not canonical identity.

### Reported facts

- `external_account_observations` records that a source account was observed in a
  run, including raw currency, source lifecycle, source-valid time, and Monii's
  observation time.
- `reported_account_valuations` links a reported observation and basis to the
  producer-neutral valuation candidate it supports.

Raw unknown currency is retained while normalized currency remains nullable.
Missing values stay `NULL`; no ingestion stage converts unknown to zero. Raw
provider payloads are deliberately not stored as a JSON shadow model.

### Synchronization attempts

- `synchronization_runs` records the source-wide attempt and its action ID.
- `synchronization_connection_results` isolates connection outcomes.
- `synchronization_account_results` records identifiable account outcomes as
  `succeeded`, `provider_error`, `malformed`, or `not_seen`.

Current refresh uncertainty uses the most recently finished result for each
external account, with the immutable result ID as a deterministic tie-breaker.
Runs for the same source cannot overlap, so result completion order identifies
the latest result for one external account. When confirmed aliases span more
than one source, their current results retain synchronization start time as the
cross-source ordering, followed by result completion time and immutable result
ID. The read starts from current external accounts and performs indexed
latest-result lookups; retained attempt history is not materialized to calculate
current state.

Only successful account results link an observation. A complete listing can
produce `not_seen`; a truncated listing cannot infer absence. The financial
refresh workflow commits run finalization, identity reconciliation, and snapshot
creation atomically. Only one non-abandoned run can be active per source instance.

Repeated provenance identifiers are relational constraints, not independent
hints. Composite foreign keys require connections and external accounts to
belong to the stated source, observations and results to agree on their source,
run, external account, and canonical account, and reported valuations to agree
with both their observation and candidate. Optional relationships skip their
tuple constraint only when the optional identifier is null.

### Identity evidence

- `account_identity_claims` stores current and historical versioned HMAC
  fingerprints for validated IBAN, account number, and normalized reported name.

## `reconciliation` schema

### Account match assessments

- `account_match_assessments` stores durable confirmed matches, active likely
  matches, evidence class, and later conflicts. Synchronization provenance is
  optional because reconciliation can also run independently; no separate
  reconciliation-run record or ID is persisted.

Names may suggest a likely duplicate but never confirm one. V1 confirmation also
requires canonical institution, currency, compatible known category, matching
validated IBAN, matching key version, and no contradictory account number.
Reconciliation compares the last known normalized valuation currency reported
through each external account's own observation provenance. An observation
without a valuation does not erase an earlier known normalized currency.

## `wealth` schema

### `account_policies`

Mutable operator-owned calculation policy separated from account identity:

- `inclusion_policy`: `automatic`, `include`, or `exclude`;
- `selected_valuation_method`: `reported` in V1.

Future valuation producers extend the selected-method vocabulary deliberately.
The calculator must never silently fall back when the selected method lacks its
required basis.

### `snapshots`

One immutable knowledge-time calculation caused by a synchronization, policy
change, or independent reconciliation change. It stores the exact EUR headline, duplicate-adjusted estimate,
completeness, counts, policy version, causation/action IDs, and recording time.
Each synchronization and causation ID can create at most one snapshot.

### `snapshot_account_decisions`

One self-contained row per account evaluated in a snapshot. It freezes:

- account and institution display metadata;
- account category, purpose, management mode, and inclusion policy;
- selected valuation method, basis, candidate, amount, currency, and times;
- contribution or precise exclusion decision;
- duplicate group and adjustment role; and
- identity and refresh uncertainty.

An evaluated candidate may belong either to the decision's account or to one of
its immutable merged aliases. The candidate reference preserves that origin;
the decision account identifies the canonical account whose contribution was
calculated.

Current wealth reads only the newest snapshot and these decisions. It does not
join mutable canonical or ingestion metadata. Renaming an account or importing a
backdated fact therefore cannot rewrite what an older snapshot displayed or meant.

Snapshot publication selects the latest candidate for each current account,
method, and basis through indexed lookups. Candidate selection orders by
effective time when present, otherwise recording time, then by recording time
and immutable candidate ID. Confirmed aliases are grouped only after those
bounded per-account reads so the newest candidate across the canonical group
still wins without ranking the complete retained history.

Observations and decisions may contain the same amount for different reasons:
the observation proves what the source reported; the candidate represents a
producer's possible account value; the decision proves what Monii selected and
counted. This is deliberate provenance, not ledger duplication.

## Calculation flow

```text
Specific cron / operator CLI
  -> Powens transport and normalization
  -> financial-refresh workflow
  -> ingestion synchronization commands
  -> PostgreSQL reported facts and results
  -> independent conservative account reconciliation
  -> latest candidates grouped through stable aliases
  -> explicit inclusion + valuation selection policy
  -> immutable snapshot and account decisions

Web/API consumer
  -> current-wealth query
  -> newest immutable snapshot
  -> current-wealth presentation
```

V1 selects balance for cash accounts and estimated value for investment accounts.
Only normalized EUR candidates contribute. Known unsupported, unrecognized,
missing-currency, missing-selected-value, foreign-currency, lifecycle, business,
archive, merge, and explicit policy outcomes stay individually explainable.

Likely duplicates remain in the headline while the adjusted estimate retains the
newest representative. Confirmed duplicates resolve through aliases and contribute
once. Stale last-valid values remain usable. Failed account refreshes reuse the
last candidate while freezing uncertainty into the new snapshot.

## Package boundaries

```text
apps/cli
  -> @monii/financial-refresh
  -> @monii/powens

apps/web/api
  -> @monii/graphql

@monii/financial-refresh -> ingestion, account-reconciliation, wealth-calculation
@monii/account-reconciliation -> accounts, ingestion, postgres
@monii/ingestion -> accounts, postgres
@monii/wealth-calculation -> accounts, account-reconciliation, ingestion, postgres
@monii/wealth-query -> accounts, ingestion, wealth-calculation, postgres

@monii/graphql -> @monii/wealth-query

@monii/accounts owns canonical financial Models and account commands
@monii/postgres owns schemas, the Model factory, and transaction context
@monii/powens implements the external financial source port
```

Important files are named after their responsibility:

- `packages/accounts/src/account-valuation.ts`: common candidate language.
- `packages/accounts/src/models/`: canonical financial table Models.
- `packages/accounts/src/commands/merge-accounts.ts`: account-owned merge write.
- `packages/ingestion/src/external-financial-source.ts`: normalization contract.
- `packages/ingestion/src/commands/`: focused persistence-aware synchronization
  operations.
- `packages/ingestion/src/models/`: ingestion and synchronization Models.
- `packages/account-reconciliation/src/`: pure identity rules, match Model, and
  independent reconciliation command.
- `packages/financial-refresh/src/commands/`: synchronization and standalone
  reconciliation workflows that compose capabilities.
- `packages/wealth-calculation/src/calculate-wealth-snapshot.ts`: pure policy.
- `packages/wealth-calculation/src/commands/`: public wealth write operations.
- `packages/wealth-calculation/src/models/`: wealth policy and snapshot Models.
- `packages/wealth-query/src/queries/get-current-wealth.ts`: persisted read.
- `packages/wealth-query/src/current-wealth.ts`: pure consumer projection.
- `packages/postgres/src/schema/{financial,ingestion,reconciliation,wealth}.ts`:
  physical table definitions.
- `packages/postgres/src/model.ts`: inherited CRUD and typed named-query factory.
- `packages/postgres/src/transaction.ts`: explicit atomic boundaries with an
  async-scoped transaction client.
- `packages/powens/src/source.ts`: provider-to-ingestion normalization.
- `packages/graphql/src/`: API transport only.

Capability packages exchange explicit data and typed events. Current handlers
are synchronous function calls; no persisted outbox or event-bus infrastructure
exists.

## Future manual and ledger extension

Do not add one generic nullable table for every account style. Add a cohesive
producer package and schema only when its first behavior is implemented:

```text
manual balance command -> manual balance fact -> valuation candidate
manual ledger command  -> ledger entries -> ledger projection -> valuation candidate
external history import -> ingestion provenance -> ledger entries -> projection
```

The canonical account remains shared. Management mode validates allowed writes.
External accounts can later have both provider-reported and ledger-derived
candidates, but `wealth.account_policies.selected_valuation_method` chooses exactly
one authority. Positions and account valuations follow the same rule: use holdings
to explain or derive a candidate, never add them beside the selected account value.

Potential future packages should be created for actual capabilities, for example
`ledger`, `manual-accounts`, or a new provider adapter. Keep command validation,
projection, and persistence ownership separate when their invariants differ; do
not create pass-through package layers in advance.

## Clean rebuild and verification

The migration history was intentionally replaced because existing databases were
declared disposable for this refactor. The current baseline is under `drizzle/`
and creates the four application schemas above.

When intentionally replacing the history again, remove the SQL migrations and
snapshots but recreate `drizzle/meta/_journal.json` with version `7`, dialect
`postgresql`, and an empty `entries` array before running `pnpm db:generate`.
Drizzle Kit requires that empty journal to bootstrap a new history. Named
`pgSchema` objects must remain exported from the schema entry point so the
baseline emits `CREATE SCHEMA`; tuples targeted by composite foreign keys must
be declared as table-level `UNIQUE` constraints so they exist before Drizzle's
later `ALTER TABLE ... ADD CONSTRAINT` statements.

Use Specific for the real local environment:

```bash
specific check
specific clean
specific exec web -- pnpm db:push
specific exec daily-sync -- pnpm cli -- sync
specific psql main -- -c "select schemaname, tablename from pg_tables where schemaname in ('financial', 'ingestion', 'wealth') order by 1, 2"
specific dev
```

`specific clean` removes the local Specific state and database, so use it only
when a clean rebuild is intended. `db:push` is the schema-population command for
development and applies the committed named-schema baseline;
deployments continue to run `pnpm db:migrate`.

Integration tests own an isolated PostgreSQL Testcontainer for each test. Run
them directly with `pnpm test:integration`; they never use the Specific
development database.

Repository checks remain:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
```

Production financial logs omit provider external IDs by default. Set
`financial_log_detail = "local_diagnostic"` in local Specific configuration when
those identifiers are needed. Financial amounts, account names, raw payloads,
credentials, identity inputs, and fingerprint secrets must never be logged.
