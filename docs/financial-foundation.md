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
                                       +-- account_match_assessments

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

Only successful account results link an observation. A complete listing can
produce `not_seen`; a truncated listing cannot infer absence. Run finalization,
identity reconciliation, terminal status, and snapshot creation commit atomically.
Only one non-abandoned run can be active per source instance.

### Identity evidence

- `account_identity_claims` stores current and historical versioned HMAC
  fingerprints for validated IBAN, account number, and normalized reported name.
- `account_match_assessments` stores durable confirmed matches, active likely
  matches, evidence class, and later conflicts.

Names may suggest a likely duplicate but never confirm one. V1 confirmation also
requires canonical institution, currency, compatible known category, matching
validated IBAN, matching key version, and no contradictory account number.

## `wealth` schema

### `account_policies`

Mutable operator-owned calculation policy separated from account identity:

- `inclusion_policy`: `automatic`, `include`, or `exclude`;
- `selected_valuation_method`: `reported` in V1.

Future valuation producers extend the selected-method vocabulary deliberately.
The calculator must never silently fall back when the selected method lacks its
required basis.

### `snapshots`

One immutable knowledge-time calculation caused by a synchronization or policy
change. It stores the exact EUR headline, duplicate-adjusted estimate,
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

Current wealth reads only the newest snapshot and these decisions. It does not
join mutable canonical or ingestion metadata. Renaming an account or importing a
backdated fact therefore cannot rewrite what an older snapshot displayed or meant.

Observations and decisions may contain the same amount for different reasons:
the observation proves what the source reported; the candidate represents a
producer's possible account value; the decision proves what Monii selected and
counted. This is deliberate provenance, not ledger duplication.

## Calculation flow

```text
Specific cron / operator CLI
  -> Powens transport and normalization
  -> ingestion synchronization use case
  -> PostgreSQL reported facts and results
  -> conservative identity reconciliation
  -> latest candidates grouped through stable aliases
  -> explicit inclusion + valuation selection policy
  -> immutable snapshot and account decisions

Web/API consumer
  -> wealth query port
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
  -> @monii/ingestion
  -> @monii/powens
  -> @monii/postgres

apps/web/api
  -> @monii/graphql
  -> @monii/postgres (wealth-query repository composition)

@monii/accounts <- @monii/ingestion
@monii/accounts <- @monii/wealth-calculation
@monii/accounts <- @monii/wealth-query

@monii/graphql -> @monii/wealth-query

@monii/postgres implements ingestion, calculation, and query ports
@monii/powens implements the external financial source port
```

Important files are named after their responsibility:

- `packages/accounts/src/account-valuation.ts`: common candidate language.
- `packages/ingestion/src/external-financial-source.ts`: normalization contract.
- `packages/ingestion/src/synchronize-source-instance.ts`: worker orchestration.
- `packages/wealth-calculation/src/calculate-wealth-snapshot.ts`: pure policy.
- `packages/wealth-query/src/current-wealth.ts`: consumer projection.
- `packages/postgres/src/schema/{financial,ingestion,wealth}.ts`: table ownership.
- `packages/postgres/src/repositories/financial-persistence.ts`: internal atomic
  persistence composition. Its public ingestion, calculation, and query factories
  return narrow ports, so workers and consumers cannot call each other's methods.
- `packages/powens/src/source.ts`: provider-to-ingestion normalization.
- `packages/graphql/src/`: API transport only.

Portable packages exchange explicit data and typed events. Current handlers are
synchronous function calls; no persisted outbox or event-bus infrastructure exists.

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
and creates only the three application schemas above.

Use Specific for the real local environment:

```bash
specific check
specific clean
specific exec web -- pnpm db:push
specific exec daily-sync -- pnpm cli -- sync
specific exec web -- pnpm test:integration
specific psql main -- -c "select schemaname, tablename from pg_tables where schemaname in ('financial', 'ingestion', 'wealth') order by 1, 2"
specific dev
```

`specific clean` removes the local Specific state and database, so use it only
when a clean rebuild is intended. `db:push` is the schema-population command for
development and applies the committed named-schema baseline;
deployments continue to run `pnpm db:migrate`.

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
