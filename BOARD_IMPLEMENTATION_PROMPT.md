# Board Page — Full Jira-Grade Kanban Implementation Prompt

> **Project**: `ai-manual-qa-tester` (Next.js 14 + Prisma + PostgreSQL + Tailwind + @dnd-kit)
> **Target Page**: `/projects/[id]/board`  
> **Goal**: Audit existing board implementation, list what's done vs missing, then implement all missing Jira-grade Kanban features with a design that is **visually better than Jira** — cleaner, more modern, with superior UX patterns.

---

## 1. EXISTING IMPLEMENTATION AUDIT

### ✅ What's Already Built (DO NOT BREAK THESE)

| Feature | Files | Status |
|---------|-------|--------|
| **Kanban board** (To Do / In Progress / Blocked / Done) | `sprint-kanban.tsx` | ✅ Working with @dnd-kit drag & drop |
| **Backlog planning** (drag stories into sprints) | `scrum-board.tsx` | ✅ Working |
| **Sprint CRUD** (create, start, complete, delete) | `scrum-board.tsx` + API | ✅ Working |
| **Story cards** with icons, key, title, labels, priority, status, assignee avatar, points, test/bug/child counts | `shared.tsx` `StoryCardView` | ✅ Working |
| **Issue drawer** (slide-over) for editing all fields | `issue-drawer.tsx` | ✅ Working |
| **Child tasks** (Story → Task hierarchy) | `issue-drawer.tsx` + API | ✅ Working |
| **Test case & bug linking** from drawer | `issue-drawer.tsx` | ✅ Working |
| **Sprint reports** (burndown + velocity SVG charts) | `sprint-reports.tsx` | ✅ Working |
| **Search & epic filter** in backlog view | `scrum-board.tsx` | ✅ Working |
| **Create work items** (Story/Task full-page form) | `board/create/page.tsx` | ✅ Working |
| **Import requirements** (Excel/CSV) | `scrum-board.tsx` + modal | ✅ Working |
| **Epic → Story → Task hierarchy** | `shared.tsx` `issueTypeOf()` | ✅ Working |
| **Status transitions** (8 statuses: Draft → ReadyForTesting → InTesting → PartiallyCovered → Blocked → Failed → Covered → Deprecated) | `shared.tsx` `WORKFLOW_STATUSES` | ✅ Working |
| **Sprint selection** dropdown in board view | `sprint-kanban.tsx` | ✅ Working |

### 🔧 Key Files to Modify (Read them first)

1. **`/src/components/board/scrum-board.tsx`** — Main board container (backlog + tabs + sprint kanban + reports)
2. **`/src/components/board/sprint-kanban.tsx`** — Active sprint Kanban columns
3. **`/src/components/board/shared.tsx`** — Types, constants, `StoryCardView`, `BOARD_COLUMNS`, helpers
4. **`/src/components/board/issue-drawer.tsx`** — Issue detail slide-over
5. **`/src/components/board/sprint-reports.tsx`** — Burndown & velocity charts
6. **`/src/app/(dashboard)/projects/[id]/board/create/page.tsx`** — Create work item form

### 📋 Database Schema (Already Supports Most Features)

- `Sprint`: `id, projectId, name, goal, status(Future|Active|Completed), startDate, endDate, orderIndex, completedAt`
- `Requirement`: `id, projectId, epicId, requirementKey, title, description, acceptanceCriteria, priority, status, source, backlogRank, storyPoints, assignee, labels[], sprintId, boardRank, featureId, parentId, children[], subtasks[], createdAt, updatedAt`
- `RequirementSubtask`: `id, requirementId, title, done, assignee, orderIndex`

---

## 2. WHAT'S MISSING vs JIRA — FULL FEATURE GAP ANALYSIS

### 🎯 PRIORITY 1 — Core Board Experience (Must-Have)

