# Full Implementation Guide — Jira-Grade Kanban Board

> Send this entire document to your AI coding agent. It contains every file change, schema migration, API route, and component needed.

---

## Step 0: Prerequisites

Before starting, verify these dependencies exist in `package.json`:

```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2",
"@radix-ui/react-dropdown-menu": "^2.0.6",
"@radix-ui/react-dialog": "^1.0.5",
"lucide-react": "^0.378.0",
"clsx": "^2.1.0",
"tailwind-merge": "^2.3.0"
```

They are already installed in this project.

---

## Step 1: Schema Migration

### 1.1 Edit `/prisma/schema.prisma`

Add `comments` relation and three new fields to the `Requirement` model, then add the new `RequirementComment` model.

**Find this section in `Requirement` model (~line 1146-1196):**

```prisma
model Requirement {
  id              String   @id @default(uuid())
  projectId        String
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  epicId           String?
  epic             Epic?    @relation(fields: [epicId], references: [id], onDelete: SetNull)
  requirementKey   String
  title            String
  description      String?
  acceptanceCriteria String?
  priority         Priority @default(Medium)
  status           RequirementStatus @default(Draft)
  source           RequirementSource @default(Manual)
  backlogRank      Int?
  storyPoints      Int?
  assignee         String?
  labels           String[]
  sprintId         String?
  sprint           Sprint?  @relation(fields: [sprintId], references: [id], onDelete: SetNull)
  boardRank        Int?
  featureId        String?
  feature          Feature? @relation(fields: [featureId], references: [id], onDelete: SetNull)
  parentId         String?
  parent           Requirement?  @relation("RequirementChildren", fields: [parentId], references: [id], onDelete: SetNull)
  children         Requirement[] @relation("RequirementChildren")
  figmaUrl         String?
  externalUrl      String?
  externalSystem   String?
  testCases        TestCaseRequirement[]
  bugReports       BugReportRequirement[]
  subtasks         RequirementSubtask[]
  sourceImportId   String?
  sourceImport     RequirementImport? @relation(fields: [sourceImportId], references: [id], onDelete: SetNull)
  sourceLocation   Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
```

**Replace it with:**

```prisma
model Requirement {
  id              String   @id @default(uuid())
  projectId        String
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  epicId           String?
  epic             Epic?    @relation(fields: [epicId], references: [id], onDelete: SetNull)
  requirementKey   String
  title            String
  description      String?
  acceptanceCriteria String?
  priority         Priority @default(Medium)
  status           RequirementStatus @default(Draft)
  source           RequirementSource @default(Manual)
  backlogRank      Int?
  storyPoints      Int?
  assignee         String?
  labels           String[]
  sprintId         String?
  sprint           Sprint?  @relation(fields: [sprintId], references: [id], onDelete: SetNull)
  boardRank        Int?
  featureId        String?
  feature          Feature? @relation(fields: [featureId], references: [id], onDelete: SetNull)
  parentId         String?
  parent           Requirement?  @relation("RequirementChildren", fields: [parentId], references: [id], onDelete: SetNull)
  children         Requirement[] @relation("RequirementChildren")
  figmaUrl         String?
  externalUrl      String?
  externalSystem   String?
  testCases        TestCaseRequirement[]
  bugReports       BugReportRequirement[]
  subtasks         RequirementSubtask[]
  comments         RequirementComment[]
  dueDate          DateTime?
  timeEstimate     Int?       // stored in minutes
  timeSpent        Int?       // stored in minutes
  sourceImportId   String?
  sourceImport     RequirementImport? @relation(fields: [sourceImportId], references: [id], onDelete: SetNull)
  sourceLocation   Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
```

**Then find the `RequirementSubtask` model and add the new `RequirementComment` model right after it:**

```prisma
model RequirementComment {
  id            String      @id @default(uuid())
  requirementId String
  requirement   Requirement @relation(fields: [requirementId], references: [id], onDelete: Cascade)
  author        String
  content       String
  createdAt     DateTime    @default(now())

  @@index([requirementId])
}
```

### 1.2 Run the migration

```bash
npx prisma migrate dev --name add_board_fields
```

### 1.3 Regenerate client

```bash
npx prisma generate
```

---

## Step 2: API Routes

### 2.1 Update `GET /api/projects/[projectId]/requirements`

**File:** `/src/app/api/projects/[projectId]/requirements/route.ts`

Replace the entire `GET` function (lines 7-93) with:

```typescript
export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const requirements = await prisma.requirement.findMany({
      where: { projectId: params.projectId },
      include: {
        epic: { select: { id: true, epicKey: true, title: true, status: true, priority: true } },
        feature: { select: { id: true, featureKey: true, name: true, epicId: true } },
        testCases: {
          include: {
            testCase: {
              include: {
                bugReports: {
                  select: { id: true, bugKey: true, title: true, severity: true, status: true },
                  orderBy: { createdAt: "desc" }
                },
                testRuns: {
                  where: { status: { notIn: ["Queued", "Running"] } },
                  orderBy: { completedAt: "desc" },
                  take: 1
                },
                manualSessionCases: {
                  where: { status: { notIn: ["Pending", "Running"] } },
                  orderBy: { completedAt: "desc" },
                  take: 1
                }
              }
            }
          }
        },
        bugReports: {
          include: {
            bugReport: true
          }
        },
        subtasks: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
        },
        parent: { select: { id: true, requirementKey: true, title: true } },
        children: { select: { id: true, requirementKey: true, title: true, status: true } }
      },
      orderBy: [{ sprintId: "asc" }, { boardRank: "asc" }, { requirementKey: "asc" }]
    })

    const syncMappings = await prisma.externalSyncMapping.findMany({
      where: {
        projectId: params.projectId,
        provider: "OpenProject",
        localEntityType: "Requirement",
      },
    })
    const syncByReqId = new Map(syncMappings.map((m) => [m.localEntityId, m]))

    const resolvedRequirements = requirements.map((req) => {
      const links = req.testCases || []
      const bugs = req.bugReports || []
      const coverage = computeRequirementCoverage(links, bugs)

      const mapping = syncByReqId.get(req.id)
      return {
        ...req,
        computedCoverage: coverage.status,
        openBugsCount: bugs.length,
        openProjectSyncStatus: mapping
          ? (mapping.lastSyncStatus === "success" ? "Synced" : "Failed")
          : "NotSynced",
        openProjectWorkPackageUrl: mapping?.externalUrl || null
      }
    })

    return NextResponse.json({ requirements: resolvedRequirements })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch requirements" },
      { status: 500 }
    )
  }
}
```

### 2.2 Update `PUT /api/requirements/[requirementId]`

**File:** `/src/app/api/requirements/[requirementId]/route.ts`

Find the `PUT` handler. Add support for `dueDate`, `timeEstimate`, `timeSpent`, and `boardRank` in the update body. The exact code depends on the current file content, but ensure the update call includes:

```typescript
// In the prisma.requirement.update({ data: { ... } }) call, add:
dueDate: body.dueDate ? new Date(body.dueDate) : null,
timeEstimate: body.timeEstimate != null ? Number(body.timeEstimate) : null,
timeSpent: body.timeSpent != null ? Number(body.timeSpent) : null,
boardRank: body.boardRank != null ? Number(body.boardRank) : undefined,
```

If this route file doesn't exist yet, check what file handles requirement updates. Look for the PUT handler and add those fields.

### 2.3 New: Subtasks API

**Create file:** `/src/app/api/requirements/[requirementId]/subtasks/route.ts`

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"

