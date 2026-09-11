# Repository Instructions

## Required Context

Before planning, implementing, or reviewing application changes, read:

- `docs/product.md` for product intent, V1 scope, and user-visible behavior.
- `docs/domain-and-engineering.md` for domain concepts, boundaries, and deferred
  decisions.

Skip them only for isolated work that cannot affect application behavior or
architecture.

Accepted decisions in these documents are binding. If an explicit user request
supersedes one, identify the conflict and update the affected document in the
same change. If code and documentation disagree, investigate which is
intentional; do not change documentation merely to justify accidental behavior.

Deferred items are not decisions. When a task needs one, choose the simplest
evidence-backed, reversible option consistent with the documented principles
and record it if durable. Ask when the choice changes product semantics or is
costly or hard to reverse.

## Package Management

- Use `pnpm` for all package management and script execution.
- Use the pnpm version declared in `package.json`.
- Do not use `npm` or `yarn`.

## Engineering Principles

- Follow existing structure and conventions. Prefer TypeScript for application
  code.
- Keep changes focused. Do not refactor or reformat unrelated code.
- Reuse the runtime and existing dependencies, utilities, and components before
  adding another dependency or abstraction.
- Keep business logic separate from framework, transport, persistence, and
  infrastructure concerns where practical. Keep routes thin.
- Colocate code by feature or responsibility. Add structure only for clearer
  cohesion, discovery, or a real boundary.
- Prefer the simplest sufficient design. Do not add layers, services,
  repositories, interfaces, or pass-through abstractions for hypothetical use.
- Add adapters or interfaces only for meaningful variation or external
  boundaries. Share code for the same concept, not merely similar syntax.
- Reuse types when meaning and invariants match. Separate them only for real
  validation, serialization, ownership, lifecycle, or domain differences.
- Prefer explicit local code, small public APIs, and composition.

## Frontend Styling and Components

- Use semantic design tokens from `apps/web/src/styles/theme/`; never consume
  private `--palette-*` values from components. Keep the ordered theme imports
  in `theme/index.css` and expose reusable roles through its Tailwind adapter.
- Use Tailwind utilities in `className` for normal layout, spacing, typography,
  color, borders, breakpoints, and interaction states. Keep repeated variant
  recipes as typed component-level constants or maps.
- Use a colocated CSS Module only when CSS is materially clearer: complex
  pseudo-elements, layered visual effects, unusual geometry, or keyframes. Do
  not move ordinary component styling into a large page stylesheet.
- Use inline styles only for genuinely runtime values, such as measured
  positions, contribution widths, or data-series CSS variables. Do not use
  inline style objects for static visual rules.
- Keep global CSS limited to imports, resets, tokens, and truly global behavior.
  Do not add feature or component selectors to `globals.css`.
- Split React code by responsibility and ownership, not arbitrary file size.
  Keep route and client data boundaries thin, colocate domain-specific UI under
  its feature, and place reusable application chrome outside feature folders.
  Extract shared abstractions only when there is a real second consumer or a
  stable independent responsibility.
- For a new component, start with semantic Tailwind utilities, feed dynamic
  values through semantic CSS variables, and add the smallest possible CSS
  Module only for visual mechanics utilities cannot express clearly.

## Financial Domain Guardrails

- Powens and future integrations are data sources, not the domain model.
  Normalize provider-specific payloads at the integration boundary.
- Domain objects own their identities; provider IDs are external references.
- Missing financial data is normal. Preserve partial usefulness, and never
  silently convert an unknown value to zero.
- Aggregate wealth from each account's latest usable EUR valuation. Never count
  an account value and its underlying positions or cash twice.
- Keep synchronization outside the dashboard read path. On failure, preserve
  last-valid data, history, and enough provenance to explain freshness.

## Documentation Stewardship

- Update `docs/product.md` when behavior, scope, or user-visible financial
  semantics change.
- Update `docs/domain-and-engineering.md` when domain concepts, boundaries, or
  durable engineering principles change.
- Prefer an existing canonical document. Create a focused one only for
  repository-specific, reusable knowledge that needs independent detail.
- For libraries and frameworks, document Monii-specific usage, decisions, and
  traps instead of copying upstream documentation.
- Link new documents from the nearest canonical document, and from the README
  when they become primary entry points.