| # | Missing Feature | Jira Equivalent | Why It Matters |
|---|----------------|-----------------|----------------|
| 1 | **Swimlanes** — Group cards by Assignee, Epic, or Story (parent) | "Swimlanes" setting in board config | Critical for team standups; seeing who owns what |
| 2 | **Quick Filters** — Filter board by assignee, priority, label, issue type, status | Top bar quick filters | Essential for large boards; Jira's most-used feature |
| 3 | **WIP Limits** — Max items per column with visual warning | Column "max issues" setting | Prevents column overflow; Kanban best practice |
| 4 | **Card ordering within columns** — Drag to reorder cards inside a column | Implicit via `boardRank` | Currently cards have no order within columns |
| 5 | **Quick-add card** — "+" button at bottom of each column to create a card inline | "Create issue" in column | Faster workflow; no page navigation |
| 6 | **Sub-task cards on board** — Show subtasks as separate smaller cards under parent story, collapsible | Sub-tasks on active sprint board | Full traceability; Jira shows subtasks |

### 🎯 PRIORITY 2 — Enhanced Card & Drawer UX

| # | Missing Feature | Jira Equivalent | Why It Matters |
|---|----------------|-----------------|----------------|
| 7 | **Card context menu** — Right-click or ⋮ menu: Move to column, Copy link, Delete, Convert type | Card "..." menu | Faster actions without opening drawer |
| 8 | **Card color coding** — Left border color by epic or priority | Card color by epic | Visual scanning at a glance |
| 9 | **Inline sprint date editing** — Start/end dates in sprint header | Sprint detail popup | Currently dates only in API, not UI |
| 10 | **Due dates** — Add `dueDate` field to Requirement, show on card | Due date field | Time-bound work tracking |
| 11 | **Comments/Activity feed** in issue drawer | Activity tab in issue view | Collaboration; Jira's core feature |
| 12 | **Time tracking** — Original estimate, time spent, remaining | Time tracking fields | Sprint capacity planning |
| 13 | **Bulk actions** — Checkbox select multiple cards, bulk move/status change | Bulk change | Manage many items at once |

### 🎯 PRIORITY 3 — Board Polish & Advanced Features

| # | Missing Feature | Jira Equivalent | Why It Matters |
|---|----------------|-----------------|----------------|
| 14 | **Epic lane view** — Show epics as horizontal swimlanes with progress bars | Epic panel | Portfolio view of progress |
| 15 | **Sprint progress bar** — Visual progress in sprint header | Sprint progress indicator | Quick health check |
| 16 | **Compact card mode** — Smaller cards showing just key + title | Card layout toggle | Dense board view |
| 17 | **Column collapse/expand** — Hide/show columns | Column toggle | Focus on relevant columns |
| 18 | **Board settings drawer** — Configure columns, WIP limits, swimlane mode | Board settings | User customization |
| 19 | **Assignee avatars** — Real user avatars (currently just initials) | User avatars | Visual team recognition |
| 20 | **Card hover preview** — Quick peek on hover without clicking | Hover card | Faster scanning |

---

## 3. DESIGN VISION — "Better Than Jira"

Jira's design is cluttered, information-dense, and visually noisy. Our design philosophy:

### 🎨 Visual Principles

1. **Cleaner information hierarchy** — Less visual noise, better spacing
2. **Superior color system** — Soft pastels with semantic meaning, not Jira's harsh colors
3. **Modern card design** — Rounded corners, subtle shadows, colored left-border for epic/priority
4. **Better typography** — Inter or system font, clearer weight hierarchy
5. **Smart whitespace** — Cards breathe, columns have clear separation
6. **Dark mode excellence** — Every feature must look great in dark mode
7. **Micro-interactions** — Smooth transitions, satisfying DnD, hover states

### 🎨 Color Palette (Extend existing)

