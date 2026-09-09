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
    test/**/*.integration.test.ts    spawned CLI behavior
  console/
    src/**/*.test.ts                 isolated module behavior
    test/**/*.integration.test.ts    complete REPL/composition behavior
  web/
    src/**/*.test.tsx                isolated browser component behavior
packages/
  accounts/src/**/*.test.ts
  ingestion/src/**/*.test.ts
  wealth-calculation/src/**/*.test.ts
  wealth-query/src/**/*.test.ts
  powens/src/**/*.test.ts
  postgres/test/**/*.integration.test.ts
  graphql/test/**/*.integration.test.ts
tests/
  integration/                       only true cross-package scenarios
  e2e/**/*.e2e.spec.ts               Playwright Test journeys
  repository/**/*.test.mjs           repository-quality checks
  support/                            cross-cutting test infrastructure only
```

This is a direction, not a requirement to create every directory immediately.
Empty placeholder directories and speculative helpers should not be committed.

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
| `serves persisted current wealth` with a fake repository | `serializes the current-wealth projection returned by the repository`, or use the real PostgreSQL adapter. |
| `prevents overlapping synchronization runs` with sequential calls | Run two starts concurrently and assert that only one obtains the lease. |
| `explains every excluded account` | Enumerate every supported exclusion reason or narrow the name to the cases in the table. |

### PostgreSQL integration policy

Every PostgreSQL integration test must use a PostgreSQL Testcontainer created
by the test fixture. The integration suite must never accept an arbitrary
database URL, connect to the Specific development database, reuse a developer's
local data, or fall back to another database.

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
| TST-004 | P1 | Open | Rename and reshape tests so every name states exactly what is proved. | TST-002, TST-003 |
| TST-005 | P1 | Open | Replace static-markup interaction claims with real browser component tests. | TST-002 |
| TST-006 | P1 | Open | Establish a deterministic Playwright Test E2E harness and first critical journey. | TST-002 |
| TST-007 | P0 | Open | Cover missing financial invariants and failure semantics. | TST-003 |
| TST-008 | P0 | Open | Apply reusable persistence-port contract suites to PostgreSQL. | TST-001, TST-003 |
| TST-009 | P1 | Open | Split and deepen Powens boundary coverage. | TST-003 |
| TST-010 | P1 | Open | Make GraphQL tests exercise production contracts without duplicated scaffolding. | TST-003 |
| TST-011 | P1 | Open | Add meaningful coverage reporting that includes untouched source files. | TST-003 |
| TST-012 | P2 | Open | Remove or relocate weak helpers, duplicate builders, and test-only pseudo-production code. | TST-003 |
| TST-013 | P1 | Open | Split CI feedback by suite and retain useful browser/integration diagnostics. | TST-001, TST-005, TST-006 |
| TST-014 | P2 | Open | Eliminate noisy expected-error output and nondeterministic global state. | TST-003 |
| TST-015 | P2 | Open | Align testing documentation, scripts, globs, and directory claims with reality. | TST-002, TST-003 |

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
regression proves consecutive tests receive distinct containers and cannot see
each other's schema changes. Verified with `pnpm test:integration` (7 tests),
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
- [x] Package-owned integration tests live under that package or app's `test/`
      directory.
- [x] Root `tests/integration` contains only scenarios spanning multiple owners.
- [x] Root `tests/support` contains only infrastructure with multiple real
      consumers.
- [x] No empty test category is retained as a promise of future coverage.
- [x] Vitest and TypeScript globs discover the target structure without broad
      accidental matches.

**Fixed (2026-09-10):** package unit tests now live in their owning `src`
directories; CLI, console, and web route integration tests live under their
apps; and the former combined wealth unit file was split across ingestion,
wealth-calculation, and wealth-query. Root `tests` now contains only
cross-package wealth and GraphQL integration scenarios, their generated/support
artifacts, PostgreSQL test infrastructure, and repository checks. The empty E2E
placeholder and one-line integration re-export were removed. App TypeScript
includes, GraphQL Codegen, GraphQL config, ESLint paths, README, and engineering
documentation were updated with the move. Verified with 93 unit tests, 40
integration tests, 38 repository tests, `pnpm typecheck`, `pnpm lint`, and
`pnpm graphql:check`.

### TST-004 — Exact descriptions and assertions

**Problem:** several names claim more than their assertions establish. Static
HTML tests claim functional disabling, a fake-backed GraphQL test claims
persistence, a sequential scenario claims overlapping-run protection, and some
names say “every” without enumerating every supported case. One button
assertion searches for the substring `disabled`, which can pass because a
Tailwind class contains a `disabled:` variant rather than because the element
has the attribute.

**Acceptance criteria:**

- [ ] Every existing test name is audited against its act and assertions.
- [ ] Attribute, role, value, and error assertions use semantic matchers or
      parsed structures rather than ambiguous substrings.
- [ ] Claims of concurrency use concurrent execution with a controlled barrier.
- [ ] Claims of persistence use the real persistence implementation.
- [ ] Table-driven tests name each business case in failure output.
- [ ] No single test verifies unrelated behavior merely to reduce test count.

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

**Missing cases:**

- negative cash and liability-like balances;
- investment estimated value versus balance selection and no double counting;
- explicit inclusion behavior for business accounts;
- duplicate representative tie-breaks and negative-value min/max behavior;
- current-wealth behavior when no snapshot exists;
- direct decimal parser and formatter boundaries;
- disabled and deleted account persistence behavior;
- temporary account absence versus a complete listing that marks it not seen;
- truncated provider listings and whole-connection outages;
- transaction rollback when synchronization finalization fails;
- failure when the fallback `markRunFailed` operation itself fails;
- abandoned synchronization runs;
- genuinely concurrent synchronization starts.

**Acceptance criteria:**

- [ ] Each listed invariant has an executable, accurately named test or is
      removed from this list with a documented domain reason.
- [ ] Pure policies are tested at their owning package before repeating only
      the most valuable compositions at integration level.
- [ ] Monetary examples retain exact decimal-string expectations.
- [ ] Failure-path tests assert both returned behavior and durable state.

### TST-008 — Persistence-port contract suites

**Problem:** `packages/postgres/src/repositories/financial-persistence.ts` is a
large implementation of several domain ports, but only five broad integration
stories cover it. In-memory test repositories and PostgreSQL can therefore
drift on identity, transaction, observation, lease, and snapshot semantics.

**Decision:** define focused contract suites next to the packages that own each
port. A contract is a reusable set of observable examples, not a new public
test category. Run those contracts against PostgreSQL in the integration suite;
run them against reusable in-memory implementations only when those fakes are
shared production-quality testing tools rather than one-off stubs.

**Acceptance criteria:**

- [ ] Account/institution identity and merge semantics have a port contract.
- [ ] Synchronization lease, lifecycle, and failure semantics have a port
      contract.
- [ ] Observation and snapshot atomicity/read semantics have a port contract.
- [ ] The PostgreSQL adapter passes every relevant contract in isolated
      Testcontainers.
- [ ] One-off fakes either pass the same relevant contract or remain deliberately
      local and minimal.

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

**Problem:** GraphQL tests maintain a synthetic schema, operations, generated
client artifacts, SDL, and a compile-only `hook-contract.ts`. They prove useful
pieces, but the production `currentWealthDashboardQuery` is not exercised
through the actual Apollo-to-Yoga/TypeGraphQL composition. Document globs are
duplicated across Codegen, GraphQL config, and ESLint, and Codegen still ignores
the no-documents case even though operations now exist.

**Acceptance criteria:**

- [ ] A test executes the production dashboard document against the production
      GraphQL schema/server composition with a controlled repository.
- [ ] A PostgreSQL-backed test is added only where it proves behavior not already
      covered by the resolver and repository contracts.
- [ ] Synthetic schema and generated artifacts are retained only for a distinct,
      stated contract.
- [ ] `hook-contract.ts` becomes an explicit type test or is removed.
- [ ] GraphQL document discovery has one canonical definition or a test proving
      all required tool configurations stay aligned.
- [ ] Stale `ignoreNoDocuments` configuration is removed.

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

- [ ] Expected errors are captured and asserted without polluting successful
      test output.
- [ ] Unexpected errors remain visible.
- [ ] Environment, timers, spies, and global mutations are restored through
      runner-supported cleanup.
- [ ] Suites pass in randomized or reversed order where the runner supports it.
- [ ] No test correctness depends on another test having run first.

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

## Recommended implementation order

Fix the foundation before moving files in bulk:

1. TST-001: make database tests safe and deterministic.
2. TST-002: establish the four public suites and honest selection rules.
3. TST-003 and TST-004: move tests to owners while correcting their names and
   assertions in the same focused batches.
4. TST-007 and TST-008: lock down financial policy and persistence contracts.
5. TST-005 and TST-006: add real browser component and E2E coverage.
6. TST-009 and TST-010: deepen provider and GraphQL boundaries.
7. TST-011 through TST-015: make omissions visible, reduce support-code debt,
   and align CI and documentation.

The order is deliberately incremental. Each issue should leave the suite
runnable; a large one-shot directory migration would create review noise and
make accidental semantic changes harder to detect.
