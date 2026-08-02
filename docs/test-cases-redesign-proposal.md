# Test Cases page — redesign proposal

Status: **awaiting sign-off**. No code written yet beyond the bug fixes already landed.

---

## 1. What's actually wrong

The page is not badly *styled*. It's badly *shaped*. Three specific faults, in order of severity.

### Fault 1 — the client does the database's job

The server hands back five raw datasets and the page joins them by hand during render:

| Endpoint | What it returns | Why the page wants it |
| :-- | :-- | :-- |
| `/test-cases` | every case, **with every step** | the list |
| `/test-cases/history` | every run + every manual case, ever | one "last status" per case |
| `/bug-reports` | every bug in the project | a bug count per case |
| `/test-runs` | every run in the project | the Runs tab |
| `/integrations/sync-status` | sync map | a sync badge |

Then `getTraceabilityDetails()` runs `bugs.filter(...)` **once per test case, on every render**. That's O(cases × bugs) in the render path.

Nothing is paginated. A project with 2,000 cases and 20,000 runs downloads all of it to render 30 rows.

### Fault 2 — organisation and traceability are the same tree, and shouldn't be

The left tree is built from `Requirement`, and test cases attach to requirements **many-to-many**. So the tree answers "which stories does this case relate to", but it's being used as "where does this case live".

Consequences:

- A case linked to two stories under different epics appears **twice**. Node counts don't sum to the project total.
- There is no way to file a case anywhere. Cases with no story link are invisible in the tree — reachable only via the "Orphans" filter.
- You cannot reorganise. There are no folders to drag between.

This is the architectural error. Coverage and filing are different questions and need different structures.

### Fault 3 — one component, no boundaries

2,121 lines. 53 `useState`. 30 `fetch` calls. 11 requests on mount. No React Query, while the scrum module next door uses it throughout — so there's no cache, and every mutation triggers a manual multi-fetch refetch cascade.

Also found while reading:

- `GET /test-cases` is gated on `requireProjectOwner`, not `requireProjectMember`. **Non-owner members likely cannot see test cases at all.** Worth confirming against a real member account.
- The history endpoint has no `take` limit and no aggregation — it pulls the full run history to compute one row per case.

---

## 2. Advice on the question you left open

> *A test case can link to several stories under different epics. Should it appear under each?*

The question dissolves once filing and coverage are separated. My recommendation:

- **Suites** (new) — real folders. Every case lives in **exactly one**. Counts sum to the project total. This is the default left-rail tree, and what you drag cases between.
- **Coverage** (existing story links) — a second, read-only view of the same rail. Here a case genuinely *should* appear under every story it covers, because the question is "is this story tested?", not "where does this case live". Node counts get labelled "cases covering this", so they're never mistaken for ownership.

Same data, two lenses, neither one lying.

---

## 3. Proposed architecture

### 3.1 Schema

Two additions. Both need a migration.

**a. `TestSuite`** — a project-scoped tree giving cases a real home.

```prisma
model TestSuite {
  id        String      @id @default(uuid())
  projectId String
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parentId  String?
  parent    TestSuite?  @relation("SuiteTree", fields: [parentId], references: [id], onDelete: Cascade)
  children  TestSuite[] @relation("SuiteTree")
  name        String
  description String?
  orderIndex  Int       @default(0)
  testCases   TestCase[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
  @@index([parentId])
}
```

`TestCase.suiteId String?` — nullable, so existing cases land in an "Unfiled" bucket rather than breaking.

**b. Execution rollup on `TestCase`** — so status stops being a computed scan.

```prisma
enum TestCaseStatus {
  NotExecuted
  Passed
  Failed
  Blocked
  Warning
  Skipped
}

// on TestCase:
lastStatus    TestCaseStatus @default(NotExecuted)
lastRunAt     DateTime?
lastRunId     String?
lastRunSource ExecutionType?
openBugCount  Int            @default(0)

@@index([projectId, lastStatus])
@@index([projectId, suiteId])
```

Kept current at four write points — nowhere else touches it:

1. `TestRun` reaches a terminal status → write rollup
2. `ManualSessionCase` completes → write rollup (later `completedAt` wins)
3. `BugReport` created / closed / reopened → recount `openBugCount`
4. Backfill in the migration for existing rows

