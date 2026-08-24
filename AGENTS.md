
## Package Management

- Use `pnpm` for all package management and script execution.
- Use the pnpm version declared in `package.json`.
- Do not use `npm` or `yarn`

## Development

- Follow the existing project structure and conventions.
- Prefer TypeScript for application code.
- Reuse existing utilities, components, and abstractions before introducing new ones.
- Avoid adding dependencies unless they provide clear value.
- Before adding a dependency, check whether the runtime, platform, or an existing dependency already provides the required functionality.
- Keep changes focused on the requested task.
- Do not refactor or reformat unrelated code.
- Prefer explicit, readable code over clever or overly generic implementations.
- Keep simple operations locally understandable without requiring unnecessary navigation across many files or layers.
- Keep public APIs and exported surfaces as small as practical.

Before considering a change complete, run the relevant checks defined in `package.json`.

## Architecture

- Respect the existing module and dependency boundaries.
- Keep business logic separate from framework, transport, persistence, and infrastructure concerns where practical.
- Keep API/route handlers thin.
- Prefer colocating code with the feature that owns it over creating generic shared abstractions prematurely.
- Prefer composition over inheritance.
- Prefer clear boundaries over adding more layers.
- Do not introduce layers, services, repositories, interfaces, or other abstractions solely to satisfy an architectural pattern or hypothetical future extensibility.
- Avoid pass-through abstractions that add no meaningful policy, translation, validation, orchestration, or isolation.
- Prefer the simplest design that cleanly satisfies the current requirements while leaving an obvious path to evolve.
- Do not introduce new top-level directories or architectural patterns without a clear need.

### Project Structure

- Keep directories easy to scan and conceptually cohesive.
- When a directory becomes crowded with unrelated or loosely related files, consider grouping them into meaningful subdirectories or proposing a clearer structure rather than continuing to flatten the directory.
- Organize directories by responsibility or feature when appropriate, not merely by file type.
- Do not introduce subdirectories unless they improve discoverability, cohesion, or establish a useful boundary.

### Abstractions

- Prefer adapters or interfaces when behavior or an external dependency needs to vary across implementations.
- Do not replace simple method parameters with abstractions when the parameter is merely data or configuration.
- Avoid premature shared abstractions.
- Extract shared code when it represents the same concept, not merely similar syntax.
- A small amount of duplication is preferable to an incorrect or premature abstraction.

### Types and Models

- Do not create separate DTOs, entities, models, structs, or classes for every architectural layer by default.
- Reuse a type across boundaries when its meaning, invariants, and representation are genuinely the same.
- Introduce a separate type when a boundary has materially different validation, serialization, ownership, lifecycle, or domain semantics.
- Avoid mapping between structurally identical types without a clear architectural reason.
- Use types to protect meaningful invariants, but avoid introducing wrapper types that add no meaningful semantics.

## Tests

- Keep application and business-behavior tests separate from repository, tooling, and development quality checks.
- Tests for generated-file freshness, file-size limits, architectural constraints, repository conventions, schema drift, or similar development-only guarantees should live in dedicated test files.
- Do not mix development/tooling checks into domain or application behavior test suites.
- Keep tests focused on observable behavior rather than implementation details where practical.
- When behavior changes, update or add the relevant tests.

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
