import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"

type Tx = Prisma.TransactionClient

/**
 * Write-side helpers for test cases: step saving that keeps step identity,
 * version snapshots, duplicate and a delete that never destroys bugs.
 */

// ── Steps ────────────────────────────────────────────────────────────────────

/** Step fields a client may write. Anything else in the payload is ignored. */
const STEP_FIELDS = [
  "actionDescription",
  "expectedResult",
  "actionType",
  "targetType",
  "targetValue",
  "inputValue",
  "timeoutMs",
  "assertions",
  "actionMetadata",
  "locatorCandidates",
  "componentType",
  "groupId",
  "selectedOptionText",
  "selectedOptionValue",
] as const

function stepData(step: Record<string, unknown>, stepNumber: number) {
  const out: Record<string, unknown> = { stepNumber }
  for (const k of STEP_FIELDS) if (step[k] !== undefined) out[k] = step[k]
  if (out.expectedResult == null) out.expectedResult = ""
  return out
}

/**
 * Saves a step list in place.
 *
 * Steps that carry the id of an existing step are UPDATED, new ones created,
 * and only the ones the user removed are deleted. The previous implementation
 * deleted every step and recreated them, which gave every step a new id on
 * each save — and since TestStepResult / ManualStepResult point at steps by id
 * (onDelete: SetNull), every edit cut past run results off from their steps.
 */
export async function syncSteps(tx: Tx, testCaseId: string, steps: Record<string, unknown>[]) {
  const existing = await tx.testStep.findMany({ where: { testCaseId }, select: { id: true } })
  const existingIds = new Set(existing.map((s) => s.id))
  const keep = new Set<string>()

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const id = typeof s.id === "string" ? s.id : null
    const data = stepData(s, i + 1)
    if (id && existingIds.has(id) && !keep.has(id)) {
      keep.add(id)
      await tx.testStep.update({ where: { id }, data: data as Prisma.TestStepUpdateInput })
    } else {
      await tx.testStep.create({ data: { ...(data as any), testCaseId } })
    }
  }

  const removed = Array.from(existingIds).filter((id) => !keep.has(id))
  if (removed.length) await tx.testStep.deleteMany({ where: { id: { in: removed } } })
}

// ── Versions ─────────────────────────────────────────────────────────────────

/** The editable shape of a case — what a version stores and a restore writes back. */
export interface CaseSnapshot {
  title: string
  priority: string
  preconditions: string | null
  executionType: string
  reviewState: string
  estimatedMinutes: number | null
  tags: string[]
  assignee: string | null
  suiteId: string | null
  requirementIds: string[]
  steps: Record<string, unknown>[]
}

export async function readSnapshot(tx: Tx, testCaseId: string): Promise<CaseSnapshot | null> {
  const tc = await tx.testCase.findUnique({
    where: { id: testCaseId },
    include: { steps: { orderBy: { stepNumber: "asc" } }, requirements: { select: { requirementId: true } } },
  })
  if (!tc) return null
  return {
    title: tc.title,
    priority: tc.priority,
    preconditions: tc.preconditions,
    executionType: tc.executionType,
    reviewState: tc.reviewState,
    estimatedMinutes: tc.estimatedMinutes,
    tags: tc.tags,
    assignee: tc.assignee,
    suiteId: tc.suiteId,
    requirementIds: tc.requirements.map((r) => r.requirementId),
    steps: tc.steps.map((s) => {
      const out: Record<string, unknown> = { id: s.id }
      for (const k of STEP_FIELDS) out[k] = (s as any)[k]
      return out
    }),
  }
}

const LABELS: Record<string, string> = {
  title: "title",
  priority: "priority",
  preconditions: "preconditions",
  executionType: "type",
  reviewState: "review state",
  estimatedMinutes: "estimate",
  tags: "tags",
  assignee: "assignee",
  suiteId: "suite",
  requirementIds: "linked stories",
  steps: "steps",
}

function normSteps(steps: Record<string, unknown>[]) {
  return steps.map((s) => [s.actionDescription ?? "", s.expectedResult ?? "", s.actionType ?? "", s.targetValue ?? "", s.inputValue ?? ""])
}

