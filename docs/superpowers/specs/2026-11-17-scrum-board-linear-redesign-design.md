# Scrum Board — Linear-style redesign (light mode)

Date: 2026-11-17 · Size: small-to-medium (visual restyle, no data changes)
Reference mockup: `.superpowers/brainstorm/70572-1794923885/content/linear-board.html` (light)

## Intent

The user finds the current Scrum Board (`/projects/[id]/scrum`) badly designed and
wants it to look "modern and professional like Linear", better than Jira. They
rejected three earlier directions (dense dark, health-strip dashboard, colourful
Trello-ish) and approved a Linear-style mockup in **light mode**.

## Goals

- Linear look: neutral light surfaces, one indigo accent, Inter, thin borders,
  tight 13px type, colour only where it carries meaning (status, priority, labels).
- Cut the control clutter: today there are ~4 stacked rows (header, tabs+actions,
  sprint bar, filter/settings bar) above the columns. Target: **two thin rows**.
  - Row 1: breadcrumb + sprint name/dates · segmented Board/Backlog/List/Timeline ·
    Search (`/`) · Display menu · primary **New issue** (`C`).
  - Row 2: active filter chips + "+ Filter" · sprint goal · progress ring
    (% and done/total pts) · days left · blocked count · Report / Complete sprint.
- Cards: ID + assignee avatar · title · row of priority-bars icon, type label,
  epic label (epic colour dot), points. Conditional thin bar for subtasks, or
  green/red test results from linked test cases.
- Columns: soft grey lane, header = status icon (Linear-style ring, partial fill
  per status) + name + count + "+", "+ Add issue" at the bottom.
- Backlog, List, Timeline share the new header and visual language.

## Non-goals

- No Prisma schema changes. All shown data already exists in the DB
  (`TaskLink` "blocks"/"is blocked by" → blocked count, linked
  `TestCase.lastStatus` → pass/fail, `labels`, `epic.color`, sprint
  dates/goal/points). Correction found while planning: the task-list GET does
  not return link or test statuses today, so it gains one batched lookup that
  adds a `signals` field per task (read-only, no schema change).
- No app-wide restyle (sidebar, other pages) — possible follow-up.
- Dark mode is not redesigned; it must keep working via existing tokens
  (`darkMode: ["class"]`, next-themes) but polish targets light.

## Anti-goals (failure even if it "works")

- Losing any current behaviour: drag-and-drop (@hello-pangea/dnd), swimlanes,
  quick filters, epic filter, card layout compact/detailed, show estimations /
  subtasks settings, hover quick-edit (assignee/status/points), inline column
  rename/WIP, create column, saved views, filter panel, import, create sprint,
  create issue menu by type, sprint report, complete sprint, `?task=` deep link,
  remembered filters, permission gating.
- Rainbow colour: type is shown as a small dot label, not a thick coloured
  left stripe.
- Invalid Tailwind shades (see memory: hub pages use non-existent classes).

## Approaches considered

1. **Restyle in place** — rewrite the presentation of `scrum/page.tsx`,
   `board-view.tsx`, `task-card.tsx` (+ small shared bits), keep all logic.
   **Chosen** by the user: lowest risk, no duplicated code.
2. New board alongside old behind a toggle — rejected: doubles code right after
   the old board was retired.
3. App-wide Linear restyle — rejected for now: far bigger, touches pages not asked about.

## How (decided)

- Controls that move: board-view's sprint bar and filter/settings bar merge into
  header row 2; swimlane / card layout / estimations / subtasks toggles move into
  the **Display** dropdown; epic filter + quick filters become filter chips.
- Status icon component (SVG ring, fill by status) added to `scrum/shared.tsx`
  and reused by columns, list rows and the task drawer status pill.
- Priority shown as Linear bar icon (Urgent = filled red square with "!").
- Keyboard: `/` focuses search, `C` opens Create (ignored while typing in inputs).

## Left to the builder

- Exact token values (use existing CSS vars; add an indigo accent only if
  `--primary` doesn't already read as one).
- Whether Backlog/List/Timeline need more than header + colour alignment.
- Verify in the running app (`/verify` skill) in light and dark.
