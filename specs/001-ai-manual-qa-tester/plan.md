# Implementation Plan: AI Manual QA Tester

**Branch**: `master` | **Date**: 2026-06-15 | **Spec**: `specs/001-ai-manual-qa-tester/spec.md`

**Input**: Feature specification from `specs/001-ai-manual-qa-tester/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command.

## Summary

Build a full-stack web application for QA engineers to create testing projects, manage role-based credentials, write structured test cases, execute browser-based functional tests via Playwright in a background worker, collect full observability (screenshots, console logs, network logs, JS errors), compare actual vs expected results, generate test/bug reports, and optionally use AI for test case generation. The architecture uses Next.js (App Router) frontend + API, PostgreSQL + Prisma for data, Redis + BullMQ for background job queue, and a dedicated Playwright worker for browser automation.

## Technical Context

**Language/Version**: TypeScript (Node.js 20+)

**Primary Dependencies**: 
- Frontend: Next.js 14+ App Router, Tailwind CSS, shadcn/ui, lucide-react, React Hook Form, Zod, TanStack Table, Recharts
- Backend: Next.js API routes, Prisma ORM, BullMQ, Redis
- Automation: Playwright (Node.js API, Chromium)
- AI: OpenAI-compatible API (sanitized input only)
- Visual Diff: pixelmatch, pngjs
- Crypto: Node.js crypto (AES-256-GCM)

**Storage**: PostgreSQL (primary data), Redis (queue), local filesystem under /storage (screenshots, logs, traces, exports)

**Testing**: Vitest (unit tests), Playwright (E2E tests), Supertest (API integration tests)

**Target Platform**: Linux server (Docker), macOS for development

**Project Type**: Web application (Next.js full-stack + background worker)

**Performance Goals**: Test execution via background worker (never in-request), test run reports loadable within 5 seconds, Markdown export within 10 seconds

**Constraints**: AES-256-GCM encryption for all stored secrets, credentials never exposed to frontend or AI, logs sanitized before storage, Playwright never runs inside API request lifecycle

**Scale/Scope**: MVP targets single-user/small-team usage; up to 10 projects, 100 test cases, 10 concurrent test runs via queue

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- ✅ **I. Build Phase by Phase**: Implementation follows strict phase order (Foundation → Credentials → Test Cases → Worker → Reports → Bug Reports → AI → Figma → Integrations). No Figma before functional runner stable. AI does not control browser in MVP.
- ✅ **II. Testing Standards**: Unit tests for crypto, figma parser, log sanitizer, assertion parser, visual diff, report generator. Integration tests for CRUD operations, queue jobs, worker updates. E2E tests for user flows.
- ✅ **III. User Experience Consistency**: shadcn/ui component patterns, enums for statuses/priorities, JSON for test data/assertions, proper loading/error/empty states, consistent tabbed layout.
- ✅ **IV. Security & Credential Protection**: AES-256-GCM encryption, env-only encryption key, server-side only decryption, credentials never to AI, sanitized logs, audit trails for credential usage.
- ✅ **V. Performance & Reliability**: BullMQ + Redis queue, dedicated Playwright worker, screenshots before/after each step, full log collection, retry support, cancellation support.

No violations. Complexity tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-manual-qa-tester/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Technical research and decisions
├── data-model.md        # Entity-relationship design
├── quickstart.md        # Validation guide
├── contracts/           # API contracts
└── tasks.md             # Task breakdown (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── (auth)/             # Login, Register pages
│   ├── (dashboard)/        # Protected pages
│   │   ├── dashboard/      # Dashboard page
│   │   ├── projects/       # Project list + CRUD
│   │   ├── projects/[id]/  # Project details (tabbed)
│   │   ├── test-cases/     # Test case list + editor
│   │   ├── test-runs/      # Test run details
│   │   ├── bug-reports/    # Bug reports
│   │   └── settings/       # App settings
│   └── api/                # API routes
│       ├── auth/           # Auth endpoints
│       ├── projects/       # Project CRUD
│       ├── credentials/    # Credential management
│       ├── test-cases/     # Test case CRUD
│       ├── test-runs/      # Test run management
│       └── exports/        # Report exports
├── components/             # Shared React components
│   ├── ui/                 # shadcn/ui components
│   └── forms/              # Form components
├── lib/
│   ├── auth/               # Auth helpers (NextAuth/custom JWT)
│   ├── db/                 # Prisma client
│   ├── crypto/             # AES-256-GCM encrypt/decrypt
│   ├── figma/              # Figma API client
│   ├── ai/                 # AI module (OpenAI-compatible)
│   ├── playwright/         # Playwright step executor
│   ├── queue/              # BullMQ job management
│   ├── reports/            # Markdown/PDF/Excel/ZIP generators
│   ├── storage/            # File storage (local, S3 later)
│   └── sanitize/           # Log sanitizer
├── workers/
│   └── test-runner.worker.ts  # BullMQ worker for Playwright
├── types/                  # TypeScript type definitions
└── schemas/                # Zod validation schemas

prisma/
└── schema.prisma           # Database schema

storage/                    # File storage root
├── screenshots/
├── figma/
├── diffs/
├── traces/
├── videos/
└── exports/

tests/
├── unit/                   # Unit tests (vitest)
├── integration/            # Integration tests
└── e2e/                    # E2E tests (Playwright)
```

**Structure Decision**: Next.js App Router full-stack application (Option 2). The backend is integrated into Next.js API routes and server actions. The Playwright worker runs as a separate process. Shared libraries under `src/lib/`. All file storage under `/storage/`.

## Complexity Tracking

No Constitution violations. Complexity tracking not required.

## Phases

This plan is executed in phases consistent with the Build Phase by Phase principle:

- **Phase 1 — Foundation**: Next.js project setup, Tailwind, auth, PostgreSQL + Prisma schema, dashboard layout, project CRUD, settings
- **Phase 2 — Credentials Vault**: Credential CRUD, AES-256-GCM encryption, audit log, masked UI
- **Phase 3 — Test Case Management**: Test case CRUD, step builder, structured actions, assertions
- **Phase 4 — Playwright Worker**: Redis + BullMQ, test job model, worker process, browser automation, screenshot/log/network capture
- **Phase 5 — Test Execution UI**: Role selection, live progress, step results, screenshot viewer, logs panels
- **Phase 6 — Reports & Bug Reports**: Test run report, Markdown export, bug report from failed step
- **Phase 7 — AI-Assisted Testing**: AI settings, prompt box, test case generation, review-then-save
- **Phase 8 — Figma Visual Comparison**: Figma config, URL parser, frame fetch, pixelmatch diff
- **Phase 9 — Advanced Features**: PDF/Excel/ZIP export, integrations, S3 storage, scheduling
