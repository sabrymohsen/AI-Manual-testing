<!--
Sync Impact Report:
- Version change: N/A (initial) → v1.0.0 (initial ratification)
- Core Principles created from scratch: I. Build Phase by Phase, II. Testing Standards, III. User Experience Consistency, IV. Security & Credential Protection, V. Performance & Reliability
- Added Section: Security & Compliance Requirements
- Added Section: Development Workflow
- Templates requiring updates: ✅ plan-template.md (constitution check section aligns), ✅ spec-template.md (security/credential requirements align), ✅ tasks-template.md (phase structure aligns)
- No deferred placeholders
-->

# AI Manual QA Tester Constitution

## Core Principles

### I. Build Phase by Phase

Build incrementally, never skipping ahead. Follow the approved implementation order: Foundation → Credentials → Test Cases → Playwright Worker → Reports → Bug Reports, then AI Test Generation, then Figma Visual Comparison, then Integrations. Do not build Figma comparison before the functional runner is stable. Do not allow AI to control browser freely in MVP. Use structured test actions and assertions — plain text steps are not reliable enough for automation. Do not run Playwright directly inside normal API request lifecycle — use queue and worker for test execution. Make UI simple first, beautiful second. Prioritize reliability over fancy AI behavior. Each phase must be independently testable before moving to the next.

### II. Testing Standards

Every feature must be validated at multiple levels. Unit tests are required for: encryption/decryption helpers, Figma URL parser, log sanitizer, assertion parser, visual diff helper, and report generator. Integration tests are required for: project CRUD, credential creation, test case creation, queue job creation, worker status updates, and test run result saving. End-to-end tests (using Playwright) are required for: user login, create project, add credential, create test case, start test run, view report, and generate bug report. Manual QA verification MUST confirm: role-based execution selects correct credentials, password secrets are never exposed in UI or logs, screenshots are captured before/after each step, network errors are stored, and failed steps generate bug reports.

### III. User Experience Consistency

All UI pages must follow the established component patterns and consistent layout. Use enums (not free-text) for statuses, priorities, and types. Use JSON fields for test data and assertions. Every interactive page must have proper loading states, error handling, and empty states. Follow the defined page structure for: Login/Register (public), Dashboard (stats cards + recent activity), Project List (search + filter + CRUD), Project Details (tabbed: Overview, Credentials, Test Cases, Test Runs, Visual Comparison, Bug Reports, Settings), Test Case Editor (metadata + step builder + assertions editor), Test Execution (role selection + live progress + logs panel), and Bug Reports (list + filter + export).

### IV. Security & Credential Protection

All credentials and API tokens MUST be encrypted using AES-256-GCM. Store encrypted value, IV, auth tag, and key version. The encryption key must live ONLY in the `APP_ENCRYPTION_KEY` environment variable — never commit to Git, never log, never expose to frontend. Decryption is server-side only during test execution. Credentials must NEVER be sent to AI systems. All logs must be sanitized before storage: mask Authorization headers, Cookie headers, Set-Cookie headers, password fields, token parameters, API keys, session IDs, and bearer tokens. Credential usage must be recorded in audit logs with user, project, role, timestamp, and action.

### V. Performance & Reliability

Test execution MUST use a queue and background worker (BullMQ + Redis). Never execute browser tests inside a normal web request lifecycle. The Playwright worker must support: browser launch with isolated context, configurable viewport, login with selected credentials, sequential step execution, screenshot capture before and after each step, console log collection, network request/response log collection, JavaScript error detection, failed API request detection, page crash detection, and timeout error detection. Each step must capture actual result and compare against expected result. The worker must support retry and cancellation. Step results support: Pending, Running, Passed, Failed, Blocked, Warning, Skipped. Test run statuses support: Queued, Running, Passed, Failed, Blocked, Warning, Cancelled.

## Security & Compliance Requirements

Technology stack is non-negotiable:
- Frontend: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui components, lucide-react icons, React Hook Form, Zod validation, TanStack Table, Recharts
- Backend: Next.js API routes / server actions, BullMQ queue, Redis, Prisma ORM, PostgreSQL
- Automation: Playwright Node.js API, Chromium (default), Playwright tracing, screenshots, network interception, console log collection
- AI: OpenAI-compatible API only — AI must never receive passwords, tokens, cookies, or sensitive headers
- Storage (MVP): Local file storage under /storage
- Deployment: Docker, Docker Compose with separate containers for web, worker, PostgreSQL, Redis

Environment configuration requires: DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, APP_ENCRYPTION_KEY, APP_ENCRYPTION_KEY_VERSION, OPENAI_COMPATIBLE_API_KEY, OPENAI_COMPATIBLE_BASE_URL, FIGMA_API_TOKEN, STORAGE_ROOT, PLAYWRIGHT_HEADLESS, PLAYWRIGHT_DEFAULT_BROWSER.

## Development Workflow

All features must follow the Speckit workflow: specify → plan → tasks → implement, with review gates between each phase. The approved implementation strategy is:

1. **Phase 1 — Foundation**: Next.js setup, Tailwind CSS, authentication, PostgreSQL + Prisma, Prisma schema, dashboard layout, project CRUD, settings page
2. **Phase 2 — Credentials Vault**: Credential CRUD, AES-256-GCM encryption, server-side decryption, audit log, masked credential UI
3. **Phase 3 — Test Case Management**: Test case list, editor, step builder, structured action fields, assertions JSON, test data JSON
4. **Phase 4 — Playwright Worker**: Redis setup, BullMQ, test job model, worker process, browser launch, screenshot/log/network capture, step status
5. **Phase 5 — Test Execution UI**: Role selection modal, live progress, step-by-step results, screenshot viewer, logs panels
6. **Phase 6 — Reports & Bug Reports**: Test run report page, Markdown export, bug report from failed step, attachment linking
7. **Phase 7 — AI-Assisted Test Creation**: AI settings, prompt box, test case generation, review-then-save, failure explanation
8. **Phase 8 — Figma Visual Comparison**: Figma config, URL parser, frame fetch, pixelmatch diff, diff image, result page
9. **Phase 9 — Advanced Features**: PDF/Excel/ZIP export, integrations (Jira, Azure DevOps, GitHub, Slack, Teams), S3 storage, scheduling

Each phase must pass security review (credential handling, log sanitization, AI safety) before moving to the next.

## Governance

This constitution supersedes all other project practices. Amendments require: (1) documented rationale in AGENTS.md, (2) approval through the review gate process, (3) migration plan for affected phases. All pull requests and feature reviews must verify compliance with these principles. Complexity must be justified — when a violation of "Build Phase by Phase" is proposed, the Complexity Tracking section of the plan must explain why. Use `AGENTS.md` for runtime development guidance. The constitution is versioned using MAJOR.MINOR.PATCH: MAJOR for backward-incompatible principle removals/redefinitions, MINOR for new principles or materially expanded guidance, PATCH for clarifications and refinements.

**Version**: 1.0.0 | **Ratified**: 2026-06-15 | **Last Amended**: 2026-06-15
