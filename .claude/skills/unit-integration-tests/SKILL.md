---
name: unit-integration-tests
description: Write and run Vitest unit and integration tests for this repo's TypeScript code (src/lib, API route handlers, workers) in tests/unit and tests/integration, with good mocking of Prisma and external services. Use when asked to add tests, raise coverage, test a function/module/API route, or write a regression test for a bug fix.
---

# Unit & integration tests (Vitest)

## This repo
- Config `vitest.config.ts`: node environment, includes `tests/**/*.test.ts`.
- Unit tests: `tests/unit/*.test.ts`. Integration: `tests/integration/*.test.ts`
  (they use `tests/integration/setup.ts`, which points Prisma at a separate
  `<db>_test` database — never at the dev database).
- Run all `npx vitest run`; one file `npx vitest run tests/unit/x.test.ts`;
  by name `-t "name"`; watch `npx vitest`; coverage `npx vitest run --coverage`.
- Imports use the `@/` alias for `src/`.

## What to test
- Pure logic first (`src/lib/**`): parsers, mappers, validators, status rules,
  selectors/locator builders — table-driven with `it.each`.
- For each function: happy path, each branch, boundaries, invalid input, and the
  error message/throw.
- API route handlers: call the exported `GET/POST` with a `Request`, mock auth
  (`requireProjectOwner`, session) and assert status codes (200/400/401/403/404) and body.
- **Bug fix → regression test first**: write the test that fails on the bug, then fix.

## Mocking
- `vi.mock("@/lib/db", () => ({ prisma: { testCase: { findMany: vi.fn() } } }))`
  for unit tests; mock only what the code calls.
- Mock network (`fetch`, AI providers, Jira/OpenProject clients) — tests must never
  call real external services or need API keys.
- Fake timers (`vi.useFakeTimers()`) for retries, polling, timeouts.
- Reset between tests: `beforeEach(() => vi.clearAllMocks())`.

## Quality bar
Tests assert behaviour, not implementation details; no snapshot of huge objects;
deterministic (no real time, randomness or ordering). Run the full suite before
finishing and report the pass count.