**Why this matters:** today you cannot sort or filter by status on the server, because status doesn't exist in the database. That single fact is what forces the client to download everything. This column is what unlocks pagination.

### 3.2 API

Replace five calls with three.

**`GET /api/projects/:id/test-cases`** — list, server-filtered, server-sorted, cursor-paginated.

Query: `q, suiteId, status[], priority[], executionType, tags[], trace=orphans|broken, sort, cursor, limit`

Returns summary rows only — **no steps**:

```ts
{ id, title, priority, executionType, source, suite: { id, name } | null,
  lastStatus, lastRunAt, lastRunSource, openBugCount,
  requirementCount, isSynced, tags }
```

**`GET /api/projects/:id/test-cases/:tcId`** — full detail: steps, requirement links, recent runs, linked bugs, sync state. Fetched **only when a case is selected**. Today every step of every case is loaded up front to render a list that shows none of them.

**`GET /api/projects/:id/test-cases/facets`** — one `groupBy` returning the header counts and per-suite tallies. Replaces counting client-side over the full set.

All three on `requireProjectMember`, not `requireProjectOwner`.

### 3.3 Client

- **React Query**, matching the scrum module. Query keys `["test-cases", projectId, filters]`.
- **URL-driven state** — filters and selection in `searchParams`, as the scrum page does. Makes views shareable and the back button work.
- **Split into components**, roughly:

```
test-cases/
  page.tsx                    ~120 lines, layout + URL state only
  _components/
    suite-tree.tsx            left rail, Suites | Coverage toggle
    case-table.tsx            virtualised rows (react-virtuoso, already a dep)
    case-row.tsx
    facet-bar.tsx             header counts, clickable as filters
    detail-panel/
      index.tsx               lazy-loads on selection
      details-tab.tsx
      runs-tab.tsx
      bugs-tab.tsx
      sync-tab.tsx
    create-case-drawer.tsx
    recorder-drawer.tsx       currently ~200 lines inline
    bulk-action-bar.tsx
  _hooks/use-test-cases.ts
```

### 3.4 Layout

Keeping three regions — the shape suits QA work; the execution is what's poor.

- **Left rail** — segmented control: **Suites** (drag to file, single ownership) / **Coverage** (Epic → Feature → Story, read-only). Solves Fault 2.
- **Centre** — dense **virtualised table**, not cards. Columns: select, title, suite, priority, type, last status + when, bugs, sync. Sortable, server-side. Cards waste ~3× the vertical space per row, which is why 30 cases already feels unwieldy.
- **Right** — detail panel, lazy-loaded, tabs unchanged (Details / Runs / Bugs / Sync).
- **Top** — facet chips that are also filters. They're currently decorative.

---

## 4. Sequencing

Each phase ships independently and leaves the app working.

| Phase | Work | Risk |
| :-- | :-- | :-- |
| 1 | Migration: `TestSuite`, `TestCase` rollup columns, backfill | Medium — needs a migration + backfill verification |
| 2 | Rollup writes at the 4 mutation points, with tests | Low |
| 3 | The three endpoints, `requireProjectMember` | Low — additive, old routes stay |
| 4 | Rebuild UI on the new endpoints | Medium — biggest diff |
| 5 | Delete the old page and now-unused routes | Low |

Phases 1–3 are invisible to you. Phase 4 is where the page changes.

---

## 5. What I need from you

1. **Sign-off on `TestSuite`.** It's the load-bearing decision — it's what stops the tree lying about ownership.
2. **How to seed suites in the backfill.** Options: (a) everything into a single "Unfiled" suite, (b) generate one suite per existing Feature and file cases by their primary story, (c) leave `suiteId` null and let you organise by hand. I'd suggest **(b)** — it produces a sensible starting tree you can then rearrange, rather than one flat bucket.
3. **Confirm the member-access bug.** Log in as a non-owner project member and open Test Cases. If it's empty or errors, that's a live permissions bug and I'd fix it in Phase 3.
4. **Whether to keep the old page** behind a flag during Phase 4, or cut straight over.

---

## 6. Explicitly not in scope

- The Recorder drawer's behaviour — moved to its own file, logic unchanged.
- The AI generation endpoints.
- OpenProject sync internals — the sync *badge* is covered, the sync engine isn't.