```
Column accents (top border):
- To Do:    slate-400   → Keep
- In Prog:  blue-500    → Keep  
- Blocked:  red-500     → Keep
- Done:     emerald-500 → Keep

NEW: Card left-border color coding by priority:
- Critical:  border-l-4 border-l-red-500
- High:      border-l-4 border-l-orange-400
- Medium:    border-l-4 border-l-amber-400
- Low:       border-l-4 border-l-slate-300

NEW: Card left-border color coding by epic (cycling):
- Epic 1: border-l-violet-500
- Epic 2: border-l-pink-500
- Epic 3: border-l-cyan-500
- Epic 4: border-l-amber-500
- (cycle through 8 distinct colors)
```

### 🎨 Card Design Improvements

Current card: basic border, small text, limited info.  
New card:
- **Colored left border** (by priority OR by epic — user toggles)
- **Larger, more readable title** (13px → 14px, slightly more line-height)
- **Better badge layout** — priority icon + status + assignee in one clean row
- **Epic chip** — small colored pill instead of text
- **Hover elevation** — subtle shadow increase on hover
- **Drag ghost** — rotated slightly, stronger shadow (already partially done)

---

## 4. IMPLEMENTATION PLAN — STEP BY STEP

### Phase 1: Foundation — Board State & Configuration

**Goal**: Add board configuration state (swimlanes, quick filters, WIP limits, card color mode)

#### 4.1.1 Create `board-config.ts` (new file)

Create `/src/components/board/board-config.ts`:

```typescript
// Board display configuration — persisted in localStorage per project
export type SwimlaneMode = "none" | "assignee" | "epic" | "parent"
export type CardColorMode = "priority" | "epic" | "none"
export type CardSize = "compact" | "normal"

export interface BoardConfig {
  swimlaneMode: SwimlaneMode
  cardColorMode: CardColorMode
  cardSize: CardSize
  wipLimits: Record<string, number> // column id → max items
  collapsedColumns: string[] // column ids that are collapsed
  quickFilters: {
    assignees: string[]
    priorities: string[]
    labels: string[]
    types: string[] // Story, Task, Bug
  }
}

export const DEFAULT_CONFIG: BoardConfig = {
  swimlaneMode: "none",
  cardColorMode: "priority",
  cardSize: "normal",
  wipLimits: { todo: 0, inprogress: 0, blocked: 0, done: 0 }, // 0 = no limit
  collapsedColumns: [],
  quickFilters: { assignees: [], priorities: [], labels: [], types: [] },
}

export function loadBoardConfig(projectId: string): BoardConfig {
  try {
    const raw = localStorage.getItem(`board-config-${projectId}`)
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG
  } catch { return DEFAULT_CONFIG }
}

export function saveBoardConfig(projectId: string, config: BoardConfig) {
  localStorage.setItem(`board-config-${projectId}`, JSON.stringify(config))
}

// Epic color cycling (8 distinct colors)
export const EPIC_COLORS = [
  "border-l-violet-500",
  "border-l-pink-500",
  "border-l-cyan-500",
  "border-l-amber-500",
  "border-l-emerald-500",
  "border-l-orange-500",
  "border-l-sky-500",
  "border-l-rose-500",
]
export function epicColorIndex(epicId: string): number {
  let hash = 0
  for (let i = 0; i < epicId.length; i++) hash = ((hash << 5) - hash) + epicId.charCodeAt(i)
  return Math.abs(hash) % EPIC_COLORS.length
}
```

#### 4.1.2 Update `shared.tsx` — Add types and helpers

Add to `shared.tsx`:
- `BoardConfig` import (or keep in separate file)
- Update `Story` interface: add `dueDate?: string | null`, `subtasks?: Subtask[]` is already there
- Update `BOARD_COLUMNS` to support WIP limit metadata

#### 4.1.3 Update API — Add `boardRank` support to requirements

In `/src/app/api/projects/[projectId]/requirements/route.ts` GET:
- Already fetches requirements with all needed relations ✅
- Order by `boardRank` asc when `sprintId` is set (for board view ordering)

In `/src/app/api/requirements/[requirementId]/route.ts` PUT:
- Support `boardRank` updates for card reordering within columns

