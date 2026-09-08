---
name: web-browser-testing
description: Exercise and inspect Monii's live web UI with Playwright MCP when implementing, debugging, or verifying browser-visible behavior under apps/web. Use for rendering, responsive layout, interactions, accessibility structure, and browser console or network diagnosis; skip for backend-only work that cannot affect a page.
---

# Web Browser Testing

Use Playwright MCP for exploratory verification of the actual Monii web
application. Keep durable assertions in the repository's automated test suites;
an MCP browser session is evidence and diagnosis, not a replacement for tests.

## Run the application

- Follow the repository requirement to start the application with `specific dev`.
- Use the public web URL reported by Specific. Wait for the service to be ready
  before navigating.
- If Playwright reports that its browser executable or system dependencies are
  missing, run
  `pnpm mcp:playwright:install-browser` once for the current environment.
- Treat rendered financial information, browser storage, network payloads, and
  generated artifacts as sensitive. Prefer synthetic test data for repeatable
  verification and never expose secrets in output.

## Inspect and interact

- Navigate to the relevant page and use Playwright's page snapshot to locate
  elements and understand the accessible structure before interacting.
- Exercise the smallest representative user flow for the change. Inspect browser
  console messages or network requests when they are relevant to the behavior.
- Check additional viewport sizes only when responsive behavior is in scope.
- Playwright MCP can capture viewport, full-page, or element screenshots. Do not
  capture screenshots as a default completion step; use them when the user asks
  for one or when visual evidence is materially useful.

## Report

- State which page and behavior were exercised and report console, network, or
  rendering failures that affect the result.
- If live verification cannot run, report the concrete blocker and the automated
  checks that still ran. Do not claim browser verification from source inspection
  alone.
