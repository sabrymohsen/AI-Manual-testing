# Code Review: AI Manual QA Tester

**Review Date:** 2026-06-17  
**Scope:** Full-stack Next.js application (backend, frontend, worker, tests, infrastructure)  
**Lines Reviewed:** ~2,500+ lines across 25+ files  

---

## Executive Summary

The codebase is a **feature-rich, well-structured MVP** that largely follows the architecture defined in the spec. The separation of concerns between API routes, Playwright runner, queue worker, and AI modules is clean. However, there are **several security vulnerabilities, bugs, and performance anti-patterns** that should be addressed before the app is used with real data or exposed to multiple users.

**Top 3 priorities:**
1. Fix the auth fallback secret and add project ownership checks to all API routes.
2. Add input validation (Zod) to every API route to prevent injection and data corruption.
3. Fix the `sanitizeUrl` bug and the DB migration running on every import.

---

## 1. Security Issues

### 🔴 Critical

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| 1.1 | **Fallback JWT secret in production** — `process.env.NEXTAUTH_SECRET \|\| "fallback-secret-do-not-use-in-production"` means if the env var is missing, the app uses a hardcoded, predictable secret. | `src/lib/auth/index.ts:6` | Attackers can forge JWTs and impersonate any user. | Remove the fallback. Throw if `NEXTAUTH_SECRET` is not set. |
| 1.2 | **Missing project ownership checks** — Several API routes accept a `projectId` or `runId` but only verify authentication, not that the user owns the resource. This allows IDOR (Insecure Direct Object Reference). | `src/app/api/projects/[projectId]/test-runs/[runId]/route.ts`, `src/app/api/bug-reports/route.ts` (POST), `src/app/api/projects/[projectId]/test-runs/route.ts` (GET) | Any authenticated user can read, modify, or cancel another user's test runs and create bugs in their projects. | Add `project: { userId: session.user.id }` to every Prisma query, or create a reusable `requireProjectOwner` helper. |
| 1.3 | **No input validation** — API routes parse raw JSON and pass it directly to Prisma. Malformed or extra fields can corrupt data or trigger Prisma errors. | Nearly all `route.ts` files | Data corruption, injection-like bugs, 500 errors from bad input. | Add Zod schemas for every route's request body and query params. |
| 1.4 | **No rate limiting** — Login, register, AI generation, and test-run creation are all unprotected. | All auth and AI routes | Brute-force attacks, credential stuffing, API abuse, high AI costs. | Add `rate-limiter-flexible` or a custom middleware for rate limiting. |
| 1.5 | **No CSRF tokens on auth forms** — The login/register pages use standard HTML form posts but no CSRF protection. | `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx` | CSRF attacks on auth endpoints (though `sameSite: lax` mitigates some). | Add CSRF tokens or use NextAuth.js which handles this. |

### 🟠 High

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| 1.6 | **Decrypted passwords linger in memory** — `decryptedPassword` is never cleared after the test run. | `src/lib/playwright/runner.ts:108` | Passwords remain in the Node.js heap for the duration of the worker process. | Use `Buffer` or a secure string wrapper and explicitly overwrite after use. |
| 1.7 | **No `middleware.ts` for auth guard** — The app relies on every route calling `getSession()` manually. This is error-prone and inconsistent. | Missing `src/middleware.ts` | A forgotten `getSession()` check on a new route exposes data. | Add a `middleware.ts` that redirects unauthenticated users from `/dashboard/*` and `/api/*` routes. |
| 1.8 | **Hardcoded localhost in integration notifier** — `http://localhost:3000` is used in Jira/Azure DevOps/OpenProject links. | `src/lib/integrations/notifier.ts:81`, `135`, `191` | Links in external tickets are broken in production. | Use `process.env.NEXTAUTH_URL` or a dedicated `APP_URL` env var. |
| 1.9 | **No audit logging on sensitive operations** — Credential creation, deletion, and test runs don't log to the `AuditLog` table despite the model existing. | `src/app/api/projects/[projectId]/credentials/route.ts`, `src/app/api/projects/[projectId]/test-runs/route.ts` | No traceability for security-sensitive actions. | Call `createAuditLog()` after credential CRUD and test runs. |

