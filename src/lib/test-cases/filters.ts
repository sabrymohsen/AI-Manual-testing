import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"

/**
 * One parser + WHERE builder for the test library, shared by the list
 * (browse), the header counts (facets) and "select all matching" (ids).
 *
 * Keeping these in one place is what makes the counts agree with the list:
 * before, facets ignored every filter, so inside a suite "12 failed" was a
 * project-wide number while clicking it showed 3.
 */

export const STATUSES = ["NotExecuted", "Passed", "Failed", "Blocked", "Warning", "Skipped"] as const
export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const
export const EXECUTION_TYPES = ["Manual", "Automated"] as const
export const REVIEW_STATES = ["Draft", "Ready", "Approved", "Deprecated"] as const

export interface CaseFilterParams {
  q?: string
  suite?: string
  plan?: string
  statuses: (typeof STATUSES)[number][]
  priorities: (typeof PRIORITIES)[number][]
  executionType?: (typeof EXECUTION_TYPES)[number]
  reviewStates: (typeof REVIEW_STATES)[number][]
  tags: string[]
  /** Team-member ids; "unassigned" and "me" are special values. */
  assignees: string[]
  trace?: "orphans" | "broken"
}

export function parseCaseFilters(p: URLSearchParams): CaseFilterParams {
  const pick = <T extends readonly string[]>(key: string, allowed: T) =>
    p.getAll(key).filter((v): v is T[number] => (allowed as readonly string[]).includes(v))
  const trace = p.get("trace")
  return {
    q: p.get("q")?.trim() || undefined,
    suite: p.get("suite") || undefined,
    plan: p.get("plan") || undefined,
    statuses: pick("status", STATUSES),
    priorities: pick("priority", PRIORITIES),
    executionType: pick("executionType", EXECUTION_TYPES)[0],
    reviewStates: pick("review", REVIEW_STATES),
    tags: p.getAll("tag").filter(Boolean),
    assignees: p.getAll("assignee").filter(Boolean),
    trace: trace === "orphans" || trace === "broken" ? trace : undefined,
  }
}

/** A suite and every suite below it, so choosing a parent shows its whole subtree. */
async function suiteWithDescendants(projectId: string, suiteId: string): Promise<string[]> {
  const all = await prisma.testSuite.findMany({ where: { projectId }, select: { id: true, parentId: true } })
  const kids = new Map<string, string[]>()
  for (const s of all) {
    if (!s.parentId) continue
    kids.set(s.parentId, [...(kids.get(s.parentId) ?? []), s.id])
  }
  const out: string[] = []
  const stack = [suiteId]
  while (stack.length) {
    const id = stack.pop()!
    if (out.includes(id)) continue
    out.push(id)
    stack.push(...(kids.get(id) ?? []))
  }
  return out
}

/**
 * "me" → the team-pool member(s) that match the signed-in user by email, or
 * failing that by name. TestCase.assignee stores a pool member id.
 */
async function resolveMe(projectId: string, user: { email?: string | null; name?: string | null }) {
  const or: Prisma.ProjectTeamMemberWhereInput[] = []
  if (user.email) or.push({ email: { equals: user.email, mode: "insensitive" } })
  if (user.name) or.push({ name: { equals: user.name, mode: "insensitive" } })
  if (!or.length) return []
  const rows = await prisma.projectTeamMember.findMany({ where: { projectId, OR: or }, select: { id: true } })
  return rows.map((r) => r.id)
}

export interface BuildOptions {
  /** Leave these out — facets uses this so each chip counts within the other filters. */
  omit?: ("statuses" | "trace")[]
  user?: { email?: string | null; name?: string | null }
}

export async function buildCaseWhere(
  projectId: string,
  f: CaseFilterParams,
  opts: BuildOptions = {}
): Promise<Prisma.TestCaseWhereInput> {
  const and: Prisma.TestCaseWhereInput[] = [{ projectId }]
  const omit = new Set(opts.omit ?? [])

  if (f.q) {
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { preconditions: { contains: f.q, mode: "insensitive" } },
        { tags: { has: f.q } },
      ],
    })
  }
  if (f.suite) {
    if (f.suite === "unfiled") and.push({ suiteId: null })
    else and.push({ suiteId: { in: await suiteWithDescendants(projectId, f.suite) } })
  }
  if (f.plan) and.push({ planLinks: { some: { planId: f.plan } } })
  if (f.statuses.length && !omit.has("statuses")) and.push({ lastStatus: { in: f.statuses } })
  if (f.priorities.length) and.push({ priority: { in: f.priorities } })
  if (f.executionType) and.push({ executionType: f.executionType })
  if (f.reviewStates.length) and.push({ reviewState: { in: f.reviewStates } })
  if (f.tags.length) and.push({ tags: { hasSome: f.tags } })

  if (f.assignees.length) {
    const ids = new Set<string>()
    let unassigned = false
    for (const a of f.assignees) {
      if (a === "unassigned") unassigned = true
      else if (a === "me") (opts.user ? await resolveMe(projectId, opts.user) : []).forEach((id) => ids.add(id))
      else ids.add(a)
    }
    const or: Prisma.TestCaseWhereInput[] = []
    if (ids.size) or.push({ assignee: { in: Array.from(ids) } })
    if (unassigned) or.push({ assignee: null }, { assignee: "" })
    // "me" with no matching team member must match nothing, not everything.
    and.push(or.length ? { OR: or } : { id: "__none__" })
  }

  if (!omit.has("trace")) {
    // Orphan = covers no user story.
    if (f.trace === "orphans") and.push({ requirements: { none: {} } })
    // Broken = failed on its last run with nobody tracking it (no open bug).
    if (f.trace === "broken") and.push({ lastStatus: "Failed", openBugCount: 0 })
  }

  return { AND: and }
}

/** Upper bound for "select all matching" so a bulk action can't run unbounded. */
export const MAX_BULK_IDS = 5000
