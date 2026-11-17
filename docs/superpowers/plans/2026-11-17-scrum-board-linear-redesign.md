# Scrum Board Linear Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/projects/[id]/scrum` in place to the approved light Linear look: two thin header rows, quiet cards, status ring icons, and blocked/test signals on cards.

**Architecture:** Board display state (swimlane, card layout, estimations, subtasks, quick filters, epic filter) moves from `BoardView` local state into the existing zustand store `useScrumUI` so the page header can host the Display menu and filter chips. `BoardView` keeps all drag/drop, column-edit and sprint logic but renders a single thin sprint sub-bar instead of two boxes. The task list GET merges in per-task board signals (blocked, test pass/fail) from one batched query.

**Tech Stack:** Next.js App Router, React, Tailwind (shadcn tokens), zustand, @tanstack/react-query, @hello-pangea/dnd, Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-scrum-board-linear-redesign-design.md`
**Visual reference:** `.superpowers/brainstorm/70572-1794923885/content/linear-board.html` (light)

## Global Constraints

- Light mode is the polished target; dark must still render legibly (use existing tokens: `bg-card`, `bg-muted`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`). No hard-coded `#fff` backgrounds.
- No Prisma schema change. Only the list GET route gains merged fields.
- Only real Tailwind shades (no `indigo-650`, `slate-450`, `h-8.5`).
- Type scale: body 13px (`text-[13px]`), meta 11–12px. Card radius `rounded-[7px]`, column lane `rounded-lg bg-muted/60`, card `border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]`.
- Issue type shown as a dot label, never a coloured left stripe.
- Every behaviour listed under "Anti-goals" in the spec must survive.

## Review Focus

- Card with a blocker that is already DONE/DEPLOYED → NOT shown as blocked (Task 1 test).
- Task with linked test cases all `NotExecuted` → no test bar shown, not "0 passed" (Task 1 test + Task 3 render rule).
- Pressing `C` or `/` while typing in an input, textarea, contenteditable (tiptap) or with the drawer open → must not trigger (Task 4 test).
- Swimlane mode on + drag between columns → indices still come from the flattened display list (unchanged `onDragEnd`; check in Task 5 manual verify).
- No active sprint → empty state still shows, header Display menu still harmless (Task 5 manual verify).

---

### Task 1: Board signals (blocked + test results) on the task list

**Files:**
- Create: `src/lib/scrum/board-signals.ts`
- Modify: `src/app/api/projects/[projectId]/scrum/tasks/route.ts` (GET, after the `findMany` at ~line 80)
- Modify: `src/types/scrum.ts` (`ScrumTask`)
- Test: `tests/unit/scrum-board-signals.test.ts`

**Interfaces:**
- Produces:
  - `export interface BoardSignals { blocked: boolean; tests: { passed: number; failed: number; total: number } }`
  - `export function summarizeSignals(input: { blockerStatuses: string[]; testStatuses: string[] }): BoardSignals` (pure)
  - `export async function loadBoardSignals(taskIds: string[]): Promise<Map<string, BoardSignals>>`
  - `ScrumTask.signals?: BoardSignals`

- [ ] **Step 1: Write the failing test** for `summarizeSignals`:

```ts
import { summarizeSignals } from "@/lib/scrum/board-signals"
it("blocked only while a blocker is unfinished", () => {
  expect(summarizeSignals({ blockerStatuses: ["IN_PROGRESS"], testStatuses: [] }).blocked).toBe(true)
  expect(summarizeSignals({ blockerStatuses: ["DONE", "DEPLOYED"], testStatuses: [] }).blocked).toBe(false)
  expect(summarizeSignals({ blockerStatuses: [], testStatuses: [] }).blocked).toBe(false)
})
it("counts executed tests only", () => {
  expect(summarizeSignals({ blockerStatuses: [], testStatuses: ["Passed", "Passed", "Failed", "NotExecuted", "Skipped"] }).tests)
    .toEqual({ passed: 2, failed: 1, total: 3 })
  expect(summarizeSignals({ blockerStatuses: [], testStatuses: ["NotExecuted"] }).tests)
    .toEqual({ passed: 0, failed: 0, total: 0 })
})
```
`total` = Passed + Failed + Blocked + Warning (Blocked/Warning count toward total only).