**Check**: The existing `boardRank` field exists in Prisma schema but is unused. We need to start using it.

### Phase 2: Quick Filters & Board Toolbar

**Goal**: Add a filter toolbar above the board (in `scrum-board.tsx` and `sprint-kanban.tsx`)

#### 4.2.1 Create `board-toolbar.tsx` (new component)

Create `/src/components/board/board-toolbar.tsx`:

A toolbar component that appears above the board with:
- **Swimlane selector**: dropdown — "No swimlanes", "Assignee", "Epic", "Parent Story"
- **Card color toggle**: icon buttons — Priority / Epic / None
- **Card size toggle**: Compact / Normal icon buttons
- **Quick filter chips**:
  - Assignee filter: multi-select dropdown showing all unique assignees from visible stories
  - Priority filter: toggle chips (Low / Medium / High / Critical)
  - Label filter: multi-select dropdown showing all unique labels
  - Type filter: toggle chips (Story / Task / Bug)
  - Clear all filters button (appears when any filter is active)
- **Search input** (move existing search from `scrum-board.tsx` into toolbar)
- **Board settings button** (gear icon) — opens config drawer

Visual design:
- Horizontal toolbar, sticky on scroll
- Filter chips use the same color coding as cards
- Active filters have filled background, inactive have border only
- "Clear all" appears as a subtle text button when filters active

#### 4.2.2 Update `scrum-board.tsx` — Integrate toolbar

- Import and render `BoardToolbar` when `view === "board"`
- Pass `stories`, `config`, `onConfigChange` to toolbar
- Filter `visible` stories through quick filters BEFORE passing to `SprintKanban`
- Remove duplicate search from sprint kanban header (centralize in toolbar)

### Phase 3: Swimlanes Implementation

**Goal**: Group cards horizontally within columns by swimlane mode

#### 4.3.1 Update `sprint-kanban.tsx` — Add swimlane support

When `swimlaneMode !== "none"`:

```
Current layout: [Column] → list of cards
New layout with swimlanes:
[Column]
  ├─ Swimlane: "Alice" (header with name + count)
  │   ├─ Card 1
  │   └─ Card 2
  ├─ Swimlane: "Bob"
  │   └─ Card 3
  └─ Swimlane: "Unassigned"
      └─ Card 4
```

Implementation:
- Group `sprintStories` by swimlane key within each column
- Render a `SwimlaneHeader` for each group (collapsible)
- Cards within swimlanes are still draggable between columns
- **Critical**: Drag & drop must still work — the droppable target is the COLUMN, not the swimlane

Swimlane grouping logic:
- `"assignee"`: group by `story.assignee || "Unassigned"`
- `"epic"`: group by `story.epic?.epicKey || "No Epic"`
- `"parent"`: group by `story.parent?.requirementKey || "Independent"` (for subtasks)

Swimlane header design:
- Full width, subtle background (`bg-muted/30`), rounded
- Left: swimlane name + issue count + point count
- Right: collapse/expand chevron
- Sticky within column scroll (optional, nice-to-have)

### Phase 4: WIP Limits & Column Enhancements

**Goal**: Add WIP limit visualization and column controls

#### 4.4.1 Update `sprint-kanban.tsx` — WIP limits

In `KanbanColumn`:
- Show count as `3/5` when WIP limit is set (current/limit)
- Visual warning when exceeded:
  - Column header background shifts to `bg-red-50 dark:bg-red-950/20`
  - Border color changes to `border-red-300`
  - Warning icon appears (⚠️)
- Column is still droppable even when over limit (Jira allows this with warning)

#### 4.4.2 Column collapse/expand

- Add collapse button to column header
- Collapsed column: shows only header with count, minimal width (~60px)
- Expanded: full width
- Animate width transition with CSS transition

### Phase 5: Enhanced Cards

**Goal**: Redesign cards with color coding, better info density, context menu

#### 4.5.1 Update `StoryCardView` in `shared.tsx`

New card design:

