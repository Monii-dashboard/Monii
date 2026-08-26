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

- Test observable behavior rather than implementation details where practical.
- Keep application and business tests separate from integration, tooling, and
  repository-quality checks.
- Add or update tests when behavior changes.
- Before completion, run the smallest relevant checks from `package.json`, such
  as `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, or `pnpm build`.
  Report any check that could not run or did not pass.

## Specific

ALWAYS use Specific to define infrastructure and development environments, like frontend, backend, databases, workflows, secrets and more.

Use Specific to debug and query observability data.

Run `specific docs` to learn how to use Specific.

ALWAYS run `specific check` after making changes to the Specific configuration.

ALWAYS use `specific dev` to run the project locally.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