---

## 2. Bugs

### 🔴 Critical

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| 2.1 | **`sanitizeUrl` bug in catch block** — The `for` loop iterates over sensitive params but `return`s after the first iteration, so only `password` is ever masked. | `src/lib/sanitize/index.ts:50-55` | URLs with `token`, `api_key`, etc. are **not sanitized** when the URL is malformed. | Replace the loop with a single regex that covers all params, or iterate and mutate the string without returning inside the loop. |
| 2.2 | **DB migration runs on every module import** — `migrateHierarchy()` is called in `src/lib/db/index.ts` at module load time. | `src/lib/db/index.ts:13` | Every serverless function invocation (and every worker start) triggers DB reads/writes. Can cause race conditions and slow cold starts. | Remove the auto-migration. Run it once at deploy time via a CLI script or `prisma migrate` hook. |
| 2.3 | **Network log matching is fragile** — `networkLogs.find((l) => l.url === sanitizeUrl(response.url()) && !l.status)` uses `!l.status` which is falsy for `0` (though `0` is used for failed requests). More importantly, multiple concurrent requests to the same URL can cause cross-matching. | `src/lib/playwright/runner.ts:92`, `101` | Wrong network logs attached to steps; duplicate or missing data. | Use a request ID or a `Map` keyed by Playwright `Request` object reference instead of URL string matching. |

### 🟠 High

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| 2.4 | **`console_no_errors` assertion is a no-op** — It always returns `passed: true` without actually checking console logs. | `src/lib/playwright/assertion-runner.ts:77-86` | Tests using this assertion falsely pass even when console errors exist. | Pass the collected logs into `runAssertions` and check for `"error"` level entries. |
| 2.5 | **Login handler doesn't wait for navigation** — After clicking submit, it waits for `load` state on the current page, which may not indicate a successful login. | `src/lib/playwright/login-handler.ts:36-67` | False positives if login fails but the page reloads. | Wait for a post-login URL or element, or check for an error message. |
| 2.6 | **`page.waitForSelector` is deprecated** in Playwright. | `src/lib/playwright/visual-runner.ts:102` | Will break on future Playwright versions. | Replace with `page.locator(...).waitFor({ state: "visible" })`. |
| 2.7 | **Docker build will fail** — `Dockerfile` expects Next.js `output: 'standalone'` but `next.config.js` is empty. | `Dockerfile:21`, `next.config.js` | `COPY` commands fail because `.next/standalone` doesn't exist. | Add `output: 'standalone'` to `next.config.js`. |
| 2.8 | **Missing `storage/` in `.dockerignore`** — `docker-compose.yml` mounts `./storage`, but the Dockerfile `COPY . .` will copy host `storage/` into the image, potentially overwriting container data. | `Dockerfile`, `docker-compose.yml` | Inconsistent file state between host and container. | Add `storage/` to `.dockerignore`. |
| 2.9 | **Bulk delete bug check logic is flawed** — `otherLinks` query only checks `testCaseId`, but a bug could be linked via `testRunId` or `manualTestSessionId` to other entities. | `src/app/api/projects/[projectId]/test-cases/route.ts:474-489` | Shared bugs may be incorrectly deleted, causing data loss. | Check all link fields (`testCaseId`, `testRunId`, `manualTestSessionId`) in the `otherLinks` query. |