- [ ] **Step 2: Run** `npx vitest run tests/unit/scrum-board-signals.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `summarizeSignals` and `loadBoardSignals`. Loader runs, in `Promise.all`: `prisma.taskTestCase.findMany({ where: { taskId: { in } }, select: { taskId, testCase: { select: { lastStatus } } } })`, `prisma.taskLink.findMany({ where: { type: "is blocked by", sourceId: { in } }, select: { sourceId, target: { select: { status } } } })`, and `prisma.taskLink.findMany({ where: { type: "blocks", targetId: { in } }, select: { targetId, source: { select: { status } } } })`. Group per task, call `summarizeSignals`. Return empty map for empty ids (no queries).
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Wire** into list GET: after serializing, `const signals = await loadBoardSignals(tasks.map(t => t.id))` and set `signals: signals.get(t.id)` on each item. Add `signals?: BoardSignals` to `ScrumTask` (import type from the lib file).
- [ ] **Step 6:** `npx tsc --noEmit -p .` → no new errors in touched files.
- [ ] **Step 7: Commit** `feat(scrum): blocked and test-result signals on the task list`

### Task 2: Visual primitives in `scrum/shared.tsx`

**Files:** Modify `src/components/scrum/shared.tsx`

**Interfaces:**
- Produces:
  - `export function StatusIcon({ status, className }: { status: TaskStatus; className?: string })` — 14px SVG ring. TODO: grey empty ring; IN_PROGRESS: amber half fill; REVIEW: violet ¾ fill; TESTING: indigo ¾ fill; DONE: filled emerald with white check; DEPLOYED: filled cyan with check. Colours via Tailwind `text-*` + `currentColor`.
  - `export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string })` — 3 bars, filled count HIGHEST=urgent (red rounded square with "!"), HIGH=3, MEDIUM=2, LOW=1, LOWEST=1 at 30% opacity; `title` = `PRIORITY_META[p].label`.
  - `export const TYPE_DOT: Record<TaskType, string>` — `STORY: "bg-emerald-500", BUG: "bg-red-500", TASK: "bg-indigo-500", TEST_CASE: "bg-teal-500", SUBTASK: "bg-sky-500", EPIC: "bg-violet-500"`.
  - `export function DotLabel({ dotClass, dotColor, children }: { dotClass?: string; dotColor?: string; children: React.ReactNode })` — 20px-high rounded-full bordered pill, 7px dot, 11px muted text.
- Keep `PriorityBadge`, `STATUS_META`, `AvatarStack` exported (other views use them).

- [ ] **Step 1:** Implement the four exports.
- [ ] **Step 2:** `npx tsc --noEmit -p .` and `npx eslint src/components/scrum/shared.tsx` → clean.
- [ ] **Step 3: Commit** `feat(scrum): Linear-style status, priority and label primitives`

### Task 3: Card restyle (`task-card.tsx`)

**Files:** Modify `src/components/scrum/board/task-card.tsx` (render section, lines ~84–331; keep all quick-edit state and handlers)

**Interfaces:** Consumes Task 2 exports and `task.signals` (Task 1).

Layout (detailed):
1. Row: `task.key` (12px, `text-muted-foreground`, tabular-nums) · right: assignee `AvatarStack max={2}` (18px).
2. Title: 13px `font-medium leading-snug line-clamp-2`.
3. Meta row (wrap, gap-1.5): `PriorityIcon` in a 20px bordered square · `DotLabel` type (`TYPE_DOT`, label from `TYPE_META[type].label`) · `DotLabel` epic (`dotColor=epic.color`) when present · points chip when `!hideEstimations` · "Blocked" orange chip when `signals?.blocked` · overdue chip (red) · branch chip only when `branchName`.
4. Optional bar line (only one, priority order): tests when `signals.tests.total > 0` → "● N passed ● M failed" + split green/red 3px bar; else subtasks when `total > 0 && !hideSubtasks` → "Subtasks d/t" + accent bar.
5. Footer counters (comments/tests/bugs) dropped from the card face; comment count shown as small icon+number at the end of meta row only when `> 0`.

Compact: row 1 + title (`line-clamp-1`) + priority icon/points inline; no meta row.

Container: `rounded-[7px] border border-border bg-card p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-foreground/20`; dragging: `shadow-lg ring-1 ring-primary/30` (no rotate). Remove `TYPE_COLORS` and `border-l-4`. Quick-edit overlay: same behaviour, restyle to `h-6` icon buttons, `rounded-md border-border bg-card shadow-sm`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npx tsc --noEmit -p .` + eslint on the file → clean.
- [ ] **Step 3: Commit** `feat(scrum): Linear-style task card`

### Task 4: Board display state in the store + keyboard shortcuts

**Files:**
- Modify: `src/stores/scrum-ui.ts`
- Create: `src/hooks/scrum/use-board-shortcuts.ts`
- Test: `tests/unit/scrum-board-shortcuts.test.ts`

**Interfaces:**
- Produces in `useScrumUI`: `boardDisplay: { swimlane: SwimlaneMode; cardLayout: CardLayout; showEstimations: boolean; showSubtasks: boolean; quickFilters: QuickFilter[]; epicFilter: string | null }` (defaults `"none"`, `"detailed"`, `true`, `true`, `[]`, `null`) and `setBoardDisplay(patch: Partial<BoardDisplay>)`. Import the types from `card-layout-toggle`, `swimlane-toggle`, `quick-filters`.
- Produces: `export function isTypingTarget(el: EventTarget | null): boolean` (true for input, textarea, select, `[contenteditable]` or inside one) and `export function useBoardShortcuts(opts: { onSearch: () => void; onCreate: () => void; enabled: boolean }): void` — keydown on `window`; `/` → `onSearch`, `c`/`C` without modifiers → `onCreate`; ignored when `isTypingTarget(e.target)` or `!enabled`; `preventDefault` on handled keys.

