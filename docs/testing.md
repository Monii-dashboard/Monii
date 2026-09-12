# Testing strategy and remediation tracker

## Purpose

This document is the durable testing policy and active remediation tracker for
Monii. It records the weaknesses found in the current suite, the target design,
and the evidence required before an issue can be marked fixed.

The tracker must be updated in the same change as each fix. A cleanup is not
complete merely because files moved or a test is green: its acceptance criteria
must pass and its row in the tracker must be updated.

## Status convention

| Status | Meaning |
| --- | --- |
| `Open` | Confirmed issue with no completed fix. |
| `In progress` | A focused fix is being implemented. |
| `Fixed` | Every acceptance criterion is met and verification is recorded. |
| `Deferred` | Deliberately postponed with a reason and a revisit condition. |
| `Won't fix` | Rejected deliberately, with the decision recorded. |

When an issue becomes `Fixed`, add its completion date, the relevant pull
request or commit when available, and the commands that verified it. Do not
delete fixed issues: they preserve the reasoning behind the resulting
structure.

## Executive verdict

The suite is not bad; its organization is. The core financial tests already
care about exact decimals, duplicate handling, stale data, redaction, and
failure preservation. Those are the right things to care about. The current
structure nevertheless makes the green result look more comprehensive and
more deterministic than it is:

- root `tests/` is acting as a junk drawer for package unit tests, process tests,
  transport tests, integration tests, generated contracts, and shared helpers;
- the suite label often describes a filename rather than the boundary exercised;
- the database fixture contains an escape hatch from an isolated container into
  mutable development infrastructure;
- static HTML assertions make interaction claims without running a browser;
- broad happy-path files leave important financial and persistence branches
  invisible.

That combination is survivable now and expensive later. The goal of this plan
is not maximum test count or maximum abstraction. It is a suite where location,
name, prerequisite, and failure each tell the same truth.

## Audit baseline

Baseline date: 2026-09-10.

The current suite has 17 test files, 171 test cases, and approximately 2,831
lines of test code. At the time of the audit:

- all 126 tests selected by `pnpm test:unit` passed;
- all 38 repository-policy tests passed;
- `pnpm typecheck` and `pnpm graphql:check` passed;
- `pnpm test:integration` failed when no container runtime was available;
- `specific exec web -- pnpm test:integration` connected to the shared
  Specific development database and only 3 of 7 tests passed because existing
  data violated the suite's empty-database assumptions.

Those results reveal two different problems. A missing container runtime is an
honest unmet prerequisite. Silently redirecting integration tests to a mutable
development database is a test isolation defect.

## Accepted testing model

### Public suites

Monii will expose four public test categories. New labels such as `contract`,
`acceptance`, `component`, or `browser` must not become additional top-level
commands unless a demonstrated operational need outweighs the extra taxonomy.
Those terms can still describe a test's purpose within one of the four suites.

| Suite | What belongs in it | What does not |
| --- | --- | --- |
| `unit` | One unit of observable behavior with controlled collaborators. This includes pure domain code, adapter normalization, and isolated UI components. | PostgreSQL, network calls, a spawned application, or an end-to-end user journey. |
| `integration` | A real boundary between meaningful components: PostgreSQL adapters, GraphQL client-to-server transport, CLI subprocess behavior, or console composition. | Tests that only call one function with fakes, or whole browser journeys. |
| `e2e` | A user-visible flow through a running application and its public network boundary. | Static HTML rendering, isolated components, or direct repository calls. |
| `repository` | Static repository rules such as workspace dependency policy, generated-artifact consistency, and structural constraints. | Application or business behavior. |

The public commands should remain:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:repository
```

An internal runner split is allowed where execution technology requires it. In
particular, `test:unit` may compose `unit-node` and `unit-browser` Vitest
projects while still presenting one unit-test category to contributors.
Selection should come from file placement and runner configuration, not a
collection of test-only environment variables.

### File ownership and placement

Tests should live with the capability that owns the behavior. A root-level
`tests/` directory is useful, but only for behavior that genuinely has no
single package or app owner.

The target shape is:

```text
apps/
  cli/
    src/**/*.test.ts                 isolated command behavior
    **/*.integration.test.ts         spawned or composed integration behavior
    test-support/                    app-owned endpoint bindings when needed
  console/
    src/**/*.test.ts                 isolated module behavior
    **/*.integration.test.ts         complete REPL/composition behavior
  web/
    src/**/*.test.tsx                isolated browser component behavior
    src/**/*.integration.test.ts     colocated app composition behavior
    test-support/                    web-owned in-process endpoint bindings
packages/
  accounts/src/**/*.test.ts
  accounts/src/**/*.integration.test.ts
  accounts/test-support/             narrow account state helpers
  ingestion/src/**/*.test.ts
  ingestion/test-support/            small source-input fakes with overrides
  wealth-calculation/src/**/*.test.ts
  wealth-query/src/**/*.test.ts
  powens/src/**/*.test.ts
  postgres/**/*.integration.test.ts
  graphql/**/*.integration.test.ts
tests/
  e2e/**/*.e2e.spec.ts               Playwright Test journeys
  repository/**/*.test.mjs           repository-quality checks
  support/                            cross-cutting test infrastructure only