### 🟡 Medium

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| 2.10 | **`fs` and `path` require inside function** | `src/app/api/projects/[projectId]/test-cases/route.ts:338-339` | Minor code smell; modules are re-resolved on every request. | Move `require` to top-level imports. |
| 2.11 | **`any` types used extensively** | `src/lib/playwright/visual-runner.ts`, `src/lib/integrations/notifier.ts`, many API routes | Loss of TypeScript safety, harder refactoring. | Replace with proper interfaces or Prisma-generated types. |
| 2.12 | **`generateEncryptionKey` not base64-padded** | `src/lib/crypto/index.ts:55-57` | `Buffer.from(key, "base64")` may fail if the key contains non-base64 chars or wrong padding. | Ensure the function returns a valid base64 string (it does, but document that the env var must be exactly 32 bytes base64-encoded). |
| 2.13 | **Hardcoded `gpt-4o` model** | `src/lib/ai/generate-test-case.ts:72` | Users cannot switch to cheaper/faster models. | Make the model configurable via env var. |
| 2.14 | **`next.config.js` is empty** | `next.config.js` | Missing image optimization, CSP headers, redirects, etc. | Populate with app-appropriate settings. |
| 2.15 | **`testRunId` reused as BullMQ job ID** | `src/lib/queue/index.ts:49-50` | If a test run is retried, the job ID collides. BullMQ will overwrite or fail depending on settings. | Append attempt number or timestamp to the job ID. |
| 2.16 | **Network log duration always 0** | `src/lib/playwright/runner.ts:96` | No actual duration is captured. | Track request start time and calculate duration on response. |

---

## 3. Performance Issues

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| 3.1 | **Projects list computes metrics in-memory** | `src/app/api/projects/route.ts:82-180` | Loads all projects with heavy includes, then loops through arrays in JS to compute pass rates, coverage, health scores. O(n) with large nested data. | Move aggregations to Prisma's `groupBy` or raw SQL queries, or cache the computed metrics. |
| 3.2 | **Bug reports fetch all user's bugs twice** | `src/app/api/bug-reports/route.ts:148-164`, `176-195` | First `findMany` gets all bugs for summary metrics, then `count`, then another `findMany` for pagination. | Use a single raw SQL query or Prisma aggregation for summary metrics. |
| 3.3 | **Bulk delete loads massive nested graph** | `src/app/api/projects/[projectId]/test-cases/route.ts:381-456` | For a bulk delete of 10 test cases, this loads all test runs, step results, attachments, visual results, bug reports, and their sub-relations. | Delete in a cascading Prisma transaction without pre-loading all data; rely on `onDelete: Cascade` in the schema. |
| 3.4 | **No database indexes beyond defaults** | `prisma/schema.prisma` | Queries on `projectId`, `userId`, `testRunId`, `status`, `createdAt` will scan large tables. | Add `@index` fields for frequently queried columns (`projectId`, `userId`, `status`, `createdAt`, `testRunId`). |
| 3.5 | **Visual diff uses full-page screenshot** | `src/lib/playwright/visual-runner.ts:132` | Full-page screenshots are slow and may not match Figma frame dimensions. | Use viewport-sized screenshots (`fullPage: false`) or match the Figma frame dimensions. |
| 3.6 | **`open_url` waits for `domcontentloaded`** | `src/lib/playwright/step-executor.ts:67` | For SPAs, `domcontentloaded` fires before the app is ready. | Consider `waitUntil: "networkidle"` or wait for a specific app element. |
| 3.7 | **`removeOnComplete: 100` caps job history** | `src/lib/queue/index.ts:41` | Only 100 completed jobs are kept. For debugging, this is limiting. | Increase or make configurable based on env. |

---

## 4. Architecture & Design

### What's Good

- **Clean phase separation** — The plan's phases (Foundation → Credentials → Test Cases → Worker → Reports → AI → Figma → Integrations) are reflected in the code structure.
- **Worker isolation** — Playwright runs in a separate BullMQ worker process, never inside the API request lifecycle. ✅
- **AES-256-GCM encryption** for credentials and integration tokens. ✅
- **Sanitization layer** for logs and network data before storage. ✅
- **Modular lib structure** — `crypto`, `sanitize`, `storage`, `reports`, `ai`, `figma` are well-separated.
- **Docker Compose setup** with health checks for Postgres and Redis. ✅
- **Prisma schema is comprehensive** — covers all planned features including hierarchy, visual checks, requirements, and manual test sessions.