```
┌─────────────────────────────────────────┐
│█│ 🔖 STORY-001      ↳ parent    [EPIC] │  ← colored left border █
│ │ This is the story title text...       │
│ │                                       │
│ │ 🏷️ label1  label2          👤 AB  5pts│  ← badges row
│ │ 🚩 In Testing  🧪3  🐛1  📋2          │  ← meta row
└─────────────────────────────────────────┘
```

Changes:
1. **Colored left border**: `border-l-4` + dynamic color class based on `cardColorMode`
2. **Larger title**: `text-[13px] leading-snug` → `text-sm leading-relaxed`
3. **Better meta row layout**:
   - Row 1: Priority icon + Status pill + Epic chip (if exists) + Parent ref (if exists)
   - Row 2: Labels (max 2) + Test count + Bug count + Child count + Assignee avatar + Points
4. **Assignee avatar**: Keep current initials badge, but make it slightly larger (w-6 h-6)
5. **Epic chip**: Small rounded pill with epic color, not just text
6. **Hover state**: `hover:shadow-md hover:border-indigo-300` (enhance existing)
7. **Compact mode**: When `cardSize === "compact"`, reduce padding, smaller text, hide description/meta except key+title+status

#### 4.5.2 Card context menu (⋮)

Add to `StoryCardView`:
- A `⋮` (more-vertical) button that appears on hover
- Menu items:
  - "Move to →" submenu: To Do / In Progress / Blocked / Done
  - "Copy link"
  - "Delete" (with confirmation)
  - "Add subtask" (navigates to create page with parent pre-filled)

Use `@radix-ui/react-dropdown-menu` (already in dependencies).

### Phase 6: Quick-Add Card Inline

**Goal**: Add "+" button at bottom of each column to create a card without leaving the board

#### 4.6.1 Create `quick-create-card.tsx` (new component)

A lightweight inline form that appears when clicking "+" at column bottom:
- Input field for title (auto-focus)
- Type selector (Story/Task — default Story)
- Priority selector (default Medium)
- "Create" button + "Cancel" link
- On submit: POST to `/api/projects/[projectId]/requirements` with:
  - `requirementKey`: auto-generated via `nextIssueKey()`
  - `status`: the column's primary status
  - `sprintId`: current sprint
  - Other fields: defaults
- On success: prepend to column list (optimistic), then reload

### Phase 7: Issue Drawer Enhancements

**Goal**: Add comments/activity, due date, time tracking to the drawer

#### 4.7.1 Update `issue-drawer.tsx`

Add new sections (between existing sections):

1. **Due Date field** (new):
   - Date input showing `story.dueDate`
   - Display "Overdue" badge in red if past due
   - Patch on change

2. **Time Tracking** (new):
   - Three fields: Original Estimate (hours), Time Spent (hours), Remaining (hours)
   - Visual progress bar: `Time Spent / Original Estimate`
   - Store in new JSON field or extend schema

3. **Comments / Activity** (new, replace or augment existing sections):
   - Create `/src/components/board/activity-feed.tsx`
   - Fetch from new API: `/api/requirements/[id]/activity`
   - Activity types: status change, assignee change, sprint change, comment
   - Comment input at bottom
   - Show as chronological feed with user avatar + timestamp
   - For now, mock with a simple comment model or use a lightweight approach

#### 4.7.2 Schema additions (Prisma migration needed)

Since we need due date and time tracking, check if we can avoid schema changes first:
- `dueDate`: Check if it exists... Looking at schema, `Requirement` does NOT have `dueDate`. We need to add it.
- Time tracking: Could store as JSON in an existing field or add columns.

**Minimal schema change approach**:
- Add `dueDate DateTime?` to `Requirement` model
- Add `timeEstimate Int?` (minutes), `timeSpent Int?` (minutes) to `Requirement` model
- Create `RequirementComment` model:
  ```prisma
  model RequirementComment {
    id            String      @id @default(uuid())
    requirementId String
    requirement   Requirement @relation(fields: [requirementId], references: [id], onDelete: Cascade)
    author        String      // free-text for now
    content       String
    createdAt     DateTime    @default(now())
    @@index([requirementId])
  }
  ```

