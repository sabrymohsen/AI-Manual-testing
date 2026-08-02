# Dashboard / Scrum Board / Reports — Jira Gap Analysis & Enhancement Plan

**Project**: AI-Manual QA OS Platform  
**Date**: 2026-07-29  
**Modules Analyzed**: Dashboard, Scrum Board, Reports  
**Constraint**: All enhancements must be additive — zero breaking changes to existing routes, APIs, DB schema, or component contracts.

---

## 1. Executive Summary

| Module | Jira Parity | Maturity |
|--------|-------------|----------|
| **Dashboard** | ~25% | Early — 4 KPI cards + recent bugs list only. Needs the most work. |
| **Scrum Board** | ~75% | Mature — Board, Backlog, List, Timeline views, drag-drop, task drawer, sprint mgmt. Small Jira gaps remain. |
| **Reports** | ~60% | Good — 6 charts, KPI cards with sparklines, role filtering, tabbed tables. Missing several Jira report types. |

**The Scrum Board is already very close to Jira.** The Dashboard is the weakest module. Reports are solid but missing several standard agile/QA reports.

---

## 2. Module 1 — Dashboard (`/dashboard`)

### 2.1 Current State
- **4 KPI cards**: Pass Rate, Test Cases, Open Defects, Total Runs
- **Recent Defects list**: Last 5 bugs with status badge
- **Project Gateway**: Workspace selection when no active project
- **Data sources**: `useProjectSummary`, `useTestCaseMetrics`, `useBugMetrics`, `useRunMetrics`
- **Admin redirect**: Admins go to `/admin`

### 2.2 What Jira Dashboard Has That We Don't

| # | Jira Feature | Priority | Effort | Notes |
|---|-------------|----------|--------|-------|
| D1 | **Customizable gadget grid** (drag-drop widgets) | P1 | High | Core Jira dashboard concept. Users pick which gadgets appear and where. |
| D2 | **"Assigned to Me" gadget** | P1 | Low | Filtered list of tasks/bugs assigned to current user. |
| D3 | **Activity Stream** | P1 | Medium | Chronological feed of all project activity (task updates, comments, status changes, test runs). |
| D4 | **Pie Chart gadget** (bugs by severity, tests by status) | P2 | Medium | Uses existing data; needs Recharts pie chart component. |
| D5 | **Sprint Health / Sprint Progress widget** | P1 | Medium | Current active sprint: days remaining, progress bar, story points committed vs completed. |
| D6 | **Quick Filters / Favourite Filters** | P2 | Medium | Saved JQL-like filter shortcuts. We can use saved search filters. |
| D7 | **Team Workload gadget** | P2 | Medium | Bar chart of open tasks per assignee. |
| D8 | **Filter Results gadget** | P2 | Low | Display results of a saved filter as a list. |
| D9 | **Calendar / Due Date view** | P3 | Medium | Tasks/bugs with due dates on a calendar. |
| D10 | **Burndown mini-chart** | P2 | Low | Small embedded burndown for active sprint. |
| D11 | **Two-Dimensional Filter Statistics** | P3 | High | Matrix table (e.g. assignee × status). |
| D12 | **Configurable per-user dashboards** | P3 | High | Each user saves their own dashboard layout. |

### 2.3 Recommended Dashboard Enhancements (Phased)

**Phase 1 — Immediate Value (No breaking changes)**
1. Add **"Assigned to Me"** card showing tasks + bugs assigned to current user
2. Add **Activity Stream** panel (pull from existing `ScrumActivity`, `UserActivity`, `AuditLog` models)
3. Add **Sprint Health** card when active sprint exists (story points, days remaining)
4. Add **Team Workload** mini-chart (open tasks per assignee)

**Phase 2 — Richer Widgets**
5. Add **Pie Chart** gadgets (bugs by severity/priority, tests by status)
6. Add **Burndown mini-chart** for active sprint
7. Add **Quick Filters** bar with saved filters

