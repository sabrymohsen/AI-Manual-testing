---

description: "Task list for AI Manual QA Tester implementation"

---

# Tasks: AI Manual QA Tester

**Input**: Design documents from `specs/001-ai-manual-qa-tester/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are included for unit, integration, and E2E testing.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Next.js App Router**: `src/app/`, `src/lib/`, `src/components/`
- Pages under `src/app/(dashboard)/` for protected routes
- API routes under `src/app/api/`
- Worker in `src/workers/`
- Prisma schema at `prisma/schema.prisma`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, configuration

- [X] T001 Create Next.js 14+ project with TypeScript, Tailwind CSS, App Router in project root
- [X] T002 [P] Install and configure shadcn/ui with base theme in `src/components/ui/`
- [X] T003 [P] Install lucide-react, React Hook Form, Zod, TanStack Table, Recharts in package.json
- [X] T004 [P] Install Playwright and browser dependencies with `npx playwright install chromium`
- [X] T005 [P] Set up ESLint and Prettier configuration at project root
- [X] T006 Create `.env.example` with all required environment variables
- [X] T007 Create `.dockerignore` and `.gitignore` for Node.js + Docker project
- [X] T008 Create Dockerfile and docker-compose.yml with web, worker, postgres, redis services

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure MUST be complete before ANY user story

- [X] T009 Set up Prisma with PostgreSQL connection in `prisma/schema.prisma`
- [X] T010 Define all Prisma enums and models (User, Project, ProjectCredential, TestCase, TestStep, TestRun, TestStepResult, Log, NetworkLog, VisualComparisonResult, BugReport, Attachment, AuditLog, FigmaConfig, TestJob) in `prisma/schema.prisma`
- [X] T011 Run Prisma migration and generate client with `npx prisma migrate dev --name init`
- [X] T012 [P] Implement auth helpers (register, login, session management) in `src/lib/auth/`
- [X] T013 [P] Implement Prisma client singleton in `src/lib/db/`
- [X] T014 [P] Implement crypto module (AES-256-GCM encrypt/decrypt) in `src/lib/crypto/`
- [X] T015 [P] Implement log sanitizer in `src/lib/sanitize/`
- [X] T016 [P] Implement file storage module in `src/lib/storage/`
- [X] T017 [P] Implement BullMQ queue setup in `src/lib/queue/`
- [X] T018 Create base layout with sidebar navigation in `src/app/(dashboard)/layout.tsx`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Project & Credential Management (Priority: P1) 🎯 MVP

**Goal**: Users can create projects with target URLs, environments, browser settings, and manage role-based encrypted credentials

**Independent Test**: Register, create project with URL/environment/browser/viewport, add 2 role credentials, verify passwords masked in UI

### Implementation for User Story 1

- [X] T019 [P] [US1] Create login page in `src/app/(auth)/login/page.tsx`
- [X] T020 [P] [US1] Create register page in `src/app/(auth)/register/page.tsx`
- [X] T021 [P] [US1] Implement auth API routes (register, login, logout, session) in `src/app/api/auth/`
- [X] T022 [P] [US1] Create project list page with search and environment filter in `src/app/(dashboard)/projects/page.tsx`
- [X] T023 [P] [US1] Create project form (create/edit) page in `src/app/(dashboard)/projects/new/page.tsx` and `src/app/(dashboard)/projects/[id]/edit/page.tsx`
- [X] T024 [P] [US1] Create project detail page with tabbed layout (Overview, Credentials, Test Cases, Test Runs, Bug Reports, Settings) in `src/app/(dashboard)/projects/[id]/page.tsx`
- [X] T025 [US1] Implement project CRUD API routes in `src/app/api/projects/`
- [X] T026 [P] [US1] Create credentials list UI in project detail (Credentials tab) with `src/components/credentials/credentials-list.tsx`
- [X] T027 [P] [US1] Create credential form (add/edit) with masked password field in `src/components/credentials/credential-form.tsx`
- [X] T028 [US1] Implement credential CRUD API routes with AES-256-GCM encryption in `src/app/api/projects/[projectId]/credentials/`
- [X] T029 [US1] Implement audit log creation on credential usage in `src/lib/auth/audit.ts`
- [X] T030 [P] [US1] Create dashboard stats page in `src/app/(dashboard)/dashboard/page.tsx` with `src/components/dashboard/stats-cards.tsx` and `src/components/dashboard/recent-activity.tsx`
- [X] T031 [P] [US1] Implement dashboard API routes (stats, recent) in `src/app/api/dashboard/`
- [X] T032 [P] [US1] Create settings page in `src/app/(dashboard)/settings/page.tsx`
- [X] T033 [US1] Implement settings API routes in `src/app/api/settings/`

**Checkpoint**: User Story 1 complete — user can register, login, create/edit/delete projects, manage credentials with encrypted passwords, view dashboard

---

## Phase 4: User Story 2 — Structured Test Case Management (Priority: P1)

**Goal**: Users can create test cases with structured, machine-executable steps

**Independent Test**: Create test case with 3 steps (open_url, fill, click), each with expected result + assertions, verify saved correctly

### Implementation for User Story 2

- [X] T034 [P] [US2] Create test case list page with search, module filter, priority filter in `src/app/(dashboard)/projects/[id]/test-cases/page.tsx`
- [X] T035 [US2] Create test case editor page with step builder in `src/app/(dashboard)/projects/[id]/test-cases/new/page.tsx` and `src/app/(dashboard)/projects/[id]/test-cases/[tcId]/edit/page.tsx`
- [X] T036 [P] [US2] Create step builder component (add/edit/reorder steps) in `src/components/test-cases/step-builder.tsx`
- [X] T037 [P] [US2] Create assertion builder component in `src/components/test-cases/assertion-builder.tsx`
- [X] T038 [P] [US2] Create test data JSON editor component in `src/components/test-cases/test-data-editor.tsx`
- [X] T039 [US2] Implement test case CRUD API routes in `src/app/api/projects/[projectId]/test-cases/`

**Checkpoint**: User Story 2 complete — user can create/edit/delete test cases with structured steps, assertions, and test data

---

## Phase 5: User Story 3 — Playwright Test Execution with Role Selection (Priority: P1)

**Goal**: Users can run test cases via background Playwright worker with role selection, screenshots, logs, and network capture

**Independent Test**: Create 2-step test case (navigate, assert visible), run with role selection, watch live progress, see pass/fail with screenshots

### Implementation for User Story 3

- [X] T040 [P] [US3] Create test execution role selection modal in `src/components/test-runs/role-select-modal.tsx`
- [X] T041 [P] [US3] Create live execution progress page in `src/app/(dashboard)/projects/[id]/test-runs/[runId]/page.tsx`
- [X] T042 [P] [US3] Create step result component (status, screenshots, duration) in `src/components/test-runs/step-result.tsx`
- [X] T043 [P] [US3] Create screenshots viewer component (before/after) in `src/components/test-runs/screenshot-viewer.tsx`
- [X] T044 [P] [US3] Create console logs panel component in `src/components/test-runs/console-logs-panel.tsx`
- [X] T045 [P] [US3] Create network logs panel component in `src/components/test-runs/network-logs-panel.tsx`
- [X] T046 [P] [US3] Create progress polling hook in `src/lib/hooks/use-test-run-progress.ts`
- [X] T047 [US3] Implement test run API routes (create, list, get, cancel, progress) in `src/app/api/projects/[projectId]/test-runs/`
- [X] T048 [US3] Create BullMQ worker entry point in `src/workers/test-runner.worker.ts`
- [X] T049 [US3] Implement Playwright runner module (browser launch, context setup) in `src/lib/playwright/runner.ts`
- [X] T050 [US3] Implement step executor (action dispatch by actionType) in `src/lib/playwright/step-executor.ts`
- [X] T051 [US3] Implement assertion runner in `src/lib/playwright/assertion-runner.ts`
- [X] T052 [US3] Implement login handler (credential decryption + login flow) in `src/lib/playwright/login-handler.ts`
- [X] T053 [US3] Implement screenshot capture (before/after each step) in `src/lib/playwright/screenshot-capture.ts`
- [X] T054 [US3] Implement console log collection in `src/lib/playwright/console-collector.ts`
- [X] T055 [US3] Implement network log collection (request/response interception, sanitization) in `src/lib/playwright/network-collector.ts`
- [X] T056 [US3] Implement worker status updates (step results, test run status) via Prisma in `src/workers/test-runner.worker.ts`

**Checkpoint**: User Story 3 complete — user can run tests via worker, see live progress, view per-step screenshots, logs, and network data

---

## Phase 6: User Story 4 — Test Run Reports & Bug Reports (Priority: P2)

**Goal**: Users can view detailed test run reports and generate structured bug reports from failed steps. Reports exportable as Markdown.

**Independent Test**: After failed test run, open report, see failure with screenshots, create bug report, export Markdown

### Implementation for User Story 4

- [X] T057 [P] [US4] Create test run report page (overall status, duration, browser, viewport, role, per-step results) in `src/app/(dashboard)/projects/[id]/test-runs/[runId]/report/page.tsx`
- [X] T058 [P] [US4] Create bug report list page with severity/priority filters in `src/app/(dashboard)/projects/[id]/bug-reports/page.tsx`
- [X] T059 [P] [US4] Create bug report form (manual and from failed step) in `src/components/bug-reports/bug-report-form.tsx`
- [X] T060 [P] [US4] Create bug report detail page in `src/app/(dashboard)/projects/[id]/bug-reports/[bugId]/page.tsx`
- [X] T061 [US4] Implement bug report CRUD API routes in `src/app/api/projects/[projectId]/bug-reports/`
- [X] T062 [P] [US4] Implement Markdown report generator in `src/lib/reports/markdown-generator.ts`
- [X] T063 [US4] Implement report export API routes (Markdown) in `src/app/api/exports/`
- [X] T064 [US4] Implement ZIP export (report + screenshots + logs) in `src/lib/reports/zip-generator.ts`
- [X] T065 [US4] Create export buttons UI in report page component

**Checkpoint**: User Story 4 complete — user can view reports, create bug reports from failures, export Markdown and ZIP

---

## Phase 7: User Story 5 — AI-Assisted Test Case Generation (Priority: P3)

**Goal**: Users can describe test scenarios in natural language and have AI generate structured test cases for review and approval

**Independent Test**: Type "Test login with invalid password", AI generates 4-step test case, user edits step 2, approves and saves

### Implementation for User Story 5

- [X] T066 [P] [US5] Implement AI module (OpenAI-compatible client with input sanitization) in `src/lib/ai/generate-test-case.ts`
- [X] T067 [P] [US5] Implement AI failure analysis module in `src/lib/ai/explain-failure.ts`
- [X] T068 [P] [US5] Implement AI bug report draft module in `src/lib/ai/draft-bug-report.ts`
- [X] T069 [US5] Implement AI API routes (generate test case, explain failure, draft bug report) in `src/app/api/ai/`
- [X] T070 [P] [US5] Create AI prompt input UI (text area with generate button) in `src/components/ai/prompt-input.tsx`
- [X] T071 [P] [US5] Create AI-generated test case preview (review before save) in `src/components/ai/generated-test-case-preview.tsx`

**Checkpoint**: User Story 5 complete — user can generate test cases from natural language, review, edit, and approve before saving

---

## Phase 8: User Story 6 — Visual Design Comparison (Priority: P4)

**Goal**: Users can configure Figma URLs, fetch frame images, and compare against actual web screenshots with pixel-level diff

**Independent Test**: Configure Figma URL and token, sync frame, run comparison, see reference, actual, diff images with mismatch %

### Implementation for User Story 6

- [X] T072 [P] [US6] Implement Figma URL parser (extract file key, node ID) in `src/lib/figma/url-parser.ts`
- [X] T073 [P] [US6] Implement Figma API client (fetch frame image) in `src/lib/figma/api-client.ts`
- [X] T074 [P] [US6] Implement visual diff engine (pixelmatch + pngjs) in `src/lib/playwright/visual-diff.ts`
- [X] T075 [P] [US6] Create Figma config UI (API token, URL, tolerance) in project Settings tab — `src/components/figma/figma-config.tsx`
- [X] T076 [P] [US6] Create visual comparison result UI (reference, actual, diff images, mismatch %) in `src/components/figma/comparison-result.tsx`
- [X] T077 [US6] Implement Figma API routes (sync, compare) in `src/app/api/projects/[projectId]/figma/`

**Checkpoint**: User Story 6 complete — user can compare Figma designs against actual screenshots with diff overlay

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T078 [P] Create unit tests for crypto module in `tests/unit/crypto.test.ts`
- [X] T079 [P] Create unit tests for log sanitizer in `tests/unit/sanitize.test.ts`
- [X] T080 [P] Create unit tests for Figma URL parser in `tests/unit/figma-url-parser.test.ts`
- [X] T081 [P] Create unit tests for Markdown report generator in `tests/unit/markdown-generator.test.ts`
- [X] T082 [P] Create integration tests for auth API in `tests/integration/auth.test.ts`
- [X] T083 [P] Create integration tests for project CRUD API in `tests/integration/projects.test.ts`
- [X] T084 [P] Create integration tests for credential CRUD API in `tests/integration/credentials.test.ts`
- [X] T085 [P] Create integration tests for test case CRUD API in `tests/integration/test-cases.test.ts`
- [X] T086 [P] Create integration tests for queue + worker in `tests/integration/worker.test.ts`
- [X] T087 [P] Create E2E test: user login flow in `tests/e2e/auth.spec.ts`
- [X] T088 [P] Create E2E test: create and run test case in `tests/e2e/test-execution.spec.ts`
- [X] T089 [P] Create E2E test: bug report generation in `tests/e2e/bug-report.spec.ts`
- [X] T090 Implement Docker Compose configuration for all services in `docker-compose.yml`
- [X] T091 Create production Dockerfile (multi-stage build) in `Dockerfile`
- [X] T092 Create `package.json` scripts for `dev`, `build`, `start`, `worker`, `lint`, `test`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational completion
  - US1 (Phase 3) → US2 (Phase 4) → US3 (Phase 5) — sequential, each builds on previous
  - US4 (Phase 6) depends on US3
  - US5 (Phase 7) depends on US2 (needs test case structure)
  - US6 (Phase 8) depends on US3 (needs Playwright screenshot capture)
- **Polish (Phase 9)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: No story dependencies — standalone
- **US2 (P1)**: Depends on US1 (needs projects to create test cases)
- **US3 (P1)**: Depends on US1 (credentials) + US2 (test cases)
- **US4 (P2)**: Depends on US3 (needs test runs to report on)
- **US5 (P3)**: Depends on US2 (needs test case structure for AI generation)
- **US6 (P4)**: Depends on US3 (needs Playwright screenshot capture)

### Within Each User Story

- Models/seeds before services
- Services/libraries before API routes
- API routes before UI components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks T002-T008 marked [P] can run in parallel
- All Foundational tasks T012-T017 marked [P] can run in parallel
- Within each user story, UI components and API routes marked [P] can run in parallel
- All test tasks T078-T089 marked [P] can run in parallel

---

## Implementation Strategy

### MVP First (Phases 1-6)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 — Project & Credential Management
4. Complete Phase 4: US2 — Test Case Management
5. Complete Phase 5: US3 — Playwright Test Execution
6. Complete Phase 6: US4 — Reports & Bug Reports
7. **STOP and VALIDATE**: Full MVP ready

### Incremental Delivery (Post-MVP)

1. Add US5 (Phase 7) — AI-Assisted Testing
2. Add US6 (Phase 8) — Figma Visual Comparison
3. Add Polish (Phase 9) — Tests, Docker, packaging

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable (with preceding stories)
- Tests in Phase 9 verify cross-cutting correctness
- Commit after each phase
- Refer to plan.md for tech stack details, data-model.md for schema, contracts/ for API contracts