Run `npx prisma migrate dev --name add_board_fields` after updating schema.

### Phase 8: Sprint Header Enhancements

**Goal**: Richer sprint header with progress and inline date editing

#### 4.8.1 Update sprint header in `scrum-board.tsx`

Current sprint header: name + status pill + goal + story count
New sprint header:
- **Progress bar**: Visual bar showing % of stories in Done status
  - Green portion = Done, Blue = In Progress, Gray = To Do, Red = Blocked
  - Shows "5/12 done" text
- **Date range**: Inline editable start/end dates (date pickers)
  - Currently API supports dates but UI doesn't expose them
- **Sprint goal**: Inline editable (click to edit, blur to save)
- **Story count + points**: Keep, but make more prominent

### Phase 9: Sub-Task Cards on Board

**Goal**: Show subtasks as separate draggable cards with parent relationship visible

#### 4.9.1 Update `sprint-kanban.tsx` — Include subtasks

Currently `sprintStories` only includes Requirements. Subtasks (`RequirementSubtask`) are NOT shown on the board.

Options:
1. **Show subtasks as cards** (Jira style): Each subtask appears as a smaller card. Requires subtasks to have `status` and `sprintId` fields, which they don't currently.
2. **Show subtasks inside parent card** (expandable): Add an expand/collapse toggle on story cards to show subtasks inline. This is easier and still very useful.

**Recommended**: Option 2 (expandable subtasks in card) — much simpler, no schema changes.

In `StoryCardView`:
- If story has subtasks, show "▼ 3 subtasks" toggle
- When expanded, show subtask list below card content:
  - Checkbox (toggle `done` via API call to `/api/requirements/[id]/subtasks/[subtaskId]`)
  - Subtask title
  - Assignee initials
- Subtask completion updates the parent card's visual state (e.g., progress indicator)

Create new API routes:
- `POST /api/requirements/[id]/subtasks` — create subtask
- `PATCH /api/requirements/[id]/subtasks/[subtaskId]` — toggle done, update title/assignee
- `DELETE /api/requirements/[id]/subtasks/[subtaskId]` — delete subtask

### Phase 10: Board Settings Drawer

**Goal**: User-configurable board settings

#### 4.10.1 Create `board-settings-drawer.tsx` (new component)

Slide-out drawer (similar to issue drawer) with:
- **Columns tab**: Reorder columns (future), set WIP limits per column
- **Swimlanes tab**: Select swimlane mode
- **Cards tab**: Select color mode, card size
- **General**: Reset to defaults

This is a configuration UI for the `BoardConfig` state.

### Phase 11: Bulk Actions

**Goal**: Select and act on multiple cards

#### 4.11.1 Implement bulk selection

In `sprint-kanban.tsx`:
- Add checkbox to each card (appears when "bulk mode" is active)
- "Bulk mode" toggle button in toolbar
- When in bulk mode:
  - Cards show checkbox in top-left
  - Bottom bar appears with: "X selected" + "Move to [column]" + "Set status [status]" + "Assign to [assignee]" + "Delete"
- Batch API: Update existing PATCH endpoint to accept arrays, or create `PATCH /api/requirements/bulk`

---

## 5. FILE CHANGE SUMMARY

### New Files to Create

| File | Purpose |
|------|---------|
| `/src/components/board/board-config.ts` | Config types, localStorage persistence, epic color cycling |
| `/src/components/board/board-toolbar.tsx` | Quick filters + swimlane selector + card controls |
| `/src/components/board/quick-create-card.tsx` | Inline card creation form |
| `/src/components/board/board-settings-drawer.tsx` | Board configuration UI |
| `/src/components/board/activity-feed.tsx` | Comments & activity timeline |
| `/src/components/board/bulk-action-bar.tsx` | Bottom bar for multi-select actions |