**Phase 3 — Customization**
8. Grid layout with show/hide toggle per widget
9. Per-user dashboard preferences (localStorage first)

---

## 3. Module 2 — Scrum Board (`/projects/[id]/scrum`)

### 3.1 Current State (Already Very Jira-Like)
- **4 Views**: Board, Backlog, List, Timeline
- **Board View**: Drag-drop columns, WIP limits, task cards, add task inline
- **Backlog View**: Sprint sections, drag-drop between sprints, bulk actions, start/complete sprint
- **Task Detail Drawer** (right-side sheet):
  - Status dropdown with transitions
  - Rich-text description editor
  - Subtask list with completion
  - Comments with threading
  - Work logs
  - Linked issues (test cases, bugs, BRDs)
  - Activity history
  - Assignees (multiple), watchers, votes
  - Epic linking, sprint assignment
  - Story points, priority, labels, tags, components
  - Attachments
  - Clone, watch, vote, delete
  - Keyboard shortcuts (E=edit, Shift+C=comment, L=log work)
  - Deep-linking (`?task=`)
- **Permissions**: Permission gates throughout

### 3.2 What Jira Has That We Don't

| # | Jira Feature | Priority | Effort | Notes |
|---|-------------|----------|--------|-------|
| S1 | **Swimlanes** (by assignee, epic, or none) | P1 | Medium | Horizontal grouping within columns. High Jira parity impact. |
| S2 | **Quick Filters** (My Issues, Recently Updated, Only Stories, etc.) | P1 | Low | Filter chips above the board. Can reuse existing filter state. |
| S3 | **Card layout customization** | P2 | Medium | Choose what fields display on task cards (assignee, priority, story points, labels). |
| S4 | **Quick Edit** (inline editing without opening drawer) | P2 | Medium | Inline assignee, priority, story point editing on hover. |
| S5 | **Sprint Report page** (burndown + completed issues list) | P2 | Low | Can reuse existing Reports charts. Link from board header. |
| S6 | **Complete Sprint modal with summary** | P2 | Low | Show incomplete issues, velocity, completed points. |
| S7 | **Release/Version management on backlog** | P3 | Medium | Version columns in backlog, assign issues to versions. |
| S8 | **Board settings** (column → status mapping, card layout) | P3 | Medium | Settings modal for board configuration. |
| S9 | **Color indicators by issue type / epic** | P2 | Low | Add color border/left-bar to cards by type or epic. |
| S10 | **Board backlog toggle on same page** | P3 | Low | Jira shows backlog panel alongside board. We use tabs. |
| S11 | **Issue ranking by drag in backlog** | P2 | Medium | Drag to reorder within/backlog sections. Currently only board columns. |
| S12 | **Sprint retrospective notes** | P3 | Low | Text field on sprint for retro notes. |

### 3.3 Recommended Scrum Board Enhancements

**Phase 1 — Board Polish**
1. **Swimlanes** (by assignee or epic) — add dropdown above board to toggle
2. **Quick Filters** — chips: "My Issues", "Recently Updated", "Only Stories", "Has Subtasks"
3. **Color indicators** — left color bar on cards by issue type

**Phase 2 — Efficiency**
4. **Quick Edit** — hover actions on cards for assignee, status, story points
5. **Card layout toggle** — show/hide fields on cards (compact vs detailed)
6. **Complete Sprint summary modal**

**Phase 3 — Advanced**
7. **Board settings** modal for column mapping and card layout
8. **Release/Version** panel on backlog
9. **Sprint retrospective** notes

---

## 4. Module 3 — Reports (`/reports`)

