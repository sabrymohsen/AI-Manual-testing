import { prisma } from "@/lib/db"

/** Per-card facts the board shows that the task list does not otherwise carry. */
export interface BoardSignals {
  /** True while at least one "is blocked by" task is still unfinished. */
  blocked: boolean
  /** Linked test cases by last result. NotExecuted / Skipped are not counted. */
  tests: { passed: number; failed: number; total: number }
}

const FINISHED = new Set(["DONE", "DEPLOYED"])
const EXECUTED = new Set(["Passed", "Failed", "Blocked", "Warning"])

export function summarizeSignals(input: { blockerStatuses: string[]; testStatuses: string[] }): BoardSignals {
  let passed = 0
  let failed = 0
  let total = 0
  for (const s of input.testStatuses) {
    if (!EXECUTED.has(s)) continue
    total++
    if (s === "Passed") passed++
    else if (s === "Failed") failed++
  }
  return {
    blocked: input.blockerStatuses.some((s) => !FINISHED.has(s)),
    tests: { passed, failed, total },
  }
}

/**
 * One batched lookup for a whole board. A task is blocked by another when it
 * holds an outgoing "is blocked by" link, or the other task holds an outgoing
 * "blocks" link to it.
 */
export async function loadBoardSignals(taskIds: string[]): Promise<Map<string, BoardSignals>> {
  const out = new Map<string, BoardSignals>()
  if (!taskIds.length) return out

  const [tests, blockedBy, blocks] = await Promise.all([
    prisma.taskTestCase.findMany({
      where: { taskId: { in: taskIds } },
      select: { taskId: true, testCase: { select: { lastStatus: true } } },
    }),
    prisma.taskLink.findMany({
      where: { type: "is blocked by", sourceId: { in: taskIds } },
      select: { sourceId: true, target: { select: { status: true } } },
    }),
    prisma.taskLink.findMany({
      where: { type: "blocks", targetId: { in: taskIds } },
      select: { targetId: true, source: { select: { status: true } } },
    }),
  ])

  const testStatuses = new Map<string, string[]>()
  const blockerStatuses = new Map<string, string[]>()
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k)
    if (list) list.push(v)
    else m.set(k, [v])
  }
  for (const t of tests) push(testStatuses, t.taskId, t.testCase.lastStatus)
  for (const l of blockedBy) push(blockerStatuses, l.sourceId, l.target.status)
  for (const l of blocks) push(blockerStatuses, l.targetId, l.source.status)

  for (const id of taskIds) {
    const b = blockerStatuses.get(id) ?? []
    const t = testStatuses.get(id) ?? []
    if (b.length || t.length) out.set(id, summarizeSignals({ blockerStatuses: b, testStatuses: t }))
  }
  return out
}
