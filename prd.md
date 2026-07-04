# Product Requirement Document (PRD): AI-Manual QA OS Platform

## 1. Executive Summary & Goals

### 1.1 Vision
The AI-Manual QA OS is an integrated, workflow-driven QA workspace designed to bridge the gap between design-time test case creation, live manual execution, automated Playwright runner systems, and external issue trackers (specifically OpenProject).

### 1.2 Core Problems Solved
- **Fragmented Workflow**: Eliminates jumping between isolated tools (spreadsheet checklist, test recorder, screen capture tool, issue tracker).
- **Broken Traceability**: Automates and checks structural health of cases (Orphans) and trace linkages (cases to runs to bugs to OpenProject tickets).
- **Data Inconsistency**: Centralizes metrics reporting across monitoring dashboards.

---

## 2. Platform Architecture & Official Routing

The platform enforces a strict project context scope lock. If no active project is selected in the global sidebar dropdown, users are gated by a project selection gateway screen.

### 2.1 Route Ownership Matrix

| Page Name | Official Route Path | Primary Responsibility |
| :--- | :--- | :--- |
| **Home Dashboard** | `/dashboard` | Executive overview of project health, pass rates, open defects, and quick links. |
| **Projects Registry** | `/projects` | Create, configure, and register scopes. |
| **Test Cases Cockpit** | `/projects/[id]/test-cases` | 3-panel Cockpit for case authoring, Excel imports, and validation. |
| **Testing Workstation** | `/projects/[id]/testing-workstation` | Live manual checklist runner with image/video capture toolbars. |
| **Recorder Studio** | `/projects/[id]/recorder-studio` | Action capture console to record clicks/inputs to compile cases. |
| **Bug Reports Hub** | `/projects/[id]/bug-reports` | Defect triage desk, logs analysis, and screenshot reviewer. |
| **OpenProject Sync** | `/projects/[id]/openproject-sync` | Daily operational sync console for external ticket mappings. |
| **Project Settings** | `/projects/[id]/settings` | Configures credentials vault and host connection mappings. |

---

## 3. Core Functional Requirements

### 3.1 Test Cases Cockpit (Daily Management)
- **Left Panel hierarchy**: Interactive tree displaying Modules ➔ Features ➔ Components with total testcase tallies and aggregate pass rate percentages.
- **Center Panel timeline list**: Cards displaying metadata, preconditions, priority keys, and execution status timeline icons:
  `Created (Manual/Recorder)` ➔ `Run (Manual/Auto)` ➔ `Latest Status` ➔ `Linked Bug` ➔ `OP Sync status`.
- **Right Panel Inspector**:
  - **Tab 1: Details**: Lists steps (Action, Type, Expected Result), preconditions, and requirements.
  - **Tab 2: Executions**: Execution history logs list, manual vs auto indicator, and links to report sheets.
  - **Tab 3: Bugs**: Displays linked defects, their status (Open/Fixed/Closed), and attachments.
  - **Tab 4: Sync**: Shows OpenProject sync mappings and trigger action buttons.

### 3.2 Traceability Engine (Metrics & Validation)
- **Orphans Detection**: Instantly warns when test cases are unassigned to modules.
- **Broken Links Detection**: Flags cases lacking execution history, failed cases lacking filed defects, or unsynced items.

### 3.3 Testing Workstation (Manual Run Execution)
- Launches Playwright browser instances targeting credentials-autologin URLs.
- Provides overlay toolbars to:
  - Play step checklists.
  - Capture screenshots or record webm video files.
  - Log actual results and submit new bug reports.

### 3.4 Recorder Studio (Design-Time Generation)
- Mounts selector element listeners, step-recording pipelines, and expected assertions inputs.
- Outputs Playwright script code templates and creates test cases automatically.

### 3.5 OpenProject Sync (Integrations Desk)
- Daily synchronization of test runs and bugs.
- Map local components to remote parent packages.
- Monitor retry queues for failed sync operations.

---

## 4. Shared Caching & Data Consistency

To maintain consistent metric counts, all dashboard views and settings sections fetch data from a unified hook cache system (`src/hooks/use-metrics.ts`):
- `useActiveProject()`
- `useProjectSummary(projectId)`
- `useTestCaseMetrics(projectId)`
- `useBugMetrics(projectId)`
- `useRunMetrics(projectId)`

---

## 5. UI Design Guidelines
- Standardised layouts using unified components: `AppPageHeader` and `ActiveProjectContextBar`.
- Dark/glassmorphic theme accents with consistent status badge colors:
  - **Passed / Fixed**: Emerald (`bg-emerald-100 text-emerald-700`)
  - **Failed / Open / Danger**: Rose/Red (`bg-red-100 text-red-700`)
  - **Pending / Warning**: Amber (`bg-amber-100 text-amber-700`)