### 4.1 Current State
- **6 KPI cards**: Pass Rate, Test Cases, Open Bugs, Req Coverage, Velocity, Sprint Day — all with sparklines and trend indicators
- **6 Charts**: Burndown, Velocity, Cumulative Flow Diagram (CFD), Defect Trend, Team Performance, Execution Funnel
- **Role-based filtering**: PM, QA Manager, Test Lead, Developer views hide/show different charts
- **Date presets**: 7D, 30D, 90D, YTD, Custom
- **Tabbed tables**: Tests, Bugs, Requirements, Sprints — all server-paginated, sortable, searchable, CSV export
- **Export menu**: PDF, Word, Excel export
- **Auto-refresh**: 60s toggle

### 4.2 What Jira Reports Has That We Don't

| # | Jira Report | Priority | Effort | Notes |
|---|------------|----------|--------|-------|
| R1 | **Sprint Report** (full: burndown + completed issues + not completed) | P1 | Low | We have burndown chart; need the issue list companion. |
| R2 | **Epic Report** (epic burndown + issues in epic) | P1 | Medium | Needs epic data aggregation. |
| R3 | **Control Chart** (cycle time / lead time distribution) | P2 | Medium | Scatter plot + rolling average. Needs task transition history. |
| R4 | **Average Age Report** | P2 | Low | Bar chart of average age of open issues by status. |
| R5 | **Created vs Resolved** trend | P2 | Low | Line chart: issues created vs resolved per day/week. |
| R6 | **Resolution Time Report** | P2 | Medium | Histogram of time from creation to resolution. |
| R7 | **Time Tracking Report** (original vs remaining estimate) | P3 | Medium | Needs `originalEstimate` / `remainingEstimate` to be populated. |
| R8 | **User Workload Report** | P2 | Low | Existing team performance can be extended. |
| R9 | **Pie Chart report builder** (by any field) | P3 | Medium | Generic pie chart by assignee, priority, status, type. |
| R10 | **Version Report** (release burndown) | P3 | Medium | Needs version/release entity. |
| R11 | **Schedule / Timeline report** | P3 | Medium | Gantt-style view of sprints/releases. |
| R12 | **Custom report builder / saved reports** | P3 | High | Allow users to save report configurations. |

### 4.3 Recommended Reports Enhancements

**Phase 1 — Core Missing Reports**
1. **Sprint Report** page/tab — combine existing burndown + list of completed/not-completed issues
2. **Epic Report** — epic list with progress bars and linked issues
3. **Created vs Resolved** line chart

**Phase 2 — Quality Metrics**
4. **Control Chart** (cycle time scatter plot)
5. **Average Age Report**
6. **Resolution Time** histogram

**Phase 3 — Advanced**
7. **Pie Chart report** (generic, by assignee/priority/status)
8. **Version Report** (when versions are implemented)
9. **Saved/Shared reports**

---

## 5. Cross-Cutting Enhancements (All 3 Modules)

| Feature | Benefit | Effort |
|---------|---------|--------|
| **Global Quick Search** (Ctrl+K) | Already exists in layout — extend to search tasks, bugs, test cases | Low |
| **Breadcrumbs** | Already partially present — standardize across all 3 modules | Low |
| **Keyboard shortcuts help** ( `?` ) | Show shortcut overlay | Low |
| **Dark mode polish** | Ensure all 3 modules look good in dark mode | Medium |
| **Mobile responsive** | Board is least mobile-friendly; tables need horizontal scroll | Medium |

---

## 6. Non-Breaking Implementation Rules

To ensure zero breakage:

1. **No schema changes** required for Phases 1–2 of any module (all data already exists)
2. **No API contract changes** — only additive endpoints or new endpoints
3. **No route changes** — keep existing `/dashboard`, `/projects/[id]/scrum`, `/reports`
4. **No component prop signature changes** — wrap/compose rather than modify
5. **Use existing data models**:
   - `ScrumTask`, `ScrumSprint`, `BugReport`, `TestCase`, `TestRun` already have all fields needed
   - `ScrumActivity`, `AuditLog`, `UserActivity` already capture the activity stream