### What Needs Improvement

| # | Issue | Recommendation |
|---|-------|--------------|
| 4.1 | **No Zod schemas used despite dependency** | The `src/schemas/` directory is empty. Create Zod schemas for all API inputs and validate before touching Prisma. |
| 4.2 | **No API versioning** | If external integrations rely on these routes, add `/api/v1/` prefix. |
| 4.3 | **No health check endpoint** | Add `/api/health` that checks DB, Redis, and Playwright availability. |
| 4.4 | **No API documentation** | Consider OpenAPI/Swagger generation from Zod schemas (e.g., `zod-to-openapi`). |
| 4.5 | **No database seeding** | Add a `prisma/seed.ts` for initial admin user, sample project, and test data. |
| 4.6 | **No error boundary or global error handler** | Add a Sentry integration or a global error handler that catches unhandled worker exceptions. |
| 4.7 | **Missing `middleware.ts`** | Add route protection middleware to reduce boilerplate and prevent accidental exposure. |
| 4.8 | **Queue connection logic is redundant** | `connectionOptions()` parses `REDIS_URL` but also falls back to individual env vars. This is fine but could be simplified. |
| 4.9 | **No feature flags** — AI, Figma, and Integrations are always enabled if configured. | Add `isEnabled` checks at the UI level so users can toggle features per project. |
| 4.10 | **No pagination on some list endpoints** | `test-cases` and `test-runs` list routes don't paginate, which will be slow with 100+ items. | Add `skip`/`take` to all list queries. |

---

## 5. Testing Gaps

| # | Gap | Priority |
|---|-----|----------|
| 5.1 | **No API integration tests** — `tests/integration/` is empty. | High |
| 5.2 | **No E2E tests** — `playwright.config.ts` exists but `tests/e2e/` is empty. | High |
| 5.3 | **No worker tests** — `test-runner.worker.ts` and `visual-runner.ts` are untested. | High |
| 5.4 | **No tests for `runner.ts`** — The core Playwright runner is not tested. | High |
| 5.5 | **No tests for `sanitizeUrl` bug** — The existing `sanitize.test.ts` doesn't cover the catch block path. | Medium |
| 5.6 | **No tests for auth edge cases** — Missing tests for expired tokens, missing env vars, and concurrent logins. | Medium |
| 5.7 | **No tests for integration notifier** — `tests/unit/integrations.test.ts` exists but I couldn't verify its content. | Medium |
| 5.8 | **No tests for visual diff** — `pixelmatch` logic and image resizing are untested. | Medium |
| 5.9 | **No tests for Figma URL parser** | Medium |
| 5.10 | **No tests for hierarchy resolution** | `resolveHierarchyIds` is complex but untested. | Medium |

---

## 6. File-Specific Notes

### `src/lib/auth/index.ts`
- **Line 6:** Remove fallback secret.
- **Line 112:** `sameSite: "lax"` is okay but `strict` would be better for a QA tool that doesn't need cross-site cookie behavior.
- **Missing:** Refresh token rotation, password strength validation on registration, and email verification.

### `src/lib/crypto/index.ts`
- Solid implementation. AES-256-GCM with IV and auth tag is correct.
- **Missing:** Key rotation support. If `keyVersion` changes, old secrets can't be decrypted. Add a migration path for key rotation.

### `src/lib/playwright/runner.ts`
- **Line 50:** `chromium.launch({ headless })` — consider exposing `args: ['--no-sandbox']` for Docker environments.
- **Line 108-131:** Decrypted password handling should be wrapped in a try/finally to clear the variable.
- **Lines 63-106:** Console/network log collection is good but the matching logic (see Bug 2.3) needs fixing.
- **Line 280-287:** `notifyIntegrations` is called after the runner finishes, but if the runner crashes, the notification might still be attempted in the `finally` block? Actually no, it's in the success path only. Should probably be in the `try` block before `finally`.