// GET /api/requirements/[requirementId]/subtasks
export async function GET(_request: Request, { params }: { params: { requirementId: string } }) {
  const subtasks = await prisma.requirementSubtask.findMany({
    where: { requirementId: params.requirementId },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json({ subtasks })
}

// POST /api/requirements/[requirementId]/subtasks
export async function POST(request: Request, { params }: { params: { requirementId: string } }) {
  const req = await prisma.requirement.findUnique({ where: { id: params.requirementId }, select: { projectId: true } })
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const auth = await requireProjectOwner(req.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json().catch(() => ({}))
  const { title, assignee } = body
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 })

  const count = await prisma.requirementSubtask.count({ where: { requirementId: params.requirementId } })
  const subtask = await prisma.requirementSubtask.create({
    data: {
      requirementId: params.requirementId,
      title: title.trim(),
      assignee: assignee?.trim() || null,
      orderIndex: count,
    },
  })
  return NextResponse.json({ subtask }, { status: 201 })
}
```

**Create file:** `/src/app/api/requirements/[requirementId]/subtasks/[subtaskId]/route.ts`

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"

async function guard(reqId: string) {
  const req = await prisma.requirement.findUnique({ where: { id: reqId }, select: { projectId: true } })
  if (!req) return { error: "Not found" }
  const auth = await requireProjectOwner(req.projectId)
  if (auth.error) return { error: auth.error }
  return { ok: true }
}

// PATCH — toggle done, update title/assignee
export async function PATCH(request: Request, { params }: { params: { requirementId: string; subtaskId: string } }) {
  const g = await guard(params.requirementId)
  if (g.error) return unauthorizedResponse(g.error)

  const body = await request.json().catch(() => ({}))
  const data: any = {}
  if (typeof body.done === "boolean") data.done = body.done
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.assignee !== undefined) data.assignee = body.assignee?.trim() || null

  const subtask = await prisma.requirementSubtask.update({
    where: { id: params.subtaskId },
    data,
  })
  return NextResponse.json({ subtask })
}

// DELETE
export async function DELETE(_request: Request, { params }: { params: { requirementId: string; subtaskId: string } }) {
  const g = await guard(params.requirementId)
  if (g.error) return unauthorizedResponse(g.error)

  await prisma.requirementSubtask.delete({ where: { id: params.subtaskId } })
  return NextResponse.json({ success: true })
}
```

### 2.4 New: Comments API

**Create file:** `/src/app/api/requirements/[requirementId]/comments/route.ts`

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"

async function guard(reqId: string) {
  const req = await prisma.requirement.findUnique({ where: { id: reqId }, select: { projectId: true } })
  if (!req) return { error: "Not found" }
  const auth = await requireProjectOwner(req.projectId)
  if (auth.error) return { error: auth.error }
  return { ok: true }
}

// GET comments
export async function GET(_request: Request, { params }: { params: { requirementId: string } }) {
  const g = await guard(params.requirementId)
  if (g.error) return unauthorizedResponse(g.error)

  const comments = await prisma.requirementComment.findMany({
    where: { requirementId: params.requirementId },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json({ comments })
}

// POST comment
export async function POST(request: Request, { params }: { params: { requirementId: string } }) {
  const g = await guard(params.requirementId)
  if (g.error) return unauthorizedResponse(g.error)

  const body = await request.json().catch(() => ({}))
  const { author, content } = body
  if (!content?.trim() || !author?.trim()) {
    return NextResponse.json({ error: "Author and content required" }, { status: 400 })
  }

  const comment = await prisma.requirementComment.create({
    data: {
      requirementId: params.requirementId,
      author: author.trim(),
      content: content.trim(),
    },
  })
  return NextResponse.json({ comment }, { status: 201 })
}
```

### 2.5 Update Sprint PATCH to accept dates

**File:** `/src/app/api/projects/[projectId]/sprints/[sprintId]/route.ts`

Find the PATCH handler. Ensure the update body accepts:

```typescript
const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  goal: z.string().max(500).optional().nullable(),
  status: z.enum(["Future", "Active", "Completed"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
})
```

And in the update call, pass:

```typescript
startDate: data.startDate ? new Date(data.startDate) : undefined,
endDate: data.endDate ? new Date(data.endDate) : undefined,
```

If this route doesn't exist, create it at `/src/app/api/projects/[projectId]/sprints/[sprintId]/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  goal: z.string().max(500).optional().nullable(),
  status: z.enum(["Future", "Active", "Completed"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
})

export async function PATCH(request: Request, { params }: { params: { projectId: string; sprintId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const raw = await request.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))

  const data: any = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim()
  if (parsed.data.goal !== undefined) data.goal = parsed.data.goal?.trim() || null
  if (parsed.data.status !== undefined) data.status = parsed.data.status
  if (parsed.data.startDate !== undefined) data.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null
  if (parsed.data.endDate !== undefined) data.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null

  if (parsed.data.status === "Completed" && !data.completedAt) data.completedAt = new Date()

  const sprint = await prisma.sprint.update({
    where: { id: params.sprintId },
    data,
  })
  return NextResponse.json({ sprint })
}

export async function DELETE(_request: Request, { params }: { params: { projectId: string; sprintId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  await prisma.sprint.delete({ where: { id: params.sprintId } })
  return NextResponse.json({ success: true })
}
```

---

## Step 3: Board Config Module

**Create file:** `/src/components/board/board-config.ts`

```typescript
"use client"

export type SwimlaneMode = "none" | "assignee" | "epic" | "parent"
export type CardColorMode = "priority" | "epic" | "none"
export type CardSize = "compact" | "normal"

export interface BoardConfig {
  swimlaneMode: SwimlaneMode
  cardColorMode: CardColorMode
  cardSize: CardSize
  wipLimits: Record<string, number>
  collapsedColumns: string[]
  quickFilters: {
    assignees: string[]
    priorities: string[]
    labels: string[]
    types: string[]
  }
}

export const DEFAULT_CONFIG: BoardConfig = {
  swimlaneMode: "none",
  cardColorMode: "priority",
  cardSize: "normal",
  wipLimits: { todo: 0, inprogress: 0, blocked: 0, done: 0 },
  collapsedColumns: [],
  quickFilters: { assignees: [], priorities: [], labels: [], types: [] },
}

export function loadBoardConfig(projectId: string): BoardConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(`board-config-${projectId}`)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveBoardConfig(projectId: string, config: BoardConfig) {
  if (typeof window === "undefined") return
  localStorage.setItem(`board-config-${projectId}`, JSON.stringify(config))
}

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

export function epicColorClass(epicId: string): string {
  let hash = 0
  for (let i = 0; i < epicId.length; i++) {
    hash = (hash << 5) - hash + epicId.charCodeAt(i)
    hash |= 0
  }
  return EPIC_COLORS[Math.abs(hash) % EPIC_COLORS.length]
}

export const PRIORITY_BORDER_COLORS: Record<string, string> = {
  Critical: "border-l-red-500",
  High: "border-l-orange-400",
  Medium: "border-l-amber-400",
  Low: "border-l-slate-300",
}
```

---

## Step 4: Update shared.tsx

**File:** `/src/components/board/shared.tsx`

Replace the entire file with this enhanced version:

```typescript
"use client"

import { useState, type ComponentType } from "react"
import { Flag, GripVertical, Bug, FlaskConical, BookMarked, SquareCheckBig, Tag, ListChecks, MoreVertical, Check, X, Plus } from "lucide-react"
import { PRIORITY_BORDER_COLORS, epicColorClass, type CardColorMode, type CardSize } from "./board-config"

export interface Story {
  id: string
  requirementKey: string
  title: string
  description?: string | null
  acceptanceCriteria?: string | null
  priority: "Low" | "Medium" | "High" | "Critical"
  status: string
  storyPoints: number | null
  assignee: string | null
  labels: string[]
  sprintId: string | null
  epic: { id: string; epicKey: string; title: string } | null
  computedCoverage?: string
  testCases?: StoryTestCaseLink[]
  bugReports?: StoryBugLink[]
  subtasks?: Subtask[]
  parent?: { id: string; requirementKey: string; title: string } | null
  children?: { id: string; requirementKey: string; title: string; status: string }[]
  updatedAt?: string
  dueDate?: string | null
  timeEstimate?: number | null
  timeSpent?: number | null
  boardRank?: number | null
}

export interface Subtask {
  id: string
  title: string
  done: boolean
  assignee: string | null
}

export interface StoryTestCaseLink {
  testCaseId: string
  testCase: { id: string; title: string; testCaseKey?: string | null; priority?: string; executionType?: string }
}

export interface StoryBugLink {
  bugReport: { id: string; bugKey: string; title: string; severity: string; status: string }
}

export interface EpicLite {
  id: string
  epicKey: string
  title: string
}

export interface IssueType {
  id: "Story" | "Task" | "Bug"
  label: string
  prefix: string
  icon: ComponentType<{ className?: string }>
  color: string
}

export const ISSUE_TYPES: IssueType[] = [
  { id: "Story", label: "Story", prefix: "STORY", icon: BookMarked, color: "text-emerald-600" },
  { id: "Task", label: "Task", prefix: "TASK", icon: SquareCheckBig, color: "text-sky-600" },
  { id: "Bug", label: "Bug", prefix: "BUG", icon: Bug, color: "text-red-600" },
]

export const issueTypeOf = (key: string): IssueType => {
  const p = key.split("-")[0]?.toUpperCase()
  return ISSUE_TYPES.find((t) => t.prefix === p) || ISSUE_TYPES[0]
}

export const nextIssueKey = (prefix: string, stories: Story[]): string => {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i")
  let max = 0
  for (const s of stories) {
    const m = s.requirementKey.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`
}

export const WORKFLOW_STATUSES: { id: string; label: string; color: string }[] = [
  { id: "Draft", label: "Draft", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  { id: "ReadyForTesting", label: "Ready for Testing", color: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  { id: "InTesting", label: "In Testing", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  { id: "PartiallyCovered", label: "Partially Covered", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  { id: "Blocked", label: "Blocked", color: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  { id: "Failed", label: "Failed", color: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  { id: "Covered", label: "Done · Covered", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { id: "Deprecated", label: "Deprecated", color: "bg-slate-100 text-slate-400 line-through dark:bg-slate-800" },
]

export interface Sprint {
  id: string
  name: string
  goal: string | null
  status: "Future" | "Active" | "Completed"
  startDate: string | null
  endDate: string | null
  orderIndex?: number
  completedAt?: string | null
}

export const PRIORITY_COLOR: Record<string, string> = {
  Critical: "text-red-600",
  High: "text-orange-500",
  Medium: "text-amber-500",
  Low: "text-slate-400",
}

export const POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21]

export const points = (list: Story[]) => list.reduce((n, s) => n + (s.storyPoints || 0), 0)

export interface BoardColumn {
  id: string
  label: string
  statuses: string[]
  setStatus: string
  accent: string
}

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: "todo", label: "To Do", statuses: ["Draft", "ReadyForTesting"], setStatus: "ReadyForTesting", accent: "border-t-slate-400" },
  { id: "inprogress", label: "In Progress", statuses: ["InTesting", "PartiallyCovered"], setStatus: "InTesting", accent: "border-t-blue-500" },
  { id: "blocked", label: "Blocked", statuses: ["Blocked", "Failed"], setStatus: "Blocked", accent: "border-t-red-500" },
  { id: "done", label: "Done", statuses: ["Covered"], setStatus: "Covered", accent: "border-t-emerald-500" },
]

export const columnOf = (status: string) => BOARD_COLUMNS.find((c) => c.statuses.includes(status)) || null

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Future: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    Completed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  }
  return <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${map[status] || map.Future}`}>{status}</span>
}

export function StoryCardView({
  story,
  onPoints,
  onOpen,
  handleProps,
  dragging,
  colorMode = "priority",
  size = "normal",
  selected,
  onSelect,
  showCheckbox,
}: {
  story: Story
  onPoints?: (s: Story, p: number) => void
  onOpen?: (s: Story) => void
  handleProps?: any
  dragging?: boolean
  colorMode?: CardColorMode
  size?: CardSize
  selected?: boolean
  onSelect?: (id: string, checked: boolean) => void
  showCheckbox?: boolean
}) {
  const [editPts, setEditPts] = useState(false)
  const [showSubtasks, setShowSubtasks] = useState(false)
  const testCount = story.testCases?.length || 0
  const bugCount = story.bugReports?.length || 0
  const childCount = story.children?.length || 0
  const type = issueTypeOf(story.requirementKey)
  const labels = story.labels || []
  const subtasks = story.subtasks || []
  const subtaskDone = subtasks.filter((st) => st.done).length

  const leftBorder =
    colorMode === "priority"
      ? PRIORITY_BORDER_COLORS[story.priority] || "border-l-transparent"
      : colorMode === "epic" && story.epic
        ? epicColorClass(story.epic.id)
        : "border-l-transparent"

  const isCompact = size === "compact"

  return (
    <div className={`border rounded-lg bg-background flex items-start gap-2 group ${leftBorder} ${dragging ? "shadow-xl rotate-1" : "shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700"} ${selected ? "ring-2 ring-indigo-500" : ""} ${isCompact ? "p-1.5" : "p-2"}`}>
      {showCheckbox && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => onSelect?.(story.id, e.target.checked)}
          className="mt-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <button {...handleProps} className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0" aria-label="Drag story">
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onOpen ? () => onOpen(story) : undefined}
        disabled={!onOpen}
        className={`min-w-0 flex-1 text-left ${onOpen ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <type.icon className={`h-3.5 w-3.5 shrink-0 ${type.color}`} />
          <span className={`font-mono font-bold text-indigo-600 ${isCompact ? "text-[9px]" : "text-[10px]"}`}>{story.requirementKey}</span>
          {story.parent && <span className={`font-bold px-1 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 truncate max-w-[100px] ${isCompact ? "text-[8px]" : "text-[9px]"}`} title={story.parent.title}>↳ {story.parent.requirementKey}</span>}
          {story.epic && <span className={`font-bold px-1.5 py-0.5 rounded-full truncate max-w-[100px] ${isCompact ? "text-[8px]" : "text-[9px]"} ${epicColorClass(story.epic.id).replace("border-l-", "bg-").replace("500", "100")} ${epicColorClass(story.epic.id).replace("border-l-", "text-").replace("500", "700")}`}>{story.epic.epicKey}</span>}
        </div>
        <p className={`font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 ${isCompact ? "text-xs" : "text-[13px]"}`}>{story.title}</p>

        {!isCompact && labels.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {labels.slice(0, 2).map((l) => (
              <span key={l} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-0.5"><Tag className="h-2 w-2" />{l}</span>
            ))}
            {labels.length > 2 && <span className="text-[9px] font-bold text-muted-foreground">+{labels.length - 2}</span>}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Flag className={`h-3 w-3 ${PRIORITY_COLOR[story.priority] || "text-slate-400"}`} />
          <span className={`font-bold text-muted-foreground ${isCompact ? "text-[9px]" : "text-[10px]"}`}>{story.status}</span>
          {childCount > 0 && <span className={`font-bold text-sky-600 flex items-center gap-0.5 ${isCompact ? "text-[9px]" : "text-[10px]"}`} title="Child tasks"><ListChecks className="h-3 w-3" />{childCount}</span>}
          {testCount > 0 && <span className={`font-bold text-emerald-600 flex items-center gap-0.5 ${isCompact ? "text-[9px]" : "text-[10px]"}`}><FlaskConical className="h-3 w-3" />{testCount}</span>}
          {bugCount > 0 && <span className={`font-bold text-red-600 flex items-center gap-0.5 ${isCompact ? "text-[9px]" : "text-[10px]"}`}><Bug className="h-3 w-3" />{bugCount}</span>}
          {subtasks.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSubtasks((v) => !v) }}
              className={`font-bold flex items-center gap-0.5 ${isCompact ? "text-[9px]" : "text-[10px]"} ${subtaskDone === subtasks.length ? "text-emerald-600" : "text-amber-600"}`}
            >
              <Check className="h-3 w-3" />{subtaskDone}/{subtasks.length}
            </button>
          )}
          {story.assignee && (
            <span className="ml-auto h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[9px] font-black flex items-center justify-center shrink-0" title={story.assignee}>
              {story.assignee.trim().slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        {/* Inline subtasks */}
        {showSubtasks && subtasks.length > 0 && (
          <div className="mt-2 space-y-1 border-t pt-2">
            {subtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-2 text-xs">
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    await fetch(`/api/requirements/${story.id}/subtasks/${st.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ done: !st.done }),
                    })
                    // Optimistic would require callback; for now reload
                    window.location.reload()
                  }}
                  className={`h-4 w-4 rounded border flex items-center justify-center ${st.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`}
                >
                  {st.done && <Check className="h-3 w-3" />}
                </button>
                <span className={`flex-1 truncate ${st.done ? "line-through text-muted-foreground" : "text-slate-700 dark:text-slate-200"}`}>{st.title}</span>
                {st.assignee && <span className="text-[9px] text-muted-foreground">{st.assignee.slice(0, 2).toUpperCase()}</span>}
              </div>
            ))}
          </div>
        )}
      </button>
      {onPoints ? (
        editPts ? (
          <select
            autoFocus
            value={story.storyPoints ?? 0}
            onChange={(e) => { onPoints(story, Number(e.target.value)); setEditPts(false) }}
            onBlur={() => setEditPts(false)}
            className="h-6 text-[11px] font-black rounded-md border bg-background shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <option value={0}>–</option>
            {POINT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); setEditPts(true) }} className="h-6 min-w-6 px-1.5 rounded-full bg-muted text-[11px] font-black text-slate-700 dark:text-slate-200 shrink-0" title="Story points">
            {story.storyPoints ?? "–"}
          </button>
        )
      ) : (
        <span className="h-6 min-w-6 px-1.5 rounded-full bg-muted text-[11px] font-black flex items-center justify-center shrink-0">{story.storyPoints ?? "–"}</span>
      )}
    </div>
  )
}
```

---

## Step 5: Create Board Toolbar

**Create file:** `/src/components/board/board-toolbar.tsx`

```typescript
"use client"