- Keep docs concise; avoid speculative plans and repeated rules.

## Tests

- Read `docs/testing.md` before planning, adding, moving, or substantially
  changing tests. Its suite boundaries, placement rules, infrastructure policy,
  and remediation decisions are binding.
- Test observable behavior rather than implementation details where practical.
- Keep application and business tests separate from integration, tooling, and
  repository-quality checks.
- Give each behavior one primary test owner. Before adding a test, search for an
  existing claim at another level; consolidate or remove overlap unless the new
  test proves a distinct boundary risk. Higher-level tests should assert the
  boundary or journey they add, not repeat lower-level edge-case matrices.
- Prefer the real implementation when behavior depends on a meaningful boundary.
  In particular, prove persistence, transactions, constraints, concurrency,
  query semantics, and durable history with the PostgreSQL adapter in an
  isolated Testcontainer, not with an in-memory fake or mocked repository.
- Prefer creating integration-test state through public application or port APIs.
  Use direct SQL only for PostgreSQL-specific setup or verification that the
  public API cannot express, and keep it local to the adapter test.
- Keep unit tests for pure policy, deterministic transformations, and isolated
  orchestration decisions. Use mocks or stubs only when the collaborator's
  interaction is the behavior under test or when it represents an external
  boundary; do not use them to claim integration or persistence behavior.
- When a domain port owns durable semantics, define one reusable contract suite
  beside the package that owns the port and apply it to each real reusable
  implementation, including the first. A contract is a set of observable
  examples, not a new public test category. Local one-off fakes should stay
  minimal; do not turn them into stateful alternate implementations merely for
  tests.
- When extracting a contract, move the shared behavioral assertions into it and
  delete or narrow superseded tests. Keep adapter-specific tests only for risks
  unique to that adapter.
- Keep each port contract beside its owning portable package and invoke it from
  one colocated `*.integration.test.ts` binding per real adapter. The binding
  owns only the harness that contract requires. Put implementation-specific
  transaction, locking, migration, or constraint tests beside the adapter
  source instead of mixing them into the portable contract.
- Integration tests may live beside the owning source or under `test`, but must
  use the `.integration.test.ts` or `.integration.test.tsx` suffix. Import
  `it`, `describe`, hooks, assertions, and `vi` from `@testkit/integration`;
  never import `it` or `test` directly from Vitest in an integration file.
- The integration lifecycle automatically creates and migrates a fresh
  PostgreSQL Testcontainer for every test, before its hooks and body. Do not
  add database fixture parameters or external database fallbacks. PostgreSQL
  repository factories should use the active integration database by default;
  import `@testkit/postgres` only for necessary direct setup or inspection.
- Keep non-database integration capabilities independently importable and lazy.
  Put app-specific in-process endpoint bindings under that app's
  `test-support`, select the app explicitly, and keep transport helpers generic
  over operations and variables. Do not add business-operation methods to a
  global testkit.
- Put persisted-state helpers under the owning package's `test-support`. Keep
  them granular: create one valid row or tightly coupled fact from explicit
  defaults with typed overrides. Compose complex arrangements in the test from
  several owner helpers. Add a multi-table helper only for a stable invariant,
  not merely to shorten one scenario.
- Treat `@testkit/*` and `test-support` as isolated test-only APIs. They may be
  imported only by integration tests and other test-support modules, never by
  production code, unit tests, or portable contract suites. Do not expose
  test-support through package manifests or add production workspace
  dependencies for it.
- Add or update tests when behavior changes.
- Before completion, run the smallest relevant checks from `package.json`, such
  as `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, or `pnpm build`.
  Report any check that could not run or did not pass.

## Specific

ALWAYS use Specific to define application infrastructure and development
environments, like frontend, backend, databases, runtime workflows, secrets and
more. Repository CI quality checks may use GitHub Actions; they do not define
application infrastructure or runtime workflows.

Use Specific to debug and query observability data.

Run `specific docs` to learn how to use Specific.

ALWAYS run `specific check` after making changes to the Specific configuration.

ALWAYS use `specific dev` to run the project locally.

## Browser Verification

For work that affects user-visible rendering or browser interaction, use the
repository `web-browser-testing` skill when live browser verification is
warranted. Keep tool-specific workflow details in that skill rather than
duplicating them here.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