### `src/app/api/projects/route.ts`
- **Line 277-300:** `POST` accepts `body` directly without validation. Extra fields are passed to Prisma `create`.
- **Lines 34-275:** The GET handler does too much work in-memory. Offload to DB or cache.

### `src/app/api/projects/[projectId]/test-cases/route.ts`
- **Lines 339-340:** `require` calls inside the function.
- **Lines 598+:** The DELETE handler is extremely long and complex. Consider extracting the deletion logic to a service file.

### `src/lib/integrations/notifier.ts`
- **Line 21:** `as any` cast on Prisma query — unsafe.
- **Lines 80-81, 135, 191:** Hardcoded `localhost:3000`.
- **Lines 71-118:** Jira integration assumes a specific REST API version. Should be documented or configurable.
- **Missing:** Retry logic for failed integration webhooks.

### `src/lib/ai/generate-test-case.ts`
- **Line 72:** Hardcoded `gpt-4o`.
- **Line 38:** System prompt is well-constructed but could be more strict about `targetType` values.
- **Missing:** No retry logic for AI API failures. No timeout on the `fetch` call.

---

## 7. Recommended Action Plan

### Phase 1 — Security Hardening (Do First)
1. Remove JWT fallback secret; enforce env-only.
2. Add `requireProjectOwner()` helper and apply it to **every** route that accepts a `projectId` or nested resource ID.
3. Add Zod schemas and validate **all** API inputs.
4. Add rate limiting to auth, AI, and test-run endpoints.
5. Add `src/middleware.ts` for global auth guard.

### Phase 2 — Bug Fixes
1. Fix `sanitizeUrl` catch block logic.
2. Remove auto-migration from `db/index.ts`; run it via a one-off script.
3. Fix network log matching in `runner.ts`.
4. Fix `console_no_errors` assertion to actually check logs.
5. Fix `next.config.js` for Docker standalone output.

### Phase 3 — Performance & Reliability
1. Add DB indexes for common query columns.
2. Rewrite `projects/route.ts` GET to use DB aggregations instead of in-memory loops.
3. Simplify bulk delete logic to rely on Prisma cascades.
4. Add retry logic and timeouts to AI and integration `fetch` calls.
5. Add proper error handling in the worker (restart on crash, alert on repeated failures).

### Phase 4 — Testing
1. Write integration tests for all CRUD API routes using Supertest + test database.
2. Write E2E tests for login → create project → create test case → run test → view report.
3. Add unit tests for `runner.ts`, `visual-runner.ts`, and `sanitizeUrl` edge cases.
4. Add a CI pipeline (GitHub Actions) that runs `lint`, `test`, and `test:e2e`.

### Phase 5 — Polish
1. Add API health check endpoint.
2. Add database seed script.
3. Document env vars and setup steps in `README.md`.
4. Add feature flags for AI, Figma, and Integrations.
5. Review and add proper pagination to all list endpoints.

---

## Overall Grade

| Category | Grade | Notes |
|----------|-------|-------|
| **Architecture** | B+ | Well-structured, clean separation, matches spec. |
| **Security** | C | Several vulnerabilities (fallback secret, missing authz, no rate limiting). |
| **Code Quality** | B- | Good TypeScript usage but too many `any`s, missing validation, some code smells. |
| **Performance** | C+ | In-memory aggregations, missing DB indexes, heavy bulk delete. |
| **Testing** | D | Only unit tests for isolated modules. No integration or E2E coverage. |
| **Reliability** | B | Worker separation is good, but missing retries, error boundaries, and health checks. |
| **Overall** | **B-** | Solid MVP with real potential, but needs security and validation fixes before production use. |
