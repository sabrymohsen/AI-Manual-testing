---
name: playwright-e2e
description: Write, run and debug Playwright end-to-end tests for this repo (tests/e2e, playwright.config.ts) or for a site under test, using resilient locators, web-first assertions, fixtures and page objects. Use when asked to automate a flow, write an E2E/UI test, convert a manual test case to automation, or fix a failing Playwright test.
---

# Playwright E2E tests

## This repo
- Config: `playwright.config.ts` — `testDir: ./tests/e2e`, `baseURL: http://localhost:3000`,
  reuses a running `npm run dev`, trace on first retry, screenshot on failure.
- Run: `npx playwright test` · one file `npx playwright test tests/e2e/auth.spec.ts` ·
  one test `-g "title"` · headed `--headed` · step through `--debug` · UI mode `--ui`.
- Report: `npx playwright show-report`; trace: `npx playwright show-trace <trace.zip>`.
- Browsers missing? `npx playwright install chromium`.

## Writing tests
1. Start from a manual test case: each step → one action + one assertion.
2. **Locators**, in this order: `getByRole(role, { name })` → `getByLabel` →
   `getByPlaceholder` → `getByText` → `getByTestId` (`data-testid`) → CSS as last
   resort. Never XPath, nth-child chains or generated class names.
   Scope to a region: `page.getByRole("dialog").getByRole("button", { name: "Save" })`.
3. **Web-first assertions only**: `await expect(locator).toBeVisible()/toHaveText()/toHaveURL()`.
   Never `waitForTimeout`; wait on a UI state or `page.waitForResponse(url)`.
4. **Independent tests**: each creates its own data (unique names with `Date.now()`),
   no order dependency, cleans up when it can. Prefer creating data through the API
   (`request` fixture) and testing only the UI part that matters.
5. **Auth once**: a setup project that logs in and saves `storageState`, reused by
   tests, instead of logging in through the UI in every test.
6. **Page objects / fixtures** for pages used by 3+ tests (`tests/e2e/pages/*.ts`);
   keep assertions in the test, not hidden in page objects.
7. Cover negative paths and permissions, not just the happy path. Tag with
   `test.describe("@smoke ...")` / `@regression` and filter with `--grep @smoke`.
8. Network control when needed: `page.route()` to mock slow/failed APIs.

## Debugging a failure
Read the error + trace (DOM snapshot, network, console at the failing step) before
changing code. Decide: product bug (file it, see `bug-report`), test bug (bad locator,
missing wait, shared data), or environment (server down, seed missing). For
intermittent failures use `flaky-test-triage`. Don't "fix" by adding timeouts or retries.

Finish by running the changed spec at least 3 times (`--repeat-each=3`) green.
