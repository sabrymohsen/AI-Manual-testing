# Feature Specification: AI Manual QA Tester

**Feature Branch**: `001-ai-manual-qa-tester`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: Build a full-stack web application for QA engineers to create testing projects, manage role-based credentials, write or generate test cases, execute browser-based functional tests using Playwright, collect logs/screenshots/network errors, compare actual vs expected results, and generate structured test and bug reports. Support three modes: Manual Functional Testing, AI-Assisted Testing, and Visual Design Testing (Figma comparison).

## User Scenarios & Testing

### User Story 1 — Project & Credential Management (Priority: P1)

QA engineers can create testing projects with target web application URLs, configure environments (Dev, Staging, UAT, Production), set browser type and viewport, and manage multiple role-based credentials (usernames/passwords) per project. Passwords must be encrypted and never exposed to the frontend. When running a test, the user selects which role to use.

**Why this priority**: Without projects and credentials, no testing can occur. This is the foundational data layer.

**Independent Test**: User can register, log in, create a project with URL + environment + browser settings, add 2 role credentials (Admin, Viewer), and see passwords masked in the UI.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they create a new project with name, URL, environment, browser, and viewport, **Then** the project is saved and visible in the project list with search and filter.
2. **Given** a project, **When** the user adds a credential with role name, username, and password, **Then** the credential is saved, password is encrypted in the database, and the password field shows masked in the UI.
3. **Given** a project with multiple credentials, **When** the user views the credential list, **Then** the password is never returned to the frontend.

---

### User Story 2 — Structured Test Case Management (Priority: P1)

QA engineers can create test cases with structured steps. Each step has a human-readable action description, an expected result, a machine-executable action type (click, fill, open_url, wait_for_text, assert_visible, etc.), target type and value, input value, timeout, and optional JSON assertions. Test cases can be created manually or imported.

**Why this priority**: Test cases are the core content being executed. Structured steps are required for reliable automation.

**Independent Test**: User can create a test case with 3 structured steps (open URL, fill a form field, click submit), each with expected results and assertions, and verify the test case is saved with all steps intact.

**Acceptance Scenarios**:

1. **Given** a project, **When** the user creates a test case with title, module, priority, preconditions, and adds multiple steps, **Then** each step is saved with action description, expected result, action type, target, and assertions.
2. **Given** a test case with steps, **When** the user edits a step and saves, **Then** the step is updated.
3. **Given** the test case list, **When** the user filters by module or priority, **Then** only matching test cases are shown.

---

### User Story 3 — Playwright Test Execution with Role Selection (Priority: P1)

QA engineers can run a test case against the target web application. Before execution, if multiple credentials exist, the system asks which role to use. The test runs via a background worker (not blocking the UI). For each step, Playwright captures a screenshot before and after, executes the action, runs assertions, collects console logs and network logs, detects JavaScript errors and failed API requests, and marks the step as Passed/Failed/Blocked/Warning.

**Why this priority**: This is the core value proposition — automated test execution with full observability.

**Independent Test**: User selects a test case with 2 steps (navigate to URL, verify text is visible), clicks "Run Test", selects a role, watches live progress, and sees pass/fail results per step with before/after screenshots.

**Acceptance Scenarios**:

1. **Given** a project with multiple credentials, **When** the user clicks "Run Test", **Then** a role selection modal asks which role to use.
2. **Given** a running test, **When** the worker executes a step, **Then** screenshots are captured before and after, console logs are collected, network requests/responses are logged, and step status is updated.
3. **Given** a completed test run, **When** the user views the report, **Then** each step shows status, actual result, screenshots, logs, and network errors.

---

### User Story 4 — Test Run Reports & Bug Reports (Priority: P2)

QA engineers can view detailed test run reports showing overall status, duration, browser, viewport, role used, and per-step results with screenshots, logs, and network errors. From any failed step, the user can generate a structured bug report with title, severity, steps to reproduce, expected/actual result, screenshots, and logs. Reports can be exported as Markdown.

**Why this priority**: Reports and bug tracking close the QA feedback loop.

**Independent Test**: After a test run with a failed step, user opens the report, sees the failure with screenshots/logs, clicks "Create Bug Report", fills severity/priority, saves the bug report, and exports the test run report as Markdown.

**Acceptance Scenarios**:

1. **Given** a completed test run, **When** the user opens the test run details, **Then** the report shows status, duration, browser, viewport, role used, and a list of steps with their statuses.
2. **Given** a failed test step, **When** the user creates a bug report, **Then** the bug report pre-fills steps to reproduce, expected result, actual result, and attaches screenshots/logs.
3. **Given** a completed test run, **When** the user exports the report, **Then** a Markdown document is generated with all step details, screenshots referenced, and log summaries.

---

### User Story 5 — AI-Assisted Test Case Generation (Priority: P3)

QA engineers can describe a test scenario in natural language and have the AI generate structured test cases with steps, expected results, assertions, and suggested role requirements. The user reviews, edits if needed, and approves before saving. AI also helps analyze failures and draft bug reports. AI must never receive passwords, tokens, cookies, or sensitive headers.

**Why this priority**: AI assistance accelerates test creation but requires the manual testing flow to be stable first.

**Independent Test**: User types "Test login with invalid password shows error", AI generates a test case with 4 steps (navigate to login, enter invalid password, click login, verify error message visible), user edits step 2, approves, and the test case is saved.

**Acceptance Scenarios**:

1. **Given** a test case creation page, **When** the user enters natural language and clicks "Generate with AI", **Then** AI returns a structured test case with title, steps, expected results, and assertions.
2. **Given** an AI-generated test case, **When** the user edits any step, **Then** the changes are reflected before saving.
3. **Given** generated content, **When** the user clicks "Approve and Save", **Then** the test case is saved as "AI Generated" source type.

---

### User Story 6 — Visual Design Comparison (Priority: P4)

QA engineers can configure a Figma URL for visual comparison. The system fetches Figma frame images via the Figma API, Playwright captures actual screenshots from the web application, and Pixelmatch compares them to generate a diff image with mismatch percentage. Results are marked as Passed or Failed based on configurable tolerance.

**Why this priority**: Visual regression is valuable but complex and depends on the functional runner being stable first.

**Independent Test**: User configures a Figma URL and API token, syncs a Figma frame, runs a visual comparison, and sees the reference image, actual screenshot, diff overlay, and mismatch percentage.

**Acceptance Scenarios**:

1. **Given** a project with Figma URL and API token configured, **When** the user syncs the Figma frame, **Then** the reference image is fetched and stored.
2. **Given** a Figma reference image, **When** the user runs visual comparison, **Then** Playwright captures an actual screenshot, Pixelmatch compares images, a diff overlay is generated, and mismatch percentage is calculated.
3. **Given** a comparison result, **When** the mismatch is below the tolerance threshold, **Then** the result is marked as Passed.

---

### Edge Cases

- What happens when the web app URL is unreachable during test execution?
- How does the system handle expired credentials or login failures?
- What if the Figma API token is invalid or the frame node ID is incorrect?
- How are long-running tests handled if the user navigates away or closes the browser tab?
- What happens when AI generation produces invalid or nonsensical test steps?
- How are concurrent test runs on the same project handled?
- What if storage (local disk) runs out of space during screenshot/log capture?

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow users to register with name, email, and password.
- **FR-002**: System MUST authenticate users via email and password with session management.
- **FR-003**: System MUST allow authenticated users to create, edit, delete, and view testing projects.
- **FR-004**: Each project MUST support configurable environment, browser type, viewport, and test type.
- **FR-005**: System MUST allow adding multiple credentials per project with role name, username, and encrypted password.
- **FR-006**: Passwords MUST be encrypted using AES-256-GCM and never returned to the frontend.
- **FR-007**: System MUST allow creating test cases with structured steps containing action type, target type, target value, input value, timeout, assertions JSON, and expected result.
- **FR-008**: Test execution MUST run via a background worker (queue), not within the API request lifecycle.
- **FR-009**: Worker MUST support configurable browser and viewport, login with selected credential, screenshot capture before/after each step, console log collection, network log collection, JavaScript error detection, and failed API request detection.
- **FR-010**: System MUST allow role selection before test execution when multiple credentials exist.
- **FR-011**: System MUST generate test run reports showing per-step results with status, screenshots, logs, and network errors.
- **FR-012**: Failed test steps MUST support generating structured bug reports with title, severity, priority, steps to reproduce, expected/actual result, and attached artifacts.
- **FR-013**: System MUST support exporting test run reports as Markdown.
- **FR-014**: AI test case generation MUST require user review and approval before saving.
- **FR-015**: AI MUST NOT receive passwords, tokens, cookies, authorization headers, or sensitive data.
- **FR-016**: System MUST support Figma URL configuration and frame image fetching via Figma API.
- **FR-017**: System MUST support pixel-level visual comparison between Figma reference images and actual screenshots.
- **FR-018**: All sensitive data (passwords, tokens) MUST be sanitized before storage in logs.
- **FR-019**: System MUST audit credential usage with user, project, role, timestamp, and action.

### Key Entities

- **User**: System users who register, log in, and manage projects/test cases
- **Project**: A testing project with target URL, environment config, browser/viewport settings, and optional Figma config
- **ProjectCredential**: Role-based credentials (username + encrypted password) per project for authenticating to the target app
- **TestCase**: A structured test case with title, priority, module, preconditions, and ordered steps
- **TestStep**: An individual executable step with action type, target, input, assertions, and expected result
- **TestRun**: An execution of a test case with selected credential, status, timing, and results
- **TestStepResult**: Result of executing a single step with status, screenshots, logs, and comparison details
- **BugReport**: Generated bug from a failed step with reproduction steps, expected/actual result, and attachments
- **VisualComparisonResult**: Figma-to-actual screenshot comparison with diff image and mismatch percentage

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can create a project and add credentials in under 2 minutes.
- **SC-002**: A 3-step test case can be executed end-to-end via Playwright with screenshots and logs captured for each step.
- **SC-003**: Test run reports are viewable within 5 seconds of completion.
- **SC-004**: Bug reports from failed steps are generated in under 30 seconds.
- **SC-005**: AI-generated test cases are reviewed and saved in under 3 minutes.

## Assumptions

- Users have stable internet connectivity to access the web application.
- Target web applications are accessible from the server/worker running Playwright.
- Users will provide valid Figma API tokens and correct frame/node IDs for visual comparison.
- AI service (OpenAI-compatible) is available and responsive during test generation.
- The initial MVP uses local file storage; cloud storage (S3) will be added later.
- Mobile real device testing and cross-browser matrix execution are out of scope for v1.
- Jira, Azure DevOps, GitHub Issues, Slack, and Teams integrations are out of scope for MVP.
- PostgreSQL and Redis are required infrastructure for the application to function.
