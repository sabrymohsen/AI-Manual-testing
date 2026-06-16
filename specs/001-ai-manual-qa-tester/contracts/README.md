# API Contracts: AI Manual QA Tester

This document defines the API contracts for the AI Manual QA Tester application.

All endpoints are Next.js API routes under `/src/app/api/`.

## Auth

### POST /api/auth/register
**Body**: `{ email: string, password: string, name?: string }`
**Response** (201): `{ user: { id, email, name } }`
**Errors**: 409 (email exists), 400 (validation)

### POST /api/auth/login
**Body**: `{ email: string, password: string }`
**Response** (200): `{ user: { id, email, name }, token: string }`
**Errors**: 401 (invalid credentials)

### POST /api/auth/logout
**Headers**: `Authorization: Bearer <token>`
**Response** (200): `{ success: true }`

## Projects

### GET /api/projects
**Query**: `?search=string&environment=Staging`
**Response** (200): `{ projects: Project[] }`

### POST /api/projects
**Body**: `{ name, webAppUrl, figmaUrl?, description?, environment, browserType, viewport, testType, customViewportWidth?, customViewportHeight? }`
**Response** (201): `{ project: Project }`

### GET /api/projects/[id]
**Response** (200): `{ project: Project }`

### PUT /api/projects/[id]
**Body**: Partial<Project fields>
**Response** (200): `{ project: Project }`

### DELETE /api/projects/[id]
**Response** (200): `{ success: true }`

## Credentials

### GET /api/projects/[projectId]/credentials
**Response** (200): `{ credentials: Credential[] }` — passwords always masked

### POST /api/projects/[projectId]/credentials
**Body**: `{ roleName, username, password, loginUrl?, notes? }`
**Response** (201): `{ credential: { id, roleName, username, loginUrl, notes, createdAt } }`

### PUT /api/projects/[projectId]/credentials/[id]
**Body**: Partial<Credential fields> — password re-encrypted if provided
**Response** (200): `{ credential: Credential }`

### DELETE /api/projects/[projectId]/credentials/[id]
**Response** (200): `{ success: true }`

## Test Cases

### GET /api/projects/[projectId]/test-cases
**Query**: `?module=Login&priority=High&source=Manual`
**Response** (200): `{ testCases: TestCase[] }`

### POST /api/projects/[projectId]/test-cases
**Body**: `{ title, module, priority, preconditions?, source, requiredCredentialId?, testData?, tags?, steps: TestStep[] }`
**Response** (201): `{ testCase: TestCase }`

### GET /api/projects/[projectId]/test-cases/[id]
**Response** (200): `{ testCase: TestCase }` — includes steps

### PUT /api/projects/[projectId]/test-cases/[id]
**Body**: Partial<TestCase fields>
**Response** (200): `{ testCase: TestCase }`

### DELETE /api/projects/[projectId]/test-cases/[id]
**Response** (200): `{ success: true }`

### POST /api/projects/[projectId]/test-cases/generate
**Body**: `{ prompt: string }`
**Response** (200): `{ generatedTestCase: { title, steps, preconditions, requiredRole } }`
**Notes**: AI generates test case. User must review and approve before saving.

## Test Runs

### POST /api/projects/[projectId]/test-runs
**Body**: `{ testCaseId, credentialId? }`
**Response** (201): `{ testRun: TestRun }` — status: Queued

### GET /api/projects/[projectId]/test-runs
**Response** (200): `{ testRuns: TestRun[] }`

### GET /api/projects/[projectId]/test-runs/[id]
**Response** (200): `{ testRun: TestRun }` — includes stepResults, logs, networkLogs

### POST /api/projects/[projectId]/test-runs/[id]/cancel
**Response** (200): `{ testRun: TestRun }` — status: Cancelled

### GET /api/projects/[projectId]/test-runs/[id]/progress
**Response** (200): `{ status, currentStep, stepResults, startedAt, completedAt, durationMs }`
**Notes**: Polled by frontend during execution (every 2 seconds).

## Exports

### GET /api/test-runs/[id]/export/markdown
**Response** (200): `Content-Type: text/markdown` — Markdown file download

### GET /api/test-runs/[id]/export/zip
**Response** (200): `Content-Type: application/zip` — ZIP with report + screenshots + logs

## Bug Reports

### GET /api/projects/[projectId]/bug-reports
**Query**: `?severity=High&priority=Critical`
**Response** (200): `{ bugReports: BugReport[] }`

### POST /api/projects/[projectId]/bug-reports
**Body**: `{ title, severity, priority, testRunId, stepsToReproduce, expectedResult, actualResult, screenshotPath?, consoleLogs?, networkErrors? }`
**Response** (201): `{ bugReport: BugReport }`

### GET /api/projects/[projectId]/bug-reports/[id]
**Response** (200): `{ bugReport: BugReport }`

### PUT /api/projects/[projectId]/bug-reports/[id]
**Response** (200): `{ bugReport: BugReport }`

## AI

### POST /api/ai/generate-test-case
**Body**: `{ prompt: string, projectId: string }`
**Response** (200): `{ title, preconditions, steps: GeneratedStep[], requiredRole?: string }`
**Errors**: 400 (invalid prompt), 503 (AI unavailable)

### POST /api/ai/explain-failure
**Body**: `{ testRunId, stepNumber, logs: string[], errorMessage: string }`
**Response** (200): `{ explanation: string }`

## Figma

### POST /api/projects/[projectId]/figma/sync
**Headers**: `Content-Type: application/json`
**Body**: `{ figmaUrl: string, apiToken?: string }`
**Response** (200): `{ figmaImagePath, nodeName, fileKey, nodeId }`

### POST /api/projects/[projectId]/figma/compare
**Body**: `{ testRunId, url: string, viewport: { width, height } }`
**Response** (201): `{ visualComparison: VisualComparisonResult }`

## Settings

### GET /api/settings
**Response** (200): `{ aiProvider?, storageType?, defaultBrowser?, defaultViewport? }` — secrets never returned

### PUT /api/settings
**Body**: `{ aiProvider?, openAiApiKey?, figmaApiToken?, storageType?, defaultBrowser?, defaultViewport? }`
**Response** (200): `{ settings: Settings }`

## Dashboard

### GET /api/dashboard/stats
**Response** (200): `{ totalProjects, totalTestCases, totalTestRuns, passed, failed, warning, passPercentage }`

### GET /api/dashboard/recent
**Response** (200): `{ recentTestRuns: TestRun[], recentBugReports: BugReport[] }`