/** Which editable fields differ between a stored snapshot and an incoming patch. */
export function changedFields(before: CaseSnapshot, patch: Partial<CaseSnapshot>): string[] {
  const out: string[] = []
  for (const key of Object.keys(LABELS) as (keyof CaseSnapshot)[]) {
    if (patch[key] === undefined) continue
    let a: unknown = before[key]
    let b: unknown = patch[key]
    if (key === "steps") {
      a = normSteps(before.steps)
      b = normSteps(patch.steps ?? [])
    } else if (key === "tags" || key === "requirementIds") {
      a = [...(a as string[])].sort()
      b = [...((b as string[]) ?? [])].sort()
    } else {
      a = a ?? null
      b = b === "" ? null : b ?? null
      if (key === "preconditions" || key === "assignee" || key === "suiteId") a = a === "" ? null : a
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(LABELS[key])
  }
  return out
}

/**
 * Stores the case as it is RIGHT NOW as a new version. Call before writing an
 * edit; `summary` says what that edit changes.
 */
export async function recordVersion(
  tx: Tx,
  testCaseId: string,
  before: CaseSnapshot,
  summary: string,
  user: { id?: string | null; name?: string | null; email?: string | null }
) {
  const last = await tx.testCaseVersion.findFirst({
    where: { testCaseId },
    orderBy: { version: "desc" },
    select: { version: true },
  })
  await tx.testCaseVersion.create({
    data: {
      testCaseId,
      version: (last?.version ?? 0) + 1,
      snapshot: before as unknown as Prisma.InputJsonValue,
      summary,
      changedById: user.id ?? null,
      changedByName: user.name || user.email || null,
    },
  })
}

/**
 * Applies an edit: snapshots the current state, then writes scalar fields,
 * steps and story links. Skips the snapshot when nothing actually changed.
 * Returns the list of changed field labels.
 */
export async function applyCaseEdit(
  testCaseId: string,
  patch: Partial<CaseSnapshot>,
  user: { id?: string | null; name?: string | null; email?: string | null },
  /** Prefix for the version summary, e.g. "Restored v3". */
  note?: string
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const before = await readSnapshot(tx, testCaseId)
    if (!before) throw new Error("Test case not found")
    const changed = changedFields(before, patch)
    if (changed.length === 0) return changed

    await recordVersion(tx, testCaseId, before, note ? `${note}: ${changed.join(", ")}` : changed.join(", "), user)

    const { steps, requirementIds, ...scalars } = patch
    const data: Prisma.TestCaseUncheckedUpdateInput = {}
    for (const [k, v] of Object.entries(scalars)) if (v !== undefined) (data as any)[k] = v
    if (Object.keys(data).length) await tx.testCase.update({ where: { id: testCaseId }, data })
    else await tx.testCase.update({ where: { id: testCaseId }, data: { updatedAt: new Date() } })

    if (steps) await syncSteps(tx, testCaseId, steps)
    if (requirementIds) {
      await tx.testCaseRequirement.deleteMany({ where: { testCaseId } })
      if (requirementIds.length)
        await tx.testCaseRequirement.createMany({
          data: requirementIds.map((requirementId) => ({ testCaseId, requirementId })),
          skipDuplicates: true,
        })
    }
    return changed
  })
}

// ── Duplicate ────────────────────────────────────────────────────────────────

export async function duplicateCase(projectId: string, testCaseId: string) {
  const src = await prisma.testCase.findFirst({
    where: { id: testCaseId, projectId },
    include: { steps: { orderBy: { stepNumber: "asc" } }, requirements: { select: { requirementId: true } } },
  })
  if (!src) return null
  return prisma.testCase.create({
    data: {
      projectId,
      title: `Copy of ${src.title}`.slice(0, 500),
      priority: src.priority,
      preconditions: src.preconditions,
      source: src.source,
      executionType: src.executionType,
      requiredCredentialId: src.requiredCredentialId,
      testData: src.testData ?? undefined,
      tags: src.tags,
      assignee: src.assignee,
      suiteId: src.suiteId,
      estimatedMinutes: src.estimatedMinutes,
      // A copy is new work until someone has reviewed it.
      reviewState: "Draft",
      steps: { create: src.steps.map((s, i) => stepData(s as any, i + 1) as any) },
      requirements: { create: src.requirements.map((r) => ({ requirementId: r.requirementId })) },
    },
    select: { id: true, title: true },
  })
}

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes test cases WITHOUT destroying defects or automated run history.
 *
 * The old routes deleted every bug report linked to the case (with comments,
 * attachments and activity) and every automated run — and because
 * BugReport.testRunId is onDelete: Cascade, deleting the runs took the bugs
 * filed against those runs too. Bugs are evidence that outlives a test case.
 *
 * Now:
 *   - bugs are kept; their testCaseId is cleared by the FK (SetNull)
 *   - automated runs are kept as history; their testCaseId is cleared (SetNull)
 *   - manual session entries for the case go (the FK requires a case); bugs
 *     filed from them are untouched
 *   - steps, story links, versions and plan membership go with the case
 */
export async function deleteCasesSafely(projectId: string, ids: string[]) {
  const found = await prisma.testCase.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true, title: true },
  })
  if (!found.length) return { count: 0, titles: [] as string[] }
  const foundIds = found.map((t) => t.id)
  await prisma.$transaction(async (tx) => {
    await tx.bugReport.updateMany({ where: { testCaseId: { in: foundIds } }, data: { testCaseId: null } })
    await tx.testRun.updateMany({ where: { testCaseId: { in: foundIds } }, data: { testCaseId: null } })
    await tx.testCase.deleteMany({ where: { id: { in: foundIds } } })
  })
  return { count: found.length, titles: found.map((t) => t.title) }
}