### Files to Modify

| File | Changes |
|------|---------|
| `/src/components/board/shared.tsx` | Add `dueDate`, enhance `StoryCardView` with color borders, context menu, compact mode, subtask expansion |
| `/src/components/board/scrum-board.tsx` | Integrate toolbar, pass config down, filter stories |
| `/src/components/board/sprint-kanban.tsx` | Add swimlane rendering, WIP limits, column collapse, quick-add, bulk selection |
| `/src/components/board/issue-drawer.tsx` | Add due date, time tracking, activity feed sections |
| `/src/components/board/sprint-reports.tsx` | Minor polish (if needed) |
| `/prisma/schema.prisma` | Add `dueDate`, `timeEstimate`, `timeSpent` to Requirement; add `RequirementComment` model |
| `/src/app/api/requirements/[requirementId]/route.ts` | Support new fields in PUT |
| `/src/app/api/projects/[projectId]/requirements/route.ts` | Return `dueDate`, `timeEstimate`, `timeSpent` |
| `/src/app/api/requirements/[id]/subtasks/route.ts` | NEW: CRUD subtasks |
| `/src/app/api/requirements/[id]/comments/route.ts` | NEW: CRUD comments |

---

## 6. CRITICAL IMPLEMENTATION NOTES

### ⚠️ DO NOT BREAK EXISTING FUNCTIONALITY

1. **Preserve all existing API contracts** — The frontend currently consumes `/api/projects/[projectId]/requirements` and expects specific fields. Add new fields, don't remove existing ones.
2. **Preserve DnD** — @dnd-kit setup in both `scrum-board.tsx` (backlog) and `sprint-kanban.tsx` (board) must keep working. Test drag between columns and between backlog/sprints.
3. **Preserve dark mode** — All new UI must support `dark:` Tailwind classes.
4. **Preserve issue drawer** — The drawer is complex; add sections at the bottom, don't restructure existing ones.
5. **Preserve report charts** — Burndown and velocity SVG charts should not be affected.

### 🔧 Technical Guidelines

1. **Use existing dependencies only** — No new npm packages. We have:
   - `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` for DnD
   - `@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog` for menus/modals
   - `lucide-react` for icons
   - `tailwind-merge`, `clsx` for class merging
   - `zustand` is in deps but not required for this scope

2. **localStorage for config** — Board config is per-user, per-project. Use `board-config-${projectId}` key.

3. **Optimistic updates** — Continue the existing pattern: update local state immediately, then PATCH. On error, reload.

4. **Type safety** — All new code in TypeScript. Update `Story` interface in `shared.tsx` as the single source of truth.

5. **Responsive design** — Board must work on:
   - Desktop: 4 columns side by side
   - Tablet: 2 columns
   - Mobile: 1 column with horizontal scroll

### 🧪 Testing Checklist (Manual)

After implementation, verify:
- [ ] Backlog DnD still works (story → sprint, sprint → backlog)
- [ ] Board DnD still works (column → column)
- [ ] Issue drawer opens, edits save, closes correctly
- [ ] Create sprint modal works
- [ ] Create work item page works
- [ ] Reports (burndown + velocity) still render
- [ ] Quick filters filter cards correctly
- [ ] Swimlanes group cards correctly (all 3 modes)
- [ ] WIP limits show warnings when exceeded
- [ ] Card color coding changes with toggle
- [ ] Compact mode renders smaller cards
- [ ] Quick-add card creates story in correct column
- [ ] Subtasks expand/collapse in card
- [ ] Due date saves and shows "Overdue" when past
- [ ] Comments can be added and display
- [ ] Dark mode looks correct for all new UI
- [ ] Build passes (`npm run build`)

---

## 7. VISUAL MOCKUP DESCRIPTION