import { useMemo } from "react"
import { Search, LayoutGrid, Rows3, ChevronDown, X, Settings2, Maximize2, Minimize2 } from "lucide-react"
import { type BoardConfig, type SwimlaneMode, type CardColorMode, type CardSize } from "./board-config"
import { Story } from "./shared"

interface BoardToolbarProps {
  stories: Story[]
  config: BoardConfig
  onChange: (config: BoardConfig) => void
  search: string
  onSearch: (val: string) => void
  onOpenSettings: () => void
}

export default function BoardToolbar({ stories, config, onChange, search, onSearch, onOpenSettings }: BoardToolbarProps) {
  const allAssignees = useMemo(() => {
    const set = new Set<string>()
    stories.forEach((s) => { if (s.assignee) set.add(s.assignee) })
    return Array.from(set).sort()
  }, [stories])

  const allLabels = useMemo(() => {
    const set = new Set<string>()
    stories.forEach((s) => s.labels.forEach((l) => set.add(l)))
    return Array.from(set).sort()
  }, [stories])

  const hasFilters =
    config.quickFilters.assignees.length > 0 ||
    config.quickFilters.priorities.length > 0 ||
    config.quickFilters.labels.length > 0 ||
    config.quickFilters.types.length > 0

  const toggleFilter = (field: keyof BoardConfig["quickFilters"], value: string) => {
    const arr = config.quickFilters[field]
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
    onChange({ ...config, quickFilters: { ...config.quickFilters, [field]: next } })
  }

  const clearFilters = () => {
    onChange({ ...config, quickFilters: { assignees: [], priorities: [], labels: [], types: [] } })
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Main toolbar row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search stories…"
            className="pl-8 pr-3 h-9 text-xs rounded-lg border bg-background w-48 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Swimlane selector */}
        <div className="relative">
          <select
            value={config.swimlaneMode}
            onChange={(e) => onChange({ ...config, swimlaneMode: e.target.value as SwimlaneMode })}
            className="h-9 text-xs font-bold rounded-lg border bg-background px-3 pr-8 appearance-none cursor-pointer"
          >
            <option value="none">No swimlanes</option>
            <option value="assignee">Assignee</option>
            <option value="epic">Epic</option>
            <option value="parent">Parent Story</option>
          </select>
          <ChevronDown className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>

        {/* Color mode */}
        <div className="flex items-center border rounded-lg overflow-hidden">
          <button
            onClick={() => onChange({ ...config, cardColorMode: "priority" })}
            className={`h-9 px-2.5 text-[11px] font-bold ${config.cardColorMode === "priority" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" : "text-muted-foreground hover:bg-muted"}`}
          >
            Priority
          </button>
          <button
            onClick={() => onChange({ ...config, cardColorMode: "epic" })}
            className={`h-9 px-2.5 text-[11px] font-bold ${config.cardColorMode === "epic" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" : "text-muted-foreground hover:bg-muted"}`}
          >
            Epic
          </button>
          <button
            onClick={() => onChange({ ...config, cardColorMode: "none" })}
            className={`h-9 px-2.5 text-[11px] font-bold ${config.cardColorMode === "none" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" : "text-muted-foreground hover:bg-muted"}`}
          >
            None
          </button>
        </div>

        {/* Size toggle */}
        <button
          onClick={() => onChange({ ...config, cardSize: config.cardSize === "compact" ? "normal" : "compact" })}
          className="h-9 w-9 flex items-center justify-center rounded-lg border hover:bg-muted text-muted-foreground"
          title={config.cardSize === "compact" ? "Normal cards" : "Compact cards"}
        >
          {config.cardSize === "compact" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="h-9 w-9 flex items-center justify-center rounded-lg border hover:bg-muted text-muted-foreground"
          title="Board settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {/* Quick filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Priority chips */}
        {(["Low", "Medium", "High", "Critical"] as const).map((p) => {
          const active = config.quickFilters.priorities.includes(p)
          return (
            <button
              key={p}
              onClick={() => toggleFilter("priorities", p)}
              className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition-colors ${active ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 ring-1 ring-indigo-400" : "border text-muted-foreground hover:bg-muted"}`}
            >
              {p}
            </button>
          )
        })}

        {/* Type chips */}
        {(["Story", "Task", "Bug"] as const).map((t) => {
          const active = config.quickFilters.types.includes(t)
          return (
            <button
              key={t}
              onClick={() => toggleFilter("types", t)}
              className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition-colors ${active ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 ring-1 ring-indigo-400" : "border text-muted-foreground hover:bg-muted"}`}
            >
              {t}
            </button>
          )
        })}

        {/* Assignee dropdown */}
        {allAssignees.length > 0 && (
          <div className="relative">
            <select
              value=""
              onChange={(e) => { if (e.target.value) { toggleFilter("assignees", e.target.value); e.target.value = "" } }}
              className="h-7 text-[11px] font-bold rounded-full border bg-background px-3 pr-6 appearance-none cursor-pointer"
            >
              <option value="">Assignee ▼</option>
              {allAssignees.map((a) => (
                <option key={a} value={a}>{config.quickFilters.assignees.includes(a) ? "✓ " : ""}{a}</option>
              ))}
            </select>
          </div>
        )}

        {/* Label dropdown */}
        {allLabels.length > 0 && (
          <div className="relative">
            <select
              value=""
              onChange={(e) => { if (e.target.value) { toggleFilter("labels", e.target.value); e.target.value = "" } }}
              className="h-7 text-[11px] font-bold rounded-full border bg-background px-3 pr-6 appearance-none cursor-pointer"
            >
              <option value="">Label ▼</option>
              {allLabels.map((l) => (
                <option key={l} value={l}>{config.quickFilters.labels.includes(l) ? "✓ " : ""}{l}</option>
              ))}
            </select>
          </div>
        )}

        {/* Active filter pills */}
        {config.quickFilters.assignees.map((a) => (
          <span key={`a-${a}`} className="h-7 pl-2.5 pr-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1">
            {a} <button onClick={() => toggleFilter("assignees", a)}><X className="h-3 w-3" /></button>
          </span>
        ))}
        {config.quickFilters.labels.map((l) => (
          <span key={`l-${l}`} className="h-7 pl-2.5 pr-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1">
            {l} <button onClick={() => toggleFilter("labels", l)}><X className="h-3 w-3" /></button>
          </span>
        ))}

        {hasFilters && (
          <button onClick={clearFilters} className="h-7 px-2 text-[11px] font-bold text-muted-foreground hover:text-foreground">
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
```

---

## Step 6: Create Board Settings Drawer

**Create file:** `/src/components/board/board-settings-drawer.tsx`

```typescript
"use client"

import { X } from "lucide-react"
import { type BoardConfig } from "./board-config"
import { BOARD_COLUMNS } from "./shared"

interface BoardSettingsDrawerProps {
  config: BoardConfig
  onChange: (config: BoardConfig) => void
  onClose: () => void
}

export default function BoardSettingsDrawer({ config, onChange, onClose }: BoardSettingsDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="bg-card border-l shadow-2xl w-full max-w-sm h-full flex flex-col animate-in slide-in-from-right duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h3 className="font-black text-slate-900 dark:text-slate-100">Board Settings</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* WIP Limits */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wide text-muted-foreground">WIP Limits</h4>
            <p className="text-[11px] text-muted-foreground">Set to 0 to disable.</p>
            <div className="space-y-2">
              {BOARD_COLUMNS.map((col) => (
                <div key={col.id} className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{col.label}</span>
                  <input
                    type="number"
                    min={0}
                    value={config.wipLimits[col.id] || 0}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0)
                      onChange({ ...config, wipLimits: { ...config.wipLimits, [col.id]: val } })
                    }}
                    className="w-16 h-8 text-sm text-center rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Reset */}
          <div className="pt-4 border-t">
            <button
              onClick={() => {
                if (confirm("Reset all board settings to defaults?")) {
                  onChange({
                    swimlaneMode: "none",
                    cardColorMode: "priority",
                    cardSize: "normal",
                    wipLimits: { todo: 0, inprogress: 0, blocked: 0, done: 0 },
                    collapsedColumns: [],
                    quickFilters: { assignees: [], priorities: [], labels: [], types: [] },
                  })
                }
              }}
              className="h-9 px-4 rounded-lg border text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Step 7: Create Quick Create Card

**Create file:** `/src/components/board/quick-create-card.tsx`

```typescript
"use client"

import { useState } from "react"
import { Plus, X, Loader2 } from "lucide-react"

interface QuickCreateCardProps {
  projectId: string
  sprintId: string
  defaultStatus: string
  onCreated: () => void
  stories: { requirementKey: string }[]
}

export default function QuickCreateCard({ projectId, sprintId, defaultStatus, onCreated, stories }: QuickCreateCardProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<"Story" | "Task">("Story")
  const [priority, setPriority] = useState("Medium")
  const [saving, setSaving] = useState(false)

  const nextKey = () => {
    const prefix = type === "Story" ? "STORY" : "TASK"
    const re = new RegExp(`^${prefix}-(\\d+)$`, "i")
    let max = 0
    for (const s of stories) {
      const m = s.requirementKey.match(re)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `${prefix}-${String(max + 1).padStart(3, "0")}`
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    const body = {
      requirementKey: nextKey(),
      title: title.trim(),
      description: null,
      priority,
      status: defaultStatus,
      source: "Manual",
      sprintId,
      storyPoints: null,
      assignee: null,
      labels: [],
    }
    const res = await fetch(`/api/projects/${projectId}/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setTitle("")
      setOpen(false)
      onCreated()
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full h-8 flex items-center justify-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add card
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="border rounded-lg bg-background p-2 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs to be done?"
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="flex items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as any)} className="h-8 text-[11px] font-bold rounded-lg border bg-background px-2">
          <option value="Story">Story</option>
          <option value="Task">Task</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-8 text-[11px] font-bold rounded-lg border bg-background px-2">
          {["Low", "Medium", "High", "Critical"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
          <button type="submit" disabled={!title.trim() || saving} className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
          </button>
        </div>
      </div>
    </form>
  )
}
```

---

## Step 8: Create Activity Feed

**Create file:** `/src/components/board/activity-feed.tsx`

```typescript
"use client"

import { useEffect, useState } from "react"
import { Send, User, Loader2 } from "lucide-react"

interface Comment {
  id: string
  author: string
  content: string
  createdAt: string
}

interface ActivityFeedProps {
  requirementId: string
  currentUser?: string
}

export default function ActivityFeed({ requirementId, currentUser = "User" }: ActivityFeedProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/requirements/${requirementId}/comments`)
    const data = res.ok ? await res.json() : { comments: [] }
    setComments(data.comments || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [requirementId])

  const submit = async () => {
    if (!newComment.trim() || sending) return
    setSending(true)
    const res = await fetch(`/api/requirements/${requirementId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: currentUser, content: newComment.trim() }),
    })
    setSending(false)
    if (res.ok) {
      setNewComment("")
      load()
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {comments.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-sm">
              <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[9px] font-black flex items-center justify-center shrink-0">
                {c.author.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs">{c.author}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="Add a comment…"
          className="flex-1 h-9 px-3 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={submit}
          disabled={!newComment.trim() || sending}
          className="h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
```

---

## Step 9: Create Bulk Action Bar

**Create file:** `/src/components/board/bulk-action-bar.tsx`

```typescript
"use client"

import { Trash2, ArrowRight, CheckCircle2, X } from "lucide-react"

interface BulkActionBarProps {
  selectedCount: number
  onClear: () => void
  onMoveToColumn: (status: string) => void
  onDelete: () => void
}

export default function BulkActionBar({ selectedCount, onClear, onMoveToColumn, onDelete }: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border shadow-2xl rounded-xl px-4 py-2.5">
      <span className="text-sm font-bold">{selectedCount} selected</span>
      <div className="h-5 w-px bg-border" />
      <button onClick={() => onMoveToColumn("ReadyForTesting")} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5" /> To Do
      </button>
      <button onClick={() => onMoveToColumn("InTesting")} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5" /> In Progress
      </button>
      <button onClick={() => onMoveToColumn("Blocked")} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-red-100 hover:bg-red-200 text-red-700 flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5" /> Blocked
      </button>
      <button onClick={() => onMoveToColumn("Covered")} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" /> Done
      </button>
      <div className="h-5 w-px bg-border" />
      <button onClick={onDelete} className="h-8 px-2.5 rounded-lg text-[11px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-1">
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>
      <button onClick={onClear} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
```

---

## Step 10: Update sprint-kanban.tsx

**File:** `/src/components/board/sprint-kanban.tsx`

Replace the entire file:

```typescript
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { Story, Sprint, StoryCardView, BOARD_COLUMNS, points } from "./shared"
import { type BoardConfig } from "./board-config"
import QuickCreateCard from "./quick-create-card"
import BulkActionBar from "./bulk-action-bar"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface SprintKanbanProps {
  stories: Story[]
  sprints: Sprint[]
  onPatch: (s: Story, body: Record<string, unknown>) => void
  onOpen: (s: Story) => void
  config: BoardConfig
  projectId: string
}

export default function SprintKanban({ stories, sprints, onPatch, onOpen, config, projectId }: SprintKanbanProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)

  const defaultSprint = useMemo(
    () => sprints.find((s) => s.status === "Active")?.id || sprints[0]?.id || "",
    [sprints]
  )
  const [sprintId, setSprintId] = useState(defaultSprint)
  useEffect(() => { if (!sprintId && defaultSprint) setSprintId(defaultSprint) }, [defaultSprint, sprintId])

  const sprint = sprints.find((s) => s.id === sprintId) || null
  const sprintStories = stories.filter((s) => s.sprintId === sprintId && s.status !== "Deprecated")

  const activeStory = stories.find((s) => s.id === activeId) || null

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const overId = e.over?.id ? String(e.over.id) : null
    const story = stories.find((s) => s.id === e.active.id)
    if (!overId || !story) return
    const col = BOARD_COLUMNS.find((c) => c.id === overId)
    if (!col) return
    if (col.statuses.includes(story.status)) return
    onPatch(story, { status: col.setStatus })
  }

  const toggleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    setSelectedIds(next)
  }

  const bulkMove = (status: string) => {
    selectedIds.forEach((id) => {
      const story = stories.find((s) => s.id === id)
      if (story) onPatch(story, { status })
    })
    setSelectedIds(new Set())
    setBulkMode(false)
  }

  const bulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} items?`)) return
    selectedIds.forEach((id) => {
      const story = stories.find((s) => s.id === id)
      if (story) {
        fetch(`/api/requirements/${story.id}`, { method: "DELETE" }).catch(() => {})
      }
    })
    setSelectedIds(new Set())
    setBulkMode(false)
    setTimeout(() => window.location.reload(), 500)
  }

  if (sprints.length === 0) {
    return <Empty text="No sprints yet. Create one and add stories in the Backlog tab." />
  }
  if (!sprint) {
    return <Empty text="Select a sprint to view its board." />
  }

  // Sprint progress
  const doneCount = sprintStories.filter((s) => s.status === "Covered").length
  const progressPct = sprintStories.length > 0 ? (doneCount / sprintStories.length) * 100 : 0

  return (
    <div className="space-y-3">
      {/* Sprint header */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className="h-9 text-xs font-black rounded-lg border bg-background px-2">
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.status === "Active" ? " (active)" : ""}</option>
          ))}
        </select>
        {sprint.goal && <span className="text-[11px] text-muted-foreground italic">🎯 {sprint.goal}</span>}

        {/* Progress bar */}
        <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-[11px] font-bold text-muted-foreground">{doneCount}/{sprintStories.length} done</span>
        </div>

        <span className="text-[11px] font-bold text-muted-foreground">{points(sprintStories)} pts</span>

        {/* Bulk mode toggle */}
        <button
          onClick={() => { setBulkMode((v) => !v); setSelectedIds(new Set()) }}
          className={`h-8 px-2.5 rounded-lg text-[11px] font-bold border ${bulkMode ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "text-muted-foreground hover:bg-muted"}`}
        >
          {bulkMode ? "Done" : "Select"}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BOARD_COLUMNS.map((col) => {
            const isCollapsed = config.collapsedColumns.includes(col.id)
            if (isCollapsed) {
              return (
                <button
                  key={col.id}
                  onClick={() => {
                    const next = config.collapsedColumns.filter((c) => c !== col.id)
                    // This would need config change callback — for now just show
                  }}
                  className={`border ${col.accent} rounded-xl bg-card p-3 flex flex-col items-center justify-center gap-2 min-h-[120px] hover:bg-muted/50 transition-colors`}
                >
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 [writing-mode:vertical-lr]">{col.label}</span>
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded-full px-1.5">
                    {sprintStories.filter((s) => col.statuses.includes(s.status)).length}
                  </span>
                </button>
              )
            }

            const list = sprintStories.filter((s) => col.statuses.includes(s.status))
            const wipLimit = config.wipLimits[col.id]
            const overLimit = wipLimit > 0 && list.length > wipLimit

            return (
              <KanbanColumn
                key={col.id}
                col={col}
                list={list}
                onOpen={onOpen}
                config={config}
                overLimit={overLimit}
                count={list.length}
                wipLimit={wipLimit}
                projectId={projectId}
                sprintId={sprintId}
                stories={stories}
                bulkMode={bulkMode}
                selectedIds={selectedIds}
                onSelect={toggleSelect}
              />
            )
          })}
        </div>
        <DragOverlay>{activeStory ? <StoryCardView story={activeStory} dragging colorMode={config.cardColorMode} size={config.cardSize} /> : null}</DragOverlay>
      </DndContext>

      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onMoveToColumn={bulkMove}
        onDelete={bulkDelete}
      />
    </div>
  )
}

function KanbanColumn({
  col, list, onOpen, config, overLimit, count, wipLimit, projectId, sprintId, stories, bulkMode, selectedIds, onSelect,
}: {
  col: typeof BOARD_COLUMNS[0]
  list: Story[]
  onOpen: (s: Story) => void
  config: BoardConfig
  overLimit: boolean
  count: number
  wipLimit: number
  projectId: string
  sprintId: string
  stories: Story[]
  bulkMode: boolean
  selectedIds: Set<string>
  onSelect: (id: string, checked: boolean) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })

  const swimlaneKey = (s: Story): string => {
    switch (config.swimlaneMode) {
      case "assignee": return s.assignee || "Unassigned"
      case "epic": return s.epic ? `${s.epic.epicKey} · ${s.epic.title}` : "No Epic"
      case "parent": return s.parent ? s.parent.requirementKey : "Independent"
      default: return ""
    }
  }

  const groups = useMemo(() => {
    if (config.swimlaneMode === "none") return { "": list }
    const map = new Map<string, Story[]>()
    for (const s of list) {
      const key = swimlaneKey(s)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    const entries = Array.from(map.entries())
    entries.sort((a, b) => a[0].localeCompare(b[0]))
    return Object.fromEntries(entries)
  }, [list, config.swimlaneMode])

  return (
    <div className={`border border-t-2 ${col.accent} rounded-xl bg-card flex flex-col transition-colors ${isOver ? "ring-2 ring-indigo-400" : ""} ${overLimit ? "bg-red-50/50 dark:bg-red-950/10 border-red-300" : ""}`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b ${overLimit ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">{col.label}</span>
        <div className="flex items-center gap-1.5">
          {overLimit && <span className="text-[10px] font-bold text-red-600">⚠️</span>}
          <span className={`text-[10px] font-bold rounded-full px-1.5 ${overLimit ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
            {count}{wipLimit > 0 ? `/${wipLimit}` : ""}
          </span>
        </div>
      </div>
      <div ref={setNodeRef} className="p-2 space-y-1.5 flex-1 min-h-[120px]">
        {Object.entries(groups).map(([groupName, groupStories]) => (
          <div key={groupName} className="space-y-1">
            {config.swimlaneMode !== "none" && groupName && (
              <div className="flex items-center gap-2 px-1 py-1 bg-muted/40 rounded-md">
                <span className="text-[10px] font-black text-muted-foreground truncate">{groupName}</span>
                <span className="text-[10px] font-bold text-muted-foreground ml-auto">{points(groupStories)} pts</span>
              </div>
            )}
            {groupStories.map((s) => (
              <DraggableCard
                key={s.id}
                story={s}
                onOpen={onOpen}
                colorMode={config.cardColorMode}
                size={config.cardSize}
                showCheckbox={bulkMode}
                selected={selectedIds.has(s.id)}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
        {list.length === 0 && <div className="text-[10px] text-muted-foreground/70 text-center py-6 font-medium">Drop here</div>}
        <QuickCreateCard
          projectId={projectId}
          sprintId={sprintId}
          defaultStatus={col.setStatus}
          stories={stories}
          onCreated={() => window.location.reload()}
        />
      </div>
    </div>
  )
}

function DraggableCard({ story, onOpen, colorMode, size, showCheckbox, selected, onSelect }: {
  story: Story
  onOpen: (s: Story) => void
  colorMode: string
  size: string
  showCheckbox?: boolean
  selected?: boolean
  onSelect?: (id: string, checked: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: story.id })
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <StoryCardView
        story={story}
        onOpen={onOpen}
        handleProps={{ ...attributes, ...listeners }}
        colorMode={colorMode as any}
        size={size as any}
        showCheckbox={showCheckbox}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="border rounded-xl bg-card py-16 text-center text-sm text-muted-foreground font-medium">{text}</div>
}
```

---

## Step 11: Update scrum-board.tsx

**File:** `/src/components/board/scrum-board.tsx`

Replace the entire file:

```typescript
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { useRouter } from "next/navigation"
import { Plus, Play, CheckCircle2, Trash2, Loader2, Search, Target, X, ListOrdered, LayoutGrid, LineChart, Upload } from "lucide-react"
import { Story, Sprint, EpicLite, StoryCardView, StatusPill, points } from "./shared"
import SprintKanban from "./sprint-kanban"
import SprintReports from "./sprint-reports"
import IssueDrawer from "./issue-drawer"
import { ImportRequirementsModal } from "@/components/requirements/import-modal"
import BoardToolbar from "./board-toolbar"
import BoardSettingsDrawer from "./board-settings-drawer"
import { loadBoardConfig, saveBoardConfig, type BoardConfig, DEFAULT_CONFIG } from "./board-config"

type View = "backlog" | "board" | "reports"

export default function ScrumBoard({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [allEpics, setAllEpics] = useState<EpicLite[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>("backlog")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [epicFilter, setEpicFilter] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [openIssueId, setOpenIssueId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [config, setConfig] = useState<BoardConfig>(DEFAULT_CONFIG)
  const [showSettings, setShowSettings] = useState(false)

  // Load config on mount
  useEffect(() => {
    setConfig(loadBoardConfig(projectId))
  }, [projectId])

  const updateConfig = useCallback((next: BoardConfig) => {
    setConfig(next)
    saveBoardConfig(projectId, next)
  }, [projectId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [rRes, sRes, eRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/requirements`),
        fetch(`/api/projects/${projectId}/sprints`),
        fetch(`/api/projects/${projectId}/epics`),
      ])
      const rData = rRes.ok ? await rRes.json() : { requirements: [] }
      const sData = sRes.ok ? await sRes.json() : { sprints: [] }
      const eData = eRes.ok ? await eRes.json() : { epics: [] }
      setStories(rData.requirements || [])
      setSprints(sData.sprints || [])
      setAllEpics((eData.epics || []).map((e: any) => ({ id: e.id, epicKey: e.epicKey, title: e.title })))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId])

  const silentReload = useCallback(() => load(true), [load])

  useEffect(() => { load() }, [load])

  const patchStory = useCallback(async (story: Story, body: Record<string, unknown>) => {
    setStories((prev) => prev.map((s) => {
      if (s.id !== story.id) return s
      const next = { ...s, ...body } as Story
      if ("epicId" in body) {
        const ep = allEpics.find((e) => e.id === body.epicId)
        next.epic = ep ? { id: ep.id, epicKey: ep.epicKey, title: ep.title } : null
      }
      return next
    }))
    await fetch(`/api/requirements/${story.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => load())
  }, [load, allEpics])

  const deleteStory = useCallback(async (story: Story) => {
    setStories((prev) => prev.filter((s) => s.id !== story.id))
    setOpenIssueId(null)
    await fetch(`/api/requirements/${story.id}`, { method: "DELETE" }).catch(() => load())
  }, [load])

  const epics = useMemo(() => {
    const m = new Map<string, string>()
    stories.forEach((s) => s.epic && m.set(s.epic.id, `${s.epic.epicKey} · ${s.epic.title}`))
    return Array.from(m.entries())
  }, [stories])

  // Filter stories through quick filters for board view
  const visible = useMemo(() => {
    let q = search.trim().toLowerCase()
    return stories.filter((s) => {
      if (epicFilter !== "all" && s.epic?.id !== epicFilter) return false
      if (q && !s.title.toLowerCase().includes(q) && !s.requirementKey.toLowerCase().includes(q)) return false

      const f = config.quickFilters
      if (f.assignees.length > 0 && !f.assignees.includes(s.assignee || "")) return false
      if (f.priorities.length > 0 && !f.priorities.includes(s.priority)) return false
      if (f.labels.length > 0 && !f.labels.some((l) => s.labels.includes(l))) return false
      if (f.types.length > 0) {
        const type = issueTypeOf(s.requirementKey).id
        if (!f.types.includes(type)) return false
      }
      return true
    })
  }, [stories, search, epicFilter, config.quickFilters])

  const backlog = visible.filter((s) => !s.sprintId)
  const bySprint = (id: string) => visible.filter((s) => s.sprintId === id)

  const openStory = useCallback((s: Story) => setOpenIssueId(s.id), [])
  const openStoryObj = stories.find((s) => s.id === openIssueId) || null

  const activeStory = stories.find((s) => s.id === activeId) || null
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const overId = e.over?.id ? String(e.over.id) : null
    const story = stories.find((s) => s.id === e.active.id)
    if (!overId || !story) return
    const targetSprintId = overId === "backlog" ? null : overId
    if ((story.sprintId || null) === targetSprintId) return
    patchStory(story, { sprintId: targetSprintId })
  }

  const createSprint = async (name: string, goal: string) => {
    const res = await fetch(`/api/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, goal: goal || undefined }),
    })
    if (res.ok) await load()
    setShowCreate(false)
  }

  const patchSprint = async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    try {
      await fetch(`/api/projects/${projectId}/sprints/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      await load()
    } finally { setBusy(null) }
  }

  const deleteSprint = async (id: string) => {
    if (!confirm("Delete this sprint? Its stories move back to the backlog.")) return
    setBusy(id)
    try {
      await fetch(`/api/projects/${projectId}/sprints/${id}`, { method: "DELETE" })
      await load()
    } finally { setBusy(null) }
  }

  const TABS: { id: View; label: string; icon: any }[] = [
    { id: "backlog", label: "Backlog", icon: ListOrdered },
    { id: "board", label: "Sprint Board", icon: LayoutGrid },
    { id: "reports", label: "Reports", icon: LineChart },
  ]

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={26} />
        <span className="text-xs font-semibold uppercase tracking-wide">Loading board…</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Target className="h-5 w-5 text-indigo-600" /> Scrum Board
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {view !== "reports" && view !== "board" && (
            <>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stories…" className="pl-8 pr-3 h-9 text-xs rounded-lg border bg-background w-44 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <select value={epicFilter} onChange={(e) => setEpicFilter(e.target.value)} className="h-9 text-xs font-semibold rounded-lg border bg-background px-2">
                <option value="all">All epics</option>
                {epics.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </>
          )}
          <button onClick={() => setShowImport(true)} className="h-9 px-3 rounded-lg border text-xs font-black flex items-center gap-1.5 hover:bg-muted" title="Import user stories from Excel or CSV">
            <Upload className="h-4 w-4" /> Import
          </button>
          <button onClick={() => setShowCreate(true)} className="h-9 px-3 rounded-lg border text-xs font-black flex items-center gap-1.5 hover:bg-muted">
            <Plus className="h-4 w-4" /> Create sprint
          </button>
          <button onClick={() => router.push(`/projects/${projectId}/board/create`)} className="h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-muted/60 border p-1 rounded-lg w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)} className={`h-8 px-3 rounded-md text-xs font-black flex items-center gap-1.5 transition-colors ${view === t.id ? "bg-background shadow-sm text-indigo-700 dark:text-indigo-300" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {view === "board" && (
        <>
          <BoardToolbar
            stories={stories}
            config={config}
            onChange={updateConfig}
            search={search}
            onSearch={setSearch}
            onOpenSettings={() => setShowSettings(true)}
          />
          <SprintKanban
            stories={visible}
            sprints={sprints}
            onPatch={patchStory}
            onOpen={openStory}
            config={config}
            projectId={projectId}
          />
        </>
      )}

      {view === "backlog" && (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
          <div className="space-y-3">
            {sprints.map((sprint) => {
              const list = bySprint(sprint.id)
              const doneCount = list.filter((s) => s.status === "Covered").length
              return (
                <Column key={sprint.id} id={sprint.id}>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-black text-sm text-slate-800 dark:text-slate-100 truncate">{sprint.name}</span>
                      <StatusPill status={sprint.status} />
                      {sprint.goal && <span className="text-[11px] text-muted-foreground italic truncate hidden sm:inline">🎯 {sprint.goal}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {doneCount > 0 && <span className="text-[11px] font-bold text-emerald-600">{doneCount}/{list.length} done</span>}
                      <span className="text-[11px] font-bold text-muted-foreground">{list.length} stories · {points(list)} pts</span>
                      {sprint.status === "Future" && <button disabled={busy === sprint.id} onClick={() => patchSprint(sprint.id, { status: "Active" })} className="h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"><Play className="h-3 w-3" /> Start</button>}
                      {sprint.status === "Active" && <button disabled={busy === sprint.id} onClick={() => patchSprint(sprint.id, { status: "Completed" })} className="h-7 px-2 rounded-md bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"><CheckCircle2 className="h-3 w-3" /> Complete</button>}
                      <button disabled={busy === sprint.id} onClick={() => deleteSprint(sprint.id)} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600" title="Delete sprint"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <StoryList stories={list} onPoints={(s, p) => patchStory(s, { storyPoints: p })} onOpen={openStory} emptyLabel="Drag stories here to plan this sprint" />
                </Column>
              )
            })}
            <Column id="backlog">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <span className="font-black text-sm text-slate-800 dark:text-slate-100">Backlog</span>
                <span className="text-[11px] font-bold text-muted-foreground">{backlog.length} stories · {points(backlog)} pts</span>
              </div>
              <StoryList stories={backlog} onPoints={(s, p) => patchStory(s, { storyPoints: p })} onOpen={openStory} emptyLabel="No unplanned stories — everything is in a sprint 🎉" />
            </Column>
          </div>
          <DragOverlay>{activeStory ? <StoryCardView story={activeStory} dragging /> : null}</DragOverlay>
        </DndContext>
      )}

      {view === "reports" && <SprintReports stories={stories} sprints={sprints} />}

      {showCreate && <CreateSprintModal onClose={() => setShowCreate(false)} onCreate={createSprint} />}
      <ImportRequirementsModal
        projectId={projectId}
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImportSuccess={() => { setView("backlog"); load() }}
      />
      {showSettings && (
        <BoardSettingsDrawer config={config} onChange={updateConfig} onClose={() => setShowSettings(false)} />
      )}
      {openStoryObj && (
        <IssueDrawer
          key={openStoryObj.id}
          story={openStoryObj}
          projectId={projectId}
          sprints={sprints}
          epics={allEpics}
          onPatch={patchStory}
          onDelete={deleteStory}
          onReload={silentReload}
          onClose={() => setOpenIssueId(null)}
        />
      )}
    </div>
  )
}

// Keep existing helper components below (Column, StoryList, DraggableStory, CreateSprintModal)
// ... (include them as they are in the current file)

function Column({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className={`border rounded-xl bg-card overflow-hidden transition-colors ${isOver ? "ring-2 ring-indigo-400" : ""}`}>{children}</div>
}

function StoryList({ stories, onPoints, onOpen, emptyLabel }: { stories: Story[]; onPoints: (s: Story, p: number) => void; onOpen: (s: Story) => void; emptyLabel: string }) {
  return (
    <div className="p-2 space-y-1.5 min-h-[64px]">
      {stories.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-4 font-medium">{emptyLabel}</div>
      ) : (
        stories.map((s) => <DraggableStory key={s.id} story={s} onPoints={onPoints} onOpen={onOpen} />)
      )}
    </div>
  )
}

function DraggableStory({ story, onPoints, onOpen }: { story: Story; onPoints: (s: Story, p: number) => void; onOpen: (s: Story) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: story.id })
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <StoryCardView story={story} onPoints={onPoints} onOpen={onOpen} handleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

function CreateSprintModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, goal: string) => void }) {
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-slate-900 dark:text-slate-100">Create sprint</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint name (e.g. Sprint 1)" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Sprint goal (optional)" rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border text-sm font-semibold">Cancel</button>
          <button disabled={!name.trim()} onClick={() => onCreate(name.trim(), goal.trim())} className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  )
}

function issueTypeOf(key: string) {
  const p = key.split("-")[0]?.toUpperCase()
  return [{ id: "Story", label: "Story", prefix: "STORY" }, { id: "Task", label: "Task", prefix: "TASK" }, { id: "Bug", label: "Bug", prefix: "BUG" }].find((t) => t.prefix === p) || { id: "Story", label: "Story", prefix: "STORY" }
}
```

---

## Step 12: Update issue-drawer.tsx

**File:** `/src/components/board/issue-drawer.tsx`

Add these new sections before the closing `</div>` of the drawer content (before the `artifactModal` conditionals):

Find this line in the file (near line 260):
```typescript
      {artifactModal === "test" && (
```

**Before that line, insert these new sections inside the drawer content (after the Bugs section and before the artifact modals):**

```typescript
          {/* ── Due Date ── */}
          <Field label="Due date">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={story.dueDate ? new Date(story.dueDate).toISOString().split("T")[0] : ""}
                onChange={(e) => {
                  const val = e.target.value
                  onPatch(story, { dueDate: val ? new Date(val).toISOString() : null })
                }}
                className="h-9 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {story.dueDate && new Date(story.dueDate) < new Date() && story.status !== "Covered" && (
                <span className="text-[11px] font-bold text-red-600 bg-red-100 dark:bg-red-500/15 px-2 py-0.5 rounded-full">Overdue</span>
              )}
            </div>
          </Field>

          {/* ── Time Tracking ── */}
          <Field label="Time tracking">
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Original (h)</label>
                  <input
                    type="number"
                    min={0}
                    value={story.timeEstimate ? Math.round(story.timeEstimate / 60 * 10) / 10 : ""}
                    onChange={(e) => {
                      const hrs = parseFloat(e.target.value) || 0
                      onPatch(story, { timeEstimate: Math.round(hrs * 60) })
                    }}
                    className="w-full h-8 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Spent (h)</label>
                  <input
                    type="number"
                    min={0}
                    value={story.timeSpent ? Math.round(story.timeSpent / 60 * 10) / 10 : ""}
                    onChange={(e) => {
                      const hrs = parseFloat(e.target.value) || 0
                      onPatch(story, { timeSpent: Math.round(hrs * 60) })
                    }}
                    className="w-full h-8 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Remaining (h)</label>
                  <div className="h-8 flex items-center text-xs font-bold text-muted-foreground">
                    {story.timeEstimate && story.timeSpent != null
                      ? Math.max(0, Math.round((story.timeEstimate - story.timeSpent) / 60 * 10) / 10)
                      : "—"}
                  </div>
                </div>
              </div>
              {story.timeEstimate && story.timeEstimate > 0 && (
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((story.timeSpent || 0) / story.timeEstimate) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </Field>

          {/* ── Comments / Activity ── */}
          <Section icon={MessageCircle} title="Activity" accent="text-indigo-600">
            <ActivityFeed requirementId={story.id} />
          </Section>
```

**Also add `MessageCircle` to the imports at the top of `issue-drawer.tsx`:**

Replace the import line:
```typescript
import { X, Trash2, Flag, FlaskConical, Bug, ExternalLink, Loader2, Check, Tag, Plus, SquareCheckBig, CornerDownRight } from "lucide-react"
```

With:
```typescript
import { X, Trash2, Flag, FlaskConical, Bug, ExternalLink, Loader2, Check, Tag, Plus, SquareCheckBig, CornerDownRight, MessageCircle } from "lucide-react"
```

**Add the ActivityFeed import:**

```typescript
import ActivityFeed from "./activity-feed"
```

---

## Step 13: Update sprint-reports.tsx (minor)

No changes needed unless you want to enhance. The current reports work fine.

---

## Step 14: Build Verification

After implementing all steps, run:

```bash
# 1. Ensure schema is migrated
npx prisma generate

# 2. Type check
npx tsc --noEmit

# 3. Build
npm run build
```

---

## Quick Reference: All Files Changed

| Action | File |
|--------|------|
| **Modify** | `/prisma/schema.prisma` |
| **Run** | `npx prisma migrate dev --name add_board_fields` |
| **Modify** | `/src/app/api/projects/[projectId]/requirements/route.ts` |
| **Modify** | `/src/app/api/requirements/[requirementId]/route.ts` |
| **Create** | `/src/app/api/projects/[projectId]/sprints/[sprintId]/route.ts` |
| **Create** | `/src/app/api/requirements/[requirementId]/subtasks/route.ts` |
| **Create** | `/src/app/api/requirements/[requirementId]/subtasks/[subtaskId]/route.ts` |
| **Create** | `/src/app/api/requirements/[requirementId]/comments/route.ts` |
| **Create** | `/src/components/board/board-config.ts` |
| **Create** | `/src/components/board/board-toolbar.tsx` |
| **Create** | `/src/components/board/board-settings-drawer.tsx` |
| **Create** | `/src/components/board/quick-create-card.tsx` |
| **Create** | `/src/components/board/activity-feed.tsx` |
| **Create** | `/src/components/board/bulk-action-bar.tsx` |
| **Replace** | `/src/components/board/shared.tsx` |
| **Replace** | `/src/components/board/sprint-kanban.tsx` |
| **Replace** | `/src/components/board/scrum-board.tsx` |
| **Modify** | `/src/components/board/issue-drawer.tsx` |

---

> **End of Implementation Guide** — Execute each step in order. After Step 1 (schema), run the migration before proceeding to APIs. After all API changes, restart the dev server. Components can be updated in any order after APIs are ready.
