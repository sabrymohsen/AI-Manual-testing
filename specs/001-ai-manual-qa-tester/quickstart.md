# Quickstart: AI Manual QA Tester

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL + Redis)
- npm or pnpm

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your values

# 3. Start PostgreSQL and Redis
docker compose up -d postgres redis

# 4. Run database migrations
npx prisma migrate dev

# 5. Start the development server
npm run dev
```

## Validation Scenarios

### Scenario 1: Project CRUD

```bash
# 1. Open http://localhost:3000
# 2. Register a new account (name, email, password)
# 3. Log in
# 4. Click "Create Project"
# 5. Fill: Name="My App", URL="https://example.com", Environment="Staging"
# 6. Select Browser="Chromium", Viewport="Desktop (1280x800)"
# 7. Save
```

**Expected**: Project appears in project list. Click to view details. Edit and delete work.

### Scenario 2: Credential Management

```bash
# 1. Open a project
# 2. Go to Credentials tab
# 3. Click "Add Credential"
# 4. Fill: Role="Admin", Username="admin@example.com", Password="test123"
# 5. Save
# 6. Add another: Role="Viewer", Username="viewer@example.com", Password="test456"
```

**Expected**: Both credentials listed. Passwords show as `••••••••`. Edit credential shows masked password.

### Scenario 3: Test Case with Steps

```bash
# 1. Go to Test Cases tab
# 2. Click "Create Test Case"
# 3. Title="Homepage Load", Priority="High", Module="Navigation"
# 4. Add Step 1:
#    - Action: "Open URL", Target: none, Value: "https://example.com"
#    - Expected: "Page loads successfully"
# 5. Add Step 2:
#    - Action: "Assert Visible", Target: "text", Value: "Welcome"
#    - Expected: "Welcome text is visible"
# 6. Save
```

**Expected**: Test case saved with 2 steps. Steps are editable and reorderable.

### Scenario 4: Test Execution (Requires Worker)

```bash
# 1. On test case page, click "Run Test"
# 2. If multiple credentials, role selection modal appears
# 3. Select role and confirm
# 4. Status shows: Queued → Running
# 5. Watch live progress per step
```

**Expected**: Worker picks up job. Steps execute. Screenshots captured. Logs collected. Final status shown.

### Scenario 5: Bug Report

```bash
# 1. From a failed test step, click "Create Bug Report"
# 2. Title auto-filled from step
# 3. Steps to reproduce, expected, actual pre-filled
# 4. Select Severity="Medium", Priority="High"
# 5. Save
```

**Expected**: Bug report saved. Viewable in Bug Reports tab. Test run report exportable as Markdown.

## Worker

```bash
# Start the Playwright worker in a separate terminal
npm run worker
```

## Verification Checklist

- [ ] User can register and log in
- [ ] User can create/edit/delete a project
- [ ] User can add credentials with encrypted passwords
- [ ] Passwords are masked in UI and never returned to frontend
- [ ] User can create test cases with structured steps
- [ ] User can run a test case (with role selection if multiple credentials)
- [ ] Screenshots are captured before and after each step
- [ ] Console logs are collected
- [ ] Network errors are captured
- [ ] Test run report shows per-step results
- [ ] Failed step can generate bug report
- [ ] Markdown export works