### Board View (with all enhancements active)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  🎯 Scrum Board                                   [Search] [Filters ▼] [⚙️] │
├──────────────────────────────────────────────────────────────────────────────┤
│  [Backlog] [Sprint Board ●] [Reports]                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  Swimlanes: [No swimlanes ▼]  Color: [Priority ●] [Epic] [None]  Size: [▭▭] │
│  Filters: [Assignee ▼] [Priority: High ●] [Label: api ▼] [Type: Story ●] ✕ │
├──────────────────────────────────────────────────────────────────────────────┤
│ Sprint 1 (active)  🎯 Goal: Ship login flow  ████████░░ 8/12 done  45 pts   │
│ Jun 1 – Jun 14                                                               │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────────┤
│  TO DO (2/5) │  IN PROGRESS │   BLOCKED ⚠️ │    DONE      │  ▶ (collapsed)   │
│  ━━━━━━━━    │  ━━━━━━━━━━━ │   ━━━━━━━━   │  ━━━━━━━━━━━ │                  │
│              │              │   3/3 WIP!   │              │                  │
│ ┌────────┐   │ ┌────────┐   │ ┌────────┐   │ ┌────────┐   │                  │
│ │█STORY   │   │ │█STORY   │   │ │█STORY   │   │ │█STORY   │   │                  │
│ │ Fix...  │   │ │ Add...  │   │ │ API...  │   │ │ Login   │   │                  │
│ │ 🏷️ api  │   │ │ 🏷️ ui   │   │ │ 🏷️ api  │   │ │ ✅ Done │   │                  │
│ │ 🚩High  │   │ │ 🚩Med   │   │ │ 🚩High  │   │ │ 8pts    │   │                  │
│ │ 👤 AB   │   │ │ 👤 CD   │   │ │ 👤 EF   │   │ │ 👤 AB   │   │                  │
│ └────────┘   │ └────────┘   │ └────────┘   │ └────────┘   │                  │
│ ┌────────┐   │ ┌────────┐   │              │              │                  │
│ │█TASK    │   │ │█STORY   │   │              │              │                  │
│ │ Ref...  │   │ │ Update..│   │              │              │                  │
│ │ 🏷️ ref  │   │ │ 🏷️ ui   │   │              │              │                  │
│ │ 🚩Low   │   │ │ 🚩Med   │   │              │              │                  │
│ │ 👤 CD   │   │ │ 👤 GH   │   │              │              │                  │
│ └────────┘   │ └────────┘   │              │              │                  │
│ + Add card   │ + Add card   │ + Add card   │ + Add card   │                  │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────────┘
```

Key visual improvements over Jira:
1. **Cleaner toolbar** — One line instead of Jira's massive header
2. **Sprint progress bar** — Inline, compact, informative
3. **WIP warning** — Red header + explicit text, not just a subtle number
4. **Colored card borders** — Instant visual grouping without clutter
5. **Consistent spacing** — Cards don't feel crammed
6. **Better typography** — Clearer hierarchy, less ALL CAPS shouting

---

## 8. EXECUTION ORDER (Recommended)

Implement in this order to avoid merge conflicts and maintain working state:

1. **Phase 1**: `board-config.ts` + update `shared.tsx` types (no visual change)
2. **Phase 5**: Enhanced `StoryCardView` (visual improvement, low risk)
3. **Phase 2**: `board-toolbar.tsx` + integrate in `scrum-board.tsx` (filtering, no schema change)
4. **Phase 4**: WIP limits + column collapse (builds on toolbar config)
5. **Phase 3**: Swimlanes (builds on toolbar config)
6. **Phase 6**: Quick-add card (independent feature)
7. **Phase 9**: Subtask expansion in cards (independent)
8. **Phase 7**: Issue drawer enhancements (schema change needed)
9. **Phase 8**: Sprint header enhancements
10. **Phase 10**: Board settings drawer
11. **Phase 11**: Bulk actions (most complex, do last)

After each phase, run `npm run build` to verify no TypeScript errors.

---

> **End of Prompt** — This is a complete, self-contained specification. Implement all phases for a Jira-grade (and visually superior) Kanban board experience.