- [ ] **Step 1: Write failing test** for `isTypingTarget` using plain objects shaped like elements (node env): `{ tagName: "INPUT" }` → true, `{ tagName: "TEXTAREA" }` → true, `{ tagName: "DIV", isContentEditable: true }` → true, `{ tagName: "DIV", isContentEditable: false, closest: () => null }` → false, `null` → false.
- [ ] **Step 2: Run** `npx vitest run tests/unit/scrum-board-shortcuts.test.ts` → FAIL.
- [ ] **Step 3: Implement** store slice + hook file.
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** `feat(scrum): shared board display state and / C shortcuts`

### Task 5: Page header (two rows) + BoardView restyle

**Files:**
- Modify: `src/app/(dashboard)/projects/[id]/scrum/page.tsx`
- Modify: `src/components/scrum/board/board-view.tsx`
- Create: `src/components/scrum/board/display-menu.tsx`
- Modify: `src/components/scrum/filters/search-bar.tsx` (forward a ref / accept `inputRef` so `/` can focus it)

**Interfaces:** Consumes Task 2 primitives, Task 4 store + `useBoardShortcuts`.

Row 1 (page, `h-11 border-b bg-card px-4`): breadcrumb `Projects › {project} › Scrum` (12px muted, last item foreground) · board key chip · segmented tabs (`rounded-md px-2.5 py-1`, active `bg-muted text-foreground ring-1 ring-border`) · right: `SearchBar` (with `/` kbd hint) · `DisplayMenu` (Board view only) · `FilterPanel` · `SavedViews` · overflow `…` menu holding Import + Create Sprint (permission-gated as today) · primary `New issue` dropdown with `C` kbd hint (existing type menu). Member `AvatarStack` stays at far right.

`DisplayMenu` (`display-menu.tsx`, `export function DisplayMenu()`): dropdown with Card layout (Compact/Detailed radio), Group by (None/Assignee/Epic radio), toggles Show estimations / Show subtasks — all reading/writing `boardDisplay`. Replaces `CardLayoutToggle`, `SwimlaneToggle` and the settings dropdown in BoardView (keep those files only if still imported elsewhere; otherwise delete).

Row 2 (rendered by `BoardView`, `h-10 border-b bg-card px-4 text-xs`, replaces both old boxes): quick-filter chips (dashed border when off, solid when on) + epic chip dropdown (existing logic, `X` to clear) · divider · `Goal:` sprint goal (truncate) · right: progress ring SVG (pct of points) + `pct% · done of total pts` · `N days left` (from `endDate`, "Ends today"/"Overdue Nd") · `N blocked` (orange, count of `signals?.blocked`, hidden when 0) · `Report` and `Complete sprint` ghost buttons (existing handlers/gates) · sprint name + dates go in row 1 breadcrumb tail when on Board view (pass via a small `activeSprint` lookup in page using `useScrumSprints`).

Page body: `bg-background` (not `bg-muted/40`), board padding `px-3 py-3`; BoardView no longer wraps itself in boxes.

Columns: `w-[272px] shrink-0` lanes `rounded-lg bg-muted/60 p-1.5`, header `h-8 px-1.5` = `StatusIcon` + name (13px medium) + count (muted, `/wip` when set, red + AlertTriangle when over) + right `+` and `…` (existing menus). Footer `+ Add issue` text button (12px muted) under the cards when `canCreateStories`, replacing the dashed empty-state box. Drag-over: `bg-primary/5 ring-1 ring-primary/30`. Swimlane headers: 11px muted text row, no filled box. Loading skeletons match `w-[272px]`.

- [ ] **Step 1:** Implement page header + `DisplayMenu` + `useBoardShortcuts({ onSearch: focus search, onCreate: () => openCreateTask(undefined, activeSprint?.id), enabled: !openTaskId && canCreateIssues })` (search shortcut enabled regardless of create permission — split into two calls or pass separately).
- [ ] **Step 2:** Implement BoardView row 2 + column restyle, reading display state from the store.
- [ ] **Step 3:** `npx tsc --noEmit -p .` + `npx eslint` on touched files → clean.
- [ ] **Step 4: Manual verify** with the `verify` skill: light + dark; drag card across columns with swimlanes None and Assignee; rename column + set WIP over limit; hover quick-edit; Report; Complete sprint dialog opens; `/` focuses search; `C` opens create, but not while typing in a comment (tiptap); `?task=` deep link; no-active-sprint empty state. Screenshot light mode.
- [ ] **Step 5: Commit** `feat(scrum): Linear-style board header and columns`

### Task 6: Backlog / List / Timeline alignment

**Files:** Modify `src/components/scrum/views/backlog-view.tsx`, `list-view.tsx`, `timeline-view.tsx`; `src/components/scrum/task/task-details-sidebar.tsx` (status control only)

- Replace status dots/pills with `StatusIcon`, priority badges with `PriorityIcon` in rows; type shown with `TYPE_DOT` dot; row height 36px, 13px text, `border-border` dividers, hover `bg-muted/50`; section headers 12px medium muted. No behaviour change.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** tsc + eslint clean; manual look at each tab in light and dark.
- [ ] **Step 3: Commit** `feat(scrum): align backlog, list and timeline with the new board look`
