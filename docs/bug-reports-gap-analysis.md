# Bug Reports — gap analysis

Audit of `src/app/(dashboard)/projects/[id]/bug-reports/page.tsx` (2,225 lines) and the 17 bug API routes.

Verified by reading code only. I cannot run the app, so nothing here is a rendering/layout finding — those need a browser.

---

## Summary

The **data model is excellent** — genuinely better than most bug trackers. `BugReport` already carries resolution, tags, environment, browser, viewport, role, console logs, network errors, page URL, OS, screen resolution, video, reporter, comments, activities, attachments, occurrences, requirement links and scrum links.

The **problem is that the UI and API don't use half of it**, and the same three structural faults from the test-cases page are present here.

---

## P0 — fix before anything else

### 1. Broken access control on the sync routes

`POST /api/bug-reports/[bugId]/sync` and `.../sync/openproject` check `requireAuth()` only. No project scoping. The handler then does:

```ts
await prisma.bugReport.update({ where: { id: params.bugId }, data: placement })
await syncBugReport(params.bugId)
```

Any authenticated user of any project can pass any bug id and write `openProjectParentId`, `openProjectBoardId`, `openProjectBoardColumnId` and `openProjectCustomFields` to it, then push it to a tracker.

Every other bug route guards correctly — the four bulk routes do an inline `userProjects` membership check, and the rest use `requireProjectOwner`. These two were missed.

**Fix:** load the bug, resolve `projectId`, then `requireProjectMember` (or `requireProjectPermission`) before the update.

### 2. Reads are gated on `requireProjectOwner`

Same defect already fixed on the test-cases page. `requireProjectOwner` requires `globalRole === "Admin" || role === "Owner" || role === "Admin"`, so an ordinary project member — a tester, the person who files most bugs — gets a **404** on:

- `GET /api/projects/:id/bug-reports` (the list)
- `GET /api/projects/:id/bug-reports/:bugId`
- `GET /api/bug-reports/:bugId`

**Fix:** reads → `requireProjectMember`. Writes stay owner/permission-gated.

### 3. No pagination

`GET /api/projects/:projectId/bug-reports` has no `take`, `skip` or `cursor`. It returns **every bug in the project**, with includes. The page then filters and groups client-side. This is the exact pattern removed from the test library — it degrades linearly and there's no ceiling.

---

## P1 — correctness

### 4. A request per keystroke

```ts
useEffect(() => { loadBugsList() },
  [projectId, filterSeverity, filterPriority, filterStatus, filterSource, searchQuery])
```

`searchQuery` is in the dependency array with **no debounce**. Typing "checkout" fires eight full list requests, each returning every bug in the project. Responses can also land out of order, so the list can settle on the wrong result.

### 5. No status-transition validation

`PATCH /api/bug-reports/[bugId]/status` accepts any `BugStatus` from any current status. Nothing enforces the workflow, so `Closed → Open`, or `Open → Closed` skipping retest, are both allowed silently.

Worse: `resolution` is optional everywhere. A bug can reach `Resolved` or `Closed` with `resolution = null`, which makes "why was this closed?" unanswerable and breaks any future reporting on fix rates.

**Fix:** an explicit transition map, and require `resolution` when entering `Resolved` / `Closed` / `Rejected`.

### 6. `BugOccurrence` is written but never shown

`on-test-run-completed.ts` records an occurrence each time a known bug reproduces. The page imports the type (`occurrences: BugOccurrence[]`) and **never renders it**.

This is the most valuable unused thing in the schema. "This bug has recurred 14 times across 6 runs, most recently 2 hours ago" is exactly what triage needs, and the data is already being collected.

---

## P2 — structural

### 7. The monolith

2,225 lines, 52 `useState`, 21 `fetch`, 8 `useEffect` in one component. Six of those effects fire on mount, four of them OpenProject metadata calls that are no-ops when the integration isn't configured — paid on every page load regardless.

No React Query, so every mutation triggers a manual full-list refetch.

### 8. Bespoke toast, again

`useState` + `setTimeout` + a fixed div, duplicating the `sonner` toaster already mounted in the dashboard layout. Same fix as the test-cases page.

### 9. Filters aren't in the URL

Filter state is local. A filtered view can't be shared or bookmarked, and the back button doesn't restore it. The page already reads `?bugId=` to open the drawer, so the pattern is half-present.

---

## What's missing that a bug tracker needs

Ordered by value, and all of them are cheap because the data already exists.

| Gap | Why it matters | Cost |
| :-- | :-- | :-- |
| **Recurrence panel** | `BugOccurrence` is populated and invisible. Distinguishes a one-off from a persistent regression. | Low — render existing data |
| **Age / time-in-status** | No SLA, no "open 47 days", no stale-bug surfacing. `createdAt` and `BugActivity` are there. | Low |
| **"Assigned to me" / "Unassigned"** | No way to see your own queue. `assignedTo` exists. | Low |
| **Resolution required on close** | Currently optional, so close reasons are unrecorded. | Low |
| **Duplicate detection at file time** | `mark-duplicate` exists for *after* the fact; nothing warns while filing. There's already `detect-duplicate-test-case` to model it on. | Medium |
| **Saved filters / views** | "My open criticals" must be rebuilt every visit. Needs URL filters (#9) first. | Medium |
| **Reopen count / regression flag** | `Reopened` is a status but reopen *count* isn't tracked. A bug reopened 3× is a different problem. | Medium — needs a column |
| **Bulk actions in board view** | Multi-select is list-only; the board has drag-and-drop but no bulk. | Medium |
| **Linked test case → auto-retest** | `retest` route exists; not wired to "bug Resolved → re-run the linked case". | Medium |
| **Severity × priority triage matrix** | Both fields exist; nothing visualises the intersection to drive triage order. | Medium |

---

## What already works well

Worth stating, so the rebuild doesn't throw it away:

- Rich evidence capture — screenshot, console logs, network errors, video, page URL, OS, resolution
- Six-tab detail drawer: overview, evidence, steps, test, activity, tracker
- List **and** board views with drag-and-drop status changes
- Bulk assign / priority / status / export, all correctly project-scoped
- Comments and a full activity log
- Provider-neutral tracker sync (Jira / Azure DevOps / ClickUp / OpenProject)
- AI draft and suggestion endpoints
- Bugs can be filed from manual steps, agent runs, visual diffs and test runs

---

## Suggested order

1. **P0 security** — scope the two sync routes. Small, isolated, ships alone.
2. **P0 permissions + pagination** — mirrors what was done for test-cases; the endpoint work is nearly identical.
3. **P1 correctness** — debounce, transition map, required resolution.
4. **Recurrence panel** — highest value per line of code in the whole list.
5. **Structural rebuild** — only after the above, and only if you want it.

Steps 1–3 are contained bug fixes. Step 5 is the same size of job as the test library rewrite.
