---
name: api-testing
description: Test REST/HTTP APIs manually or with automation (curl, Playwright request fixture, Postman/Newman) — status codes, schemas, validation, auth/permissions, error handling, idempotency and basic performance. Use when asked to test an API, endpoint, route handler, webhook, or integration, or to write API tests.
---

# API testing

## Find the contract
For this repo the routes live in `src/app/api/**/route.ts` (Next.js handlers). Read
the handler: accepted methods, params/body (zod schemas), auth guard
(`requireProjectOwner`, session), Prisma calls, and every response status.
For external APIs use the OpenAPI spec or a Postman collection (Postman plugin).

## Checklist per endpoint
- **Happy path**: correct status (200/201/204), body shape and types, headers (content-type).
- **Validation**: missing required fields, wrong types, empty strings, too long,
  invalid enum values, extra fields → 400 with a useful message, nothing written.
- **Auth**: no session → 401; another user's/project's resource → 403 or 404;
  each role (Owner/Admin/Member/Viewer, Global Admin) gets what it should.
- **Not found / conflict**: unknown id → 404; duplicate → 409.
- **Side effects**: the DB/tracker state after the call (read it back via a GET).
- **Idempotency**: repeat PUT/DELETE; double POST (double-click) doesn't duplicate.
- **Errors**: upstream failure (tracker/AI down) gives a clean 5xx/502 message, no stack trace or secrets.
- **Security basics**: IDs from other tenants, SQL/HTML injection in strings, mass assignment (setting fields like `role`).
- **Performance smell**: response time, N+1 on list endpoints, pagination limits.

## Tools
- Quick manual: `curl -s -i -X POST http://localhost:3000/api/... -H 'Content-Type: application/json' -d '{...}'`
  (authenticated routes need the session cookie from a logged-in test account).
- Automated in this repo: Playwright `request` fixture in `tests/e2e/api/*.spec.ts`,
  or handler-level Vitest tests (see `unit-integration-tests`).
- Postman collections + `newman run` for shared suites.

Never run destructive or bulk calls against production or real tracker projects
without the user's explicit OK.