```

This is a direction, not a requirement to create every directory immediately.
Empty placeholder directories and speculative helpers should not be committed.
An integration test may be colocated inside `src` or placed in `test`; its
`.integration.test.ts` or `.integration.test.tsx` suffix, not a top-level test
directory, selects the suite. Put it closest to the behavior whose result it
asserts, even when it uses app-level endpoints or another package's setup
helpers.

Name a file after its behavioral subject or surface, not merely the concrete
technology used to run it. For example,
`synchronization-finalization.integration.test.ts` identifies the operation and
behavior it owns. A `postgres-*` omnibus file that groups unrelated models,
queries, or operations is not an acceptable owner.

### Naming tests precisely

Each test name must state an observable claim that the test actually proves.
Use the form `<behavior> when <condition>` where it reads naturally. Put the
subject or boundary in `describe`, and keep the individual test focused on one
coherent outcome.

Names must not imply:

- browser interaction when the test only inspects static markup;
- persistence when the test uses an in-memory fake;
- concurrency when calls are made sequentially;
- exhaustive coverage when only representative branches are exercised;
- a production boundary when the test uses a synthetic schema or substitute.

Examples:

| Weak claim | Accurate replacement or required proof |
| --- | --- |
| `functionally disables the link` | For static markup: `renders a pending link as aria-disabled and removes it from the tab order`. Add a browser interaction test before claiming navigation is prevented. |
| `serves persisted current wealth` with a stubbed response | `serializes the supplied current-wealth projection`, or use the real PostgreSQL command/query path. |
| `prevents overlapping synchronization runs` with sequential calls | Run two starts concurrently and assert that only one obtains the lease. |
| `explains every excluded account` | Enumerate every supported exclusion reason or narrow the name to the cases in the table. |

### Choosing a boundary without duplicating behavior

Use the most realistic dependency needed to prove a behavior at the smallest
boundary that owns it. Integration tests are preferred over mocks when the
claim depends on persistence or communication between meaningful components;
this is not a reason to replace focused tests of pure policy with slower
end-to-end setup.

Each behavior should have one primary test owner:

- pure calculations, classifications, and transformations belong in unit tests;
- isolated orchestration branches may use small local collaborators and assert
  the orchestration decision, not pretend to prove their persistence semantics;
- transactions, constraints, concurrency, ordering, mapping, and durable history
  belong in integration tests against the real PostgreSQL adapter;
- cross-package tests cover only behavior created by the composition of those
  packages; and
- E2E tests cover a small number of critical user-visible journeys rather than
  repeating every lower-level edge case.

Before adding a test, search for the same behavioral claim elsewhere. Move the
claim to its primary owner and remove or narrow superseded assertions. Repeating
a lower-level outcome at a higher level is justified only when the higher level
adds distinct evidence, such as serialization through GraphQL or presentation
in a browser. In that case, assert the added boundary rather than copying the
lower-level scenario matrix.

For persistence integration tests, create state through public application
operations or granular owner-local helpers backed by the real table models when
practical. Direct SQL is appropriate only for PostgreSQL-specific preconditions
or evidence those APIs cannot express, such as aging a lease, forcing a
constraint failure, or inspecting atomic rollback. Keep that SQL local and do
not let table layout become the domain contract.

Mocks and stubs remain useful for unavailable external systems and narrow
transport behavior. They should be local, minimal, and limited to the
interaction under test. A mocked persistence function does not prove durable
behavior; use the real command/query path with PostgreSQL instead.

### Persistence behavior without contract duplication

Monii has one PostgreSQL implementation. A repository interface plus a reusable
contract plus a PostgreSQL binding therefore adds three places to understand a
single behavior without currently protecting implementation interchangeability.
New persistence work should instead use table models for CRUD and typed named
single-table queries, capability-owned query logic for joins or genuinely
feature-specific projections, and explicit application operations for
multi-table workflows. A model registers each reusable query under a literal
name; `Model.query("query_name").load()`, `.loadOne()`, and `.count()` preserve
that query's inferred result type. Test the observable behavior once beside the
model, query, or operation that owns it, using the real isolated PostgreSQL
database.

Persistence behavior now lives in one owner-local integration test beside its
model, query, or command. PostgreSQL-specific locking, rollback, migration, and
constraint cases stay beside the responsible code. There is no reusable harness
or second copy of a claim for the sole database implementation.

If Monii later gains a genuine second implementation of the same interface, a
shared contract can again be appropriate. That decision should be based on the
real variation, not used pre-emptively to justify an abstraction.

### Modular integration testkit

Every integration file imports `it` and its normal Vitest vocabulary from
`@testkit/integration`. It must not import `it` or `test` directly from
`vitest`. The shared integration API installs one default lifecycle: before the
test's hooks and body run, it starts a fresh PostgreSQL Testcontainer and
applies the committed migrations; afterward, it disposes lazy test resources
and the database in `finally` cleanup.

The active database is propagated through asynchronous context. Production
models, queries, and commands use that active database while retaining their
normal configured-database fallback outside tests. Tests therefore do not
receive or thread a `postgres` fixture parameter.
`@testkit/postgres` exposes the active database only when direct storage setup
or inspection is genuinely required.

PostgreSQL is the only eager integration capability. Everything else is an
independently imported, lazy resource:

- root testkit modules provide generic mechanics, not business scenarios;
- an app owns its endpoint binding under its `test-support` directory;
- tests select a specific app explicitly, such as `@testkit/apps/web`, so a
  future second API cannot collide with a global `graphql` or `http` fixture;
- in-process GraphQL support executes any typed document with variables and
  returns its result; it must not grow operation-specific methods such as
  `currentWealth()`; and
- event-system support is deferred until the production boundary is known.

State support belongs to the package that owns the persisted concept, exposed
to integration tests through virtual imports such as
`@testkit/packages/accounts`. Prefer a small helper that inserts one valid row
or one tightly coupled fact using visible defaults plus typed overrides. A
multi-table helper is justified only when those rows form a stable invariant.
Complex scenario setup stays in the test and composes multiple owner helpers;
do not hide a use case behind a broad `buildWealthScenario`-style method.

`@testkit/*` and owner `test-support` modules are test-only architecture. Lint
permits them only from integration files or other isolated test-support
modules. Production files and unit tests cannot import them. Package manifests
must not export `test-support`, and manifests
must not acquire testkit dependencies: the virtual aliases avoid production
workspace edges and cycles.

### PostgreSQL integration policy

Every integration test receives a PostgreSQL Testcontainer created by the
shared integration lifecycle, even if that test does not currently query it.
The integration suite must never accept an arbitrary database URL, connect to
the Specific development database, reuse a developer's local data, or fall back
to another database.

The accepted initial isolation boundary is one container per individual test:

1. start a pinned PostgreSQL Testcontainer;
2. create the database client from that container's connection URI;
3. apply committed migrations;
4. run the test;
5. close the client and stop the container in `finally` cleanup.

This favors correctness over startup speed. If suite growth makes it too slow,
an optimization to one container with a distinct database per test may be
considered later, but only if it provides equivalent isolation and is recorded
as an explicit change to this policy. A transaction rollback alone is not
equivalent for code that owns transactions, uses multiple connections, or
needs to verify commit and rollback behavior.

No `TEST_DATABASE_URL` escape hatch is allowed. When a supported container
runtime is unavailable, the integration suite must fail fast with one clear
prerequisite message. It must not skip silently and must not ask contributors
to start application infrastructure through Specific.

Specific remains the required owner of application infrastructure and local
runtime workflows. That is separate from integration-test database ownership.
E2E tests may start the application through `specific dev`, but their data must
be test-owned and must never be the ordinary development database.

### Browser testing responsibilities

Playwright MCP, Vitest Browser Mode, and Playwright Test all use browser
automation, but they solve different problems:

- **Playwright MCP** is an interactive browser tool for coding agents. Keep it
  for exploratory checks, debugging, screenshots, accessibility inspection,
  and verifying a change while it is being developed. It is not the committed
  test runner and its conversational steps are not the test suite.
- **Vitest Browser Mode with its Playwright provider** should run isolated React
  component tests in a real browser. These tests remain part of `test:unit`,
  even if the Vitest configuration internally names the project
  `unit-browser`.
- **Playwright Test** should own committed E2E journeys against the running
  application. It provides deterministic test declarations, fixtures,
  assertions, traces, retries, and CI reporting independently of MCP.

Therefore, installing Playwright MCP does not remove the need for a test
runner. Monii should add the relevant direct test dependencies instead of
depending on packages that happen to be transitive dependencies of MCP. See
the upstream [Vitest Browser Mode component testing guide](https://vitest.dev/guide/browser/component-testing.html)
and [Playwright Test introduction](https://playwright.dev/docs/test-intro).

## Remediation tracker

| ID | Priority | Status | Issue | Depends on |
| --- | --- | --- | --- | --- |
| TST-001 | P0 | Fixed | Make PostgreSQL integration tests Testcontainers-only and isolated per test. | — |
| TST-002 | P0 | Fixed | Reduce the public taxonomy to unit, integration, E2E, and repository suites. | — |
| TST-003 | P1 | Fixed | Move tests to their owning package or app and reserve root tests for real boundaries. | TST-002 |
| TST-004 | P1 | Fixed | Rename and reshape tests so every name states exactly what is proved. | TST-002, TST-003 |
| TST-005 | P1 | Open | Replace static-markup interaction claims with real browser component tests. | TST-002 |
| TST-006 | P1 | Open | Establish a deterministic Playwright Test E2E harness and first critical journey. | TST-002 |
| TST-007 | P0 | Fixed | Cover missing financial invariants and failure semantics. | TST-003 |
| TST-008 | P0 | Fixed | Apply reusable persistence-port contract suites to PostgreSQL. | TST-001, TST-003 |
| TST-009 | P1 | Open | Split and deepen Powens boundary coverage. | TST-003 |
| TST-010 | P1 | Open | Make GraphQL tests exercise production contracts without duplicated scaffolding. | TST-003 |
| TST-011 | P1 | Open | Add meaningful coverage reporting that includes untouched source files. | TST-003 |
| TST-012 | P2 | Open | Remove or relocate weak helpers, duplicate builders, and test-only pseudo-production code. | TST-003 |
| TST-013 | P1 | Open | Split CI feedback by suite and retain useful browser/integration diagnostics. | TST-001, TST-005, TST-006 |
| TST-014 | P2 | Fixed | Eliminate noisy expected-error output and nondeterministic global state. | TST-003 |
| TST-015 | P2 | Open | Align testing documentation, scripts, globs, and directory claims with reality. | TST-002, TST-003 |
| TST-016 | P0 | Fixed | Establish a modular integration testkit with an implicit isolated database and owner-local support. | TST-001, TST-003, TST-008 |
| TST-017 | P0 | Fixed | Replace single-implementation repositories and contracts with inherited models, named queries, and operation-owned integration tests. | TST-008, TST-016 |

### TST-001 — Testcontainers-only PostgreSQL isolation

**Problem:** `tests/fixtures/postgres.ts` gives `TEST_DATABASE_URL` precedence
over Testcontainers. `specific.hcl` supplies that variable from
`postgres.main.url`, so the suite migrates and mutates a shared development
database. The fixture starts a container only at worker scope and wraps each
test in a transaction, which does not prove isolation for multi-connection or
transaction-owning behavior.

**Acceptance criteria:**

- [x] The fixture always creates a PostgreSQL Testcontainer; no external URL is
      accepted.
- [x] Each individual database test receives its own container, migrated schema,
      connection, and guaranteed cleanup.
- [x] `TEST_DATABASE_URL` is removed from the fixture and Specific test wiring.
- [x] The suite fails clearly when its container runtime prerequisite is absent.
- [x] At least one regression test proves data from one test cannot be observed
      by another.
- [x] `pnpm test:integration` is the documented command and requires no
      `specific exec` wrapper.

**Fixed (2026-09-10):** the fixture is now test-scoped, provisions only from
`PostgreSqlContainer`, applies migrations for every test, and cleans up the
client and container in `finally` blocks. The Specific database injection and
the old transaction-only isolation were removed. An executable isolation
regression provisions two independent test databases and proves schema changes
cannot cross their container boundary. Verified with `pnpm test:integration` (7 tests),
`pnpm test:unit` (126 tests), `pnpm test:repository` (38 tests), `pnpm typecheck`,
focused ESLint, and `specific check`.

### TST-002 — Honest, minimal suite taxonomy

**Problem:** classification is currently determined mostly by filename. Tests
that spawn a CLI, exercise a full REPL, or run Apollo through an in-memory HTTP
server are selected as `unit`, while `integration` effectively means only
“filename contains `.integration`”. That makes speed, dependencies, and failure
meaning unpredictable.

**Acceptance criteria:**

- [x] Public scripts are limited to `test:unit`, `test:integration`, `test:e2e`,
      and `test:repository`, plus aggregate/watch/coverage variants.
- [x] Every existing test is classified by boundary, not by its historical
      folder.
- [x] CLI subprocess, complete console, and GraphQL client/server tests move to
      integration.
- [x] Internal Node/browser Vitest projects remain implementation details of
      `test:unit`.
- [x] A contributor can infer a test's prerequisites from its suite.

**Fixed (2026-09-10):** native CLI subprocess tests, the complete interactive
console test, GraphQL client/server transport tests, and the application GraphQL
route test now use the `.integration.test.ts` suffix and run only in the
integration project. The isolated Apollo client configuration test remains a
unit test. Verification accounts for all existing tests: 93 unit, 40
integration, and 38 repository tests. The `test:e2e` command will be added with
the real Playwright harness in TST-006 rather than as an empty or misleading
placeholder.

### TST-003 — Ownership-based file structure

**Problem:** root `tests/` has become a catch-all. `tests/wealth/wealth.test.ts`
combines several package-owned capabilities in one 500-line file;
`tests/powens/powens.test.ts` is a 600-line package unit suite;
`tests/runtime/runtime.test.ts`, console tests, and CLI tests also have clear
owners. This separates tests from refactors, obscures missing package coverage,
and encourages generic shared fixtures.

**Acceptance criteria:**

- [x] Package-owned unit tests are colocated beside the source they protect.
- [x] Package-owned integration tests live under their package or app, beside
      source or in a focused `test` directory.
- [x] Root `tests/integration` is absent until a scenario has no primary package
      or app owner.
- [x] Root `tests/support` contains only infrastructure with multiple real
      consumers.
- [x] No empty test category is retained as a promise of future coverage.
- [x] Vitest and TypeScript globs discover the target structure without broad
      accidental matches.

**Fixed (2026-09-11):** package unit tests live in their owning `src`
directories. Integration files are split by capability and live with their
primary owner: CLI help/invocation/discovery, console sessions, web route and
Apollo-client transport, GraphQL server behavior, ingestion lifecycle/listing
behavior, portable port-contract bindings, and PostgreSQL-specific transaction
and lease risks. The former root wealth, GraphQL, PostgreSQL-contract, and
PostgreSQL-synchronization omnibus files were removed. Root `tests` now contains
only cross-cutting testkit infrastructure and repository checks. TypeScript,
GraphQL Codegen, GraphQL config, ESLint paths, README, and engineering
documentation follow the owner-local paths.
Verified with `pnpm test:integration` (57 tests in 18 files),
`pnpm test:unit` (127 tests), `pnpm test:repository`, `pnpm typecheck`,
`pnpm lint`, and `pnpm graphql:check`.

### TST-004 — Exact descriptions and assertions

**Problem:** several names claim more than their assertions establish. Static
HTML tests claim functional disabling, a fake-backed GraphQL test claims
persistence, a sequential scenario claims overlapping-run protection, and some
names say “every” without enumerating every supported case. One button
assertion searches for the substring `disabled`, which can pass because a
Tailwind class contains a `disabled:` variant rather than because the element
has the attribute.

**Acceptance criteria:**

- [x] Every existing test name is audited against its act and assertions.
- [x] Attribute, role, value, and error assertions use semantic matchers or
      parsed structures rather than ambiguous substrings.
- [x] Claims of concurrency use concurrent execution with a controlled barrier.
- [x] Claims of persistence use the real persistence implementation.
- [x] Table-driven tests name each business case in failure output.
- [x] No single test verifies unrelated behavior merely to reduce test count.

**Fixed (2026-09-10):** all existing test names were compared with their setup,
action, and assertions. Overstated static-interaction, fake-persistence,
exhaustive-coverage, and sequential-concurrency claims were narrowed or given
the missing proof. The PostgreSQL overlap scenario now releases two starts
through a controlled barrier and asserts that exactly one acquires the run.
Ambiguous attribute checks now match complete attributes, GraphQL log checks
use parsed records, and environment, CLI invocation, Powens option, and
repository-policy tables print the case being exercised. Omnibus tests were
split where they mixed exit mapping with logging, console evaluation with
context and imports, health with fallback labels, generated queries with
mutations, or independent workspace rules. Verified with `pnpm test:unit` (103
tests), `pnpm test:integration` (43 tests), `pnpm test:repository` (43 tests),
`pnpm typecheck`, and `pnpm lint`.

### TST-005 — Real browser component behavior

**Problem:** web component tests use `renderToStaticMarkup` in the default Node
environment. This can validate emitted HTML, but it never executes event
handlers, focus behavior, browser defaults, hydration, navigation prevention,
or accessibility interactions. The button's interaction lifecycle is therefore
mostly untested.

**Acceptance criteria:**

- [ ] Vitest Browser Mode is configured with a direct Playwright provider
      dependency.
- [ ] Browser component tests run through `pnpm test:unit`.
- [ ] Link/button pending behavior is tested through clicks and keyboard use,
      not only HTML strings.
- [ ] Tests query semantic roles and accessible names.
- [ ] Static rendering remains only where static serialization is the actual
      behavior under test.

### TST-006 — Playwright Test E2E harness

**Problem:** `tests/e2e` contains only `.keep`; there is no committed test that
proves the browser, Next application, GraphQL boundary, and rendered dashboard
work together. Playwright MCP provides valuable exploratory verification but
does not fill this regression role.

**Acceptance criteria:**

- [ ] `@playwright/test` is a direct development dependency with a committed
      configuration.
- [ ] `pnpm test:e2e` starts or targets the application through the documented
      Specific workflow without using ordinary development data.
- [ ] The first journey proves the critical current-wealth dashboard success
      path through the public UI.
- [ ] At least one degraded or unavailable-data state is covered.
- [ ] Failure artifacts include a trace and useful screenshot; CI uploads them.
- [ ] The suite has a documented browser-install prerequisite.

### TST-007 — Financial invariant and failure coverage

**Problem:** the suite has strong examples for exact decimal totals, stale data,
duplicate handling, redaction, and preservation of last-valid values, but
several high-risk rules are unproved. These omissions can change displayed
wealth without producing obvious type or transport failures.

**Cases audited:**

- [x] negative cash and liability-like balances;
- [x] investment estimated value versus balance selection and no double counting;
- [x] explicit inclusion behavior for business accounts;
- [x] duplicate representative tie-breaks and negative-value min/max behavior;
- [x] current-wealth behavior when no snapshot exists;
- [x] direct decimal parser and formatter boundaries;
- [x] disabled and deleted account persistence behavior;
- [x] temporary account absence versus a complete listing that marks it not seen;
- [x] truncated provider listings and whole-connection outages;
- [x] transaction rollback when synchronization finalization fails;
- [x] failure when the fallback `markRunFailed` operation itself fails;
- [x] abandoned synchronization runs;
- [x] genuinely concurrent synchronization starts.

**Acceptance criteria:**

- [x] Each listed invariant has an executable, accurately named test or is
      removed from this list with a documented domain reason.
- [x] Pure policies are tested at their owning package before repeating only
      the most valuable compositions at integration level.
- [x] Monetary examples retain exact decimal-string expectations.
- [x] Failure-path tests assert both returned behavior and durable state.

**Fixed (2026-09-10):** package-owned tests now lock down scale-eight decimal
conversion, signed cash, unsupported liability-like products, investment
valuation authority, explicit business inclusion, deterministic duplicate
selection, negative possible ranges, and the no-snapshot projection. Focused
PostgreSQL scenarios prove lifecycle persistence, truncated-versus-complete
absence handling, whole-connection outage preservation, atomic finalization
rollback, abandoned-run replacement, and concurrent lease acquisition. The
orchestrator also proves that a failed `markRunFailed` fallback is surfaced.
During this work, integration evidence exposed that connection-level degraded
runs could persist a snapshot as complete when no individual account result was
available. Snapshot creation now carries the latest synchronization status into
durable completeness, so partial, failed, or running knowledge cannot be labeled
complete. Verified with `pnpm test:unit` (127 tests), `pnpm test:integration`
(48 tests), `pnpm test:repository` (43 tests), `pnpm typecheck`, and `pnpm lint`.

### TST-008 — Persistence-port contract suites

**Problem:** `packages/postgres/src/repositories/financial-persistence.ts` is a
large implementation of several domain ports. Focused regression scenarios now
cover its highest-risk behavior, but those examples are not yet organized as
reusable port contracts. In-memory test repositories and PostgreSQL can
therefore drift on identity, transaction, observation, lease, and snapshot
semantics.

**Decision:** define focused contract suites next to the packages that own each
port. A contract is a reusable set of observable examples, not a new public
test category. Run those contracts against PostgreSQL in the integration suite;
run them against reusable in-memory implementations only when those fakes are
shared production-quality testing tools rather than one-off stubs.

**Acceptance criteria:**

- [x] Account/institution identity and merge semantics have a port contract.
- [x] Synchronization lease, lifecycle, and failure semantics have a port
      contract.
- [x] Observation and snapshot atomicity/read semantics have a port contract.
- [x] The PostgreSQL adapter passes every relevant contract in isolated
      Testcontainers.
- [x] One-off fakes either pass the same relevant contract or remain deliberately
      local and minimal.
- [x] Existing scenarios moved into contracts are removed or narrowed so each
      behavior has one primary test owner.
- [x] Repository checks reject an orphan contract without its owner-local
      integration binding.

**Fixed (2026-09-11):** reusable contracts live beside the portable owners of
synchronization, account identity, wealth calculation, and wealth-query ports.
Each contract now has an explicit colocated PostgreSQL integration binding with
only its required harness; calling the contract function registers its examples
with Vitest. All writes pass through public repositories or synchronization use
cases, while bindings supply only necessary read-only durable-state probes. The
contracts cover concurrent and independent leases, run failure and source
identity, account and institution identity, durable merge history, observation
retention, snapshot publication and reads, failed refresh preservation, and
account-policy snapshots. Superseded merge, failure, policy, and concurrency
scenarios were removed from the broad integration files. PostgreSQL-only
rollback and abandoned-lease tests remain beside the PostgreSQL implementation.
External-lifecycle and listing-completeness scenarios live beside ingestion.
Local orchestration fakes remain minimal and make no persistence claims.
Verified with `pnpm test:integration` (57 tests in 18 files),
`pnpm test:unit` (127 tests), `pnpm test:repository`, `pnpm typecheck`, and
`pnpm lint`.

This remains the historical record of why contract coverage was introduced.
The later single-database model decision in TST-017 supersedes contracts as the
target architecture. TST-017 moved their behavioral claims to one owner-local
test per operation and then removed the contracts and bindings.

### TST-009 — Powens boundary decomposition

**Problem:** one large test file mixes configuration, URL construction,
transport behavior, normalization, identity material, timestamp handling,
lifecycle states, decimals, and console-only authorization. A single broad
normalization fixture does not adequately cover provider quirks such as missing
fields, DST/time-zone edges, IBAN normalization, stable HMAC fingerprints, or
partial connection data.

**Acceptance criteria:**

- [ ] Tests are split by `config`, `transport`, `source/normalization`, and
      console boundary ownership.
- [ ] Provider DTO examples cover absent, partial, disabled, deleted, and
      malformed optional data without converting unknown values to zero.
- [ ] Timestamp tests include time-zone and DST boundaries relevant to the
      adapter.
- [ ] Identity tests prove canonical IBAN handling and stable, non-reversible
      fingerprint behavior.
- [ ] HTTP behavior is tested at the smallest boundary that still proves URL,
      authentication, error mapping, and response handling.

### TST-010 — Production GraphQL contract coverage

**Problem:** GraphQL testing maintains a synthetic schema, operations, generated
client artifacts, SDL, and a compile-only `hook-contract.ts`. The production
dashboard path is now covered, but document globs remain duplicated across
Codegen, GraphQL config, and ESLint, and Codegen still ignores the no-documents
case even though operations exist.

**Acceptance criteria:**

- [x] A test executes the production dashboard document against the production
      GraphQL schema/server composition with persisted state.
- [x] Query edge cases stay in the query-owned integration test rather than
      being repeated through GraphQL.
- [x] Synthetic schema and generated artifacts are retained only for a distinct,
      stated contract.
- [ ] `hook-contract.ts` becomes an explicit type test or is removed.
- [ ] GraphQL document discovery has one canonical definition or a test proving
      all required tool configurations stay aligned.
- [ ] Stale `ignoreNoDocuments` configuration is removed.

**Progress (2026-09-11):** a colocated web integration test executes the actual
generated dashboard document through the production in-process GraphQL server
and PostgreSQL command/query composition. Its small owner-local setup helpers
create controlled persisted state. This test proves the app-specific wiring,
document serialization, and transport response together; it does not repeat the
query integration test's edge-case matrix. The remaining synthetic-contract and
configuration cleanup keeps this issue open. The old broad GraphQL integration
file is split: production server serialization belongs to `packages/graphql`,
while the synthetic schema and generated documents now belong solely to the
web Apollo client's query, mutation, error-masking, and deadline transport
contract under `apps/web/test-support/graphql-client`.

### TST-011 — Coverage visibility

**Problem:** there is no coverage provider or coverage command. Passing tests
therefore reveal nothing about source files that are never loaded, which is
where the largest blind spots can hide.

**Acceptance criteria:**

- [ ] Coverage tooling is a direct dependency with a documented pnpm command.
- [ ] Coverage includes application/package source globs so untouched files
      appear as zero coverage.
- [ ] Generated files, build output, and type-only declarations are excluded
      explicitly.
- [ ] The initial baseline is recorded before thresholds are chosen.
- [ ] Thresholds protect critical domain packages and ratchet upward without
      encouraging low-value assertion padding.

### TST-012 — Helper and builder discipline

**Problem:** `tests/integration-test.ts` is a one-line re-export;
`tests/http/route.ts` has one consumer; generic builders overlap while hiding
important defaults. At the same time, large suites repeat domain setup. Moving
everything into a global factory would make ownership and business intent even
less clear.

**Acceptance criteria:**

- [ ] Delete pass-through helpers that do not provide a stable capability.
- [ ] Keep single-consumer helpers beside their consumer.
- [ ] Create shared builders only after a second real consumer and give each one
      a narrow domain owner.
- [ ] Defaults are visible or named so tests do not accidentally depend on
      irrelevant magic values.
- [ ] Builders never erase the distinction between provider DTOs, domain inputs,
      persisted records, and read projections.

### TST-013 — CI feedback and diagnostics

**Problem:** CI runs application tests as one `pnpm test` job. It does not expose
which layer failed or account for different prerequisites and costs. There is
no E2E job, coverage report, browser artifact upload, or Storybook interaction
test despite the accessibility addon being configured.

**Acceptance criteria:**

- [ ] Unit, integration, E2E, and repository checks are visible independently.
- [ ] Integration CI provisions a supported container runtime and never shared
      infrastructure.
- [ ] Browser dependencies are installed reproducibly and cached appropriately.
- [ ] E2E traces/screenshots and useful integration logs are retained on failure.
- [ ] Coverage is reported without hiding a failing test command.
- [ ] The role of Storybook build/accessibility checks is explicit; redundant
      pipelines are not added merely because tooling exists.

### TST-014 — Quiet and deterministic execution

**Problem:** expected GraphQL error cases print full error stacks during passing
tests. Some tests also patch process environment or global state without a
single consistent restoration discipline. Noise hides real failures, while
leaked globals create order-dependent flakes.

**Acceptance criteria:**

- [x] Expected errors are captured and asserted without polluting successful
      test output.
- [x] Unexpected errors remain visible.
- [x] Environment, timers, spies, and global mutations are restored through
      runner-supported cleanup.
- [x] Suites pass in randomized or reversed order where the runner supports it.
- [x] No test correctness depends on another test having run first.

**Fixed (2026-09-10):** GraphQL Yoga's raw default error logger is disabled in
favor of Monii's structured masking logger. The error integration test asserts
that expected errors produce no console output while both unexpected failures
remain captured as `graphql.unexpected_error` records without their private
messages. Environment stubs, console spies, client cleanup, and mutable GraphQL
test state now use Vitest cleanup hooks. The PostgreSQL isolation regression no
longer shares a container ID or requires a preceding test; it provisions and
compares two isolated databases inside one self-contained test. The complete
matrix passed in shuffled file and test order with
`pnpm exec vitest run --sequence.shuffle --sequence.seed=1401` (217 tests).
Normal execution was verified with `pnpm test` (127 unit, 47 integration, and
43 repository tests), plus `pnpm typecheck` and `pnpm lint`.

### TST-015 — Documentation and configuration drift

**Problem:** the README's workspace tree still describes the older `wealth` and
`server` packages, the financial-foundation guide recommends running integration
tests through Specific, and GraphQL/test globs are repeated. `tests/e2e/.keep`
suggests coverage that does not exist. These mismatches teach contributors the
wrong architecture.

**Acceptance criteria:**

- [ ] README and canonical engineering documentation describe the actual
      package and test ownership model.
- [ ] No documentation recommends `specific exec` for integration tests.
- [ ] Every documented test command exists and has the described behavior.
- [ ] Empty placeholders and stale TODOs are removed.
- [ ] Durable test policy changes are recorded here rather than scattered across
      tool configuration comments.

### TST-016 — Modular integration testkit and owner-local support

**Problem:** an advanced integration test should be able to stay beside the
behavior it protects while arranging real state through other packages or an
app endpoint. The old database fixture required explicit plumbing, root-level
integration files encouraged ownership drift, and a single broad fixture would
eventually load every app and grow business-specific convenience methods.

**Acceptance criteria:**

- [x] Integration tests are discovered by suffix anywhere under an owning app
      or package, including `src`.
- [x] Every integration file uses the canonical `@testkit/integration` API, with
      lint rules rejecting a missing import or direct Vitest `it`/`test`.
- [x] A fresh migrated PostgreSQL Testcontainer is active before each test's
      hooks and body and is always cleaned up.
- [x] Production PostgreSQL access uses the async-scoped test database by
      default without fixture callback parameters.
- [x] Non-database capabilities load independently and lazily, and app-owned
      bindings identify the specific endpoint being exercised.
- [x] In-process GraphQL support accepts arbitrary typed documents and variables
      without business-operation wrapper methods.
- [x] Owner-local state helpers demonstrate valid, granular inserts with typed
      overrides while the test composes the complex scenario.
- [x] Lint and workspace validation isolate testkit and test-support from
      production, unit tests, and package exports.

**Fixed (2026-09-11):** `@testkit/integration` now establishes the per-test
database and asynchronous integration context. The PostgreSQL client resolves
that active database before its ordinary configured fallback. Generic lazy
resource mechanics and typed GraphQL execution are separate modules; the web
app owns its GraphQL server binding. Accounts and wealth-query own small
single-table insert helpers, and the colocated dashboard integration test
composes them explicitly before calling the real generated operation. Vitest
aliases keep these imports out of package manifests, while lint and repository
tests enforce all import and export boundaries. Verified with `pnpm typecheck`,
`pnpm lint`, `pnpm test:repository`, and `pnpm test:integration` (57 tests in
18 files). The strict database default increased the measured full integration
duration from roughly 48 seconds to 85 seconds; correctness and
uniform availability are the accepted priority, and any future optimization
must preserve per-test isolation.

### TST-017 — Inherited PostgreSQL models and operation-owned tests

**Problem:** Monii has one database implementation, but persistence behavior is
spread across portable repository interfaces, a large combined PostgreSQL
repository, reusable contract definitions, and adapter bindings. That structure
was useful for exposing missing behavior, but it now makes a single concrete
path look like several interchangeable implementations and encourages duplicate
test ownership.

**Decision:** use one lightweight class per table, inheriting typed CRUD from a
shared model base that resolves the active database implicitly. Register
reusable single-table SQL as typed named queries on the owning model; keep joins
and feature-specific projections in their capability. Wrap multi-table
workflows in explicit application operations using an async-context transaction
helper. Migrate contract claims
to one integration test beside the behavior that owns each claim; do not trade
the current contracts for duplicate model, query, and operation tests.

**Acceptance criteria:**

- [x] Every current table has a concrete model inheriting `create`, `find`,
      `findMany`, `update`, and `delete`, including non-`id` and composite keys.
- [x] Model calls automatically use the active integration database and do not
      receive a database fixture or constructor dependency.
- [x] An explicit transaction wrapper propagates one transaction through nested
      model calls, uses savepoints when nested, and supports post-commit effects.
- [x] Integration coverage proves inherited CRUD, rollback, savepoint, and
      post-commit behavior against isolated PostgreSQL.
- [x] Owner-local state helpers begin using models rather than direct testkit
      database access.
- [x] Reusable single-table reads are typed named queries on their owning model;
      joins and purpose-specific projections remain with their capability.
- [x] Multi-table repository writes are moved to explicit application
      operations using the transaction wrapper.
- [x] Existing repository interfaces, factories, implementations, contracts,
      and bindings are removed after their behavior has one replacement owner.
- [x] The complete unit, integration, repository, type, and lint checks pass
      after the migration.

**Fixed (2026-09-12):** PostgreSQL now owns only schema, inherited row Models,
client lifecycle, and async-scoped transaction mechanics. Ingestion and wealth
packages own focused public commands, private commands, custom query logic, and
pure domain policy. No production or test repository interface, factory,
implementation, contract, or binding remains. The CLI and GraphQL surfaces call
commands and queries directly without database injection. Repository-contract
claims were moved once to operation-owned PostgreSQL integration tests, the
mocked synchronization repository unit suite was removed, and the duplicate
mocked GraphQL projection test was removed in favor of the persisted dashboard
boundary. CLI argument variants were consolidated without dropping any inputs,
and the database-isolation regression now reuses its lifecycle-provided database
instead of starting two redundant containers. Verified with `pnpm typecheck`,
`pnpm lint`, `pnpm test:unit` (120 tests), `pnpm test:repository` (47 tests), and
`pnpm test:integration` (42 tests in 20 files). The aggregate `pnpm test` also
passes all 209 tests in 35 files with the integration Testcontainers enabled.

## Recommended implementation order

Fix the foundation before moving files in bulk:

1. TST-001: make database tests safe and deterministic.
2. TST-002: establish the four public suites and honest selection rules.
3. TST-003 and TST-004: move tests to owners while correcting their names and
   assertions in the same focused batches.
4. TST-007 and TST-008: lock down financial policy and persistence contracts.
5. TST-016: provide the modular integration foundation for app-level tests.
6. TST-017: use Models, commands, and queries without duplicate persistence
   contracts.
7. TST-005 and TST-006: add real browser component and E2E coverage.
8. TST-009 and TST-010: deepen provider and GraphQL boundaries.
9. TST-011 through TST-015: make omissions visible, reduce support-code debt,
   and align CI and documentation.

The order is deliberately incremental. Each issue should leave the suite
runnable; a large one-shot directory migration would create review noise and
make accidental semantic changes harder to detect.