6. **Leverage existing hooks**:
   - `useScrumTasks`, `useScrumSprints`, `useScrumMembers`, `useProjectReport`
   - `use-analytics.ts` already has the query patterns
7. **Reuse existing UI components**:
   - `shadcn/ui` components, `StatusBadge`, `Avatar`, `KPICards`
   - Recharts for all new charts

---

## 7. Priority-Ordered Task List

### Sprint 1 — Dashboard Foundation
- [ ] D2: "Assigned to Me" gadget on Dashboard
- [ ] D3: Activity Stream panel on Dashboard
- [ ] D5: Sprint Health card on Dashboard
- [ ] D7: Team Workload mini-chart on Dashboard

### Sprint 2 — Board Polish
- [ ] S1: Swimlanes (by assignee / epic) on Board
- [ ] S2: Quick Filters on Board
- [ ] S9: Color indicators on task cards

### Sprint 3 — Reports Expansion
- [ ] R1: Sprint Report page
- [ ] R2: Epic Report tab
- [ ] R5: Created vs Resolved chart

### Sprint 4 — Efficiency
- [ ] S4: Quick Edit on board cards
- [ ] D4: Pie Chart gadgets on Dashboard
- [ ] R4: Average Age Report

### Sprint 5 — Quality Metrics
- [ ] R3: Control Chart
- [ ] R6: Resolution Time Report
- [ ] S6: Complete Sprint summary modal

---

## 8. Appendix — File Inventory for Each Module

### Dashboard
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/dashboard/page.tsx` | Main dashboard page |
| `src/hooks/use-metrics.ts` | KPI data hooks |
| `src/components/dashboard/` | (empty — all UI is inline in page.tsx) |

### Scrum Board
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/projects/[id]/scrum/page.tsx` | Board shell with tabs |
| `src/components/scrum/board/board-view.tsx` | Kanban board with drag-drop |
| `src/components/scrum/views/backlog-view.tsx` | Backlog with sprints |
| `src/components/scrum/views/list-view.tsx` | List view |
| `src/components/scrum/views/timeline-view.tsx` | Timeline/Gantt view |
| `src/components/scrum/task/task-detail-drawer.tsx` | Task detail sheet |
| `src/components/scrum/task/task-details-sidebar.tsx` | Right-side properties panel |
| `src/components/scrum/task/subtask-list.tsx` | Subtasks |
| `src/components/scrum/task/comment-list.tsx` | Comments |
| `src/components/scrum/task/traceability-links.tsx` | Linked test cases/bugs |
| `src/components/scrum/task/task-activity.tsx` | Activity feed |
| `src/components/scrum/modals/create-task-modal.tsx` | Create task |
| `src/components/scrum/modals/create-epic-modal.tsx` | Create epic |
| `src/components/scrum/modals/create-sprint-modal.tsx` | Create sprint |
| `src/components/scrum/modals/import-modal.tsx` | CSV import |
| `src/hooks/scrum/use-scrum.ts` | All scrum data hooks |
| `src/stores/scrum-ui.ts` | UI state store |
| `src/types/scrum.ts` | TypeScript types |

### Reports
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/reports/page.tsx` | Main reports page |
| `src/components/reports/dashboard/header.tsx` | Filter/header bar |
| `src/components/reports/dashboard/kpi-cards.tsx` | 6 KPI cards |
| `src/components/reports/dashboard/charts.tsx` | All 6 charts |
| `src/components/reports/dashboard/tables.tsx` | Tabbed data tables |
| `src/components/reports/dashboard/export-menu.tsx` | PDF/Word/Excel export |
| `src/hooks/reports/use-analytics.ts` | All data hooks |
| `src/lib/reports/analytics.ts` | Backend analytics logic |
| `src/lib/reports/colors.ts` | Chart color palette |

---

*End of analysis. All findings are based on codebase inspection dated 2026-07-29.*
