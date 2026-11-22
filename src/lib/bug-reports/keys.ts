/**
 * Bug keys (BUG-0001 …) and the project a bug belongs to.
 */
import { prisma } from "@/lib/db"

const KEY = /^BUG-(\d+)$/i

/** Highest number among keys like BUG-0012. Pure, for tests. */
export function maxKeyNumber(keys: (string | null | undefined)[]): number {
  let max = 0
  for (const k of keys) {
    const m = KEY.exec((k ?? "").trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

export function formatBugKey(n: number): string {
  return `BUG-${String(n).padStart(4, "0")}`
}

/**
 * The next free key in a project. Uses the highest existing number, not the
 * count: counting reused a key after a delete (5 bugs, delete BUG-0003, the
 * next one became a second BUG-0005).
 */
export async function nextBugKey(projectId: string | null | undefined): Promise<string> {
  if (!projectId) return formatBugKey(1)
  const rows = await prisma.bugReport.findMany({
    where: { projectId, bugKey: { startsWith: "BUG-" } },
    select: { bugKey: true },
  })
  return formatBugKey(maxKeyNumber(rows.map((r) => r.bugKey)) + 1)
}

/**
 * The project of a bug saved without one (older manual-run bugs), found from
 * what it is linked to. Null when nothing points to a project.
 */
export async function inferBugProjectId(bugId: string): Promise<string | null> {
  const bug = await prisma.bugReport.findUnique({
    where: { id: bugId },
    select: {
      projectId: true,
      manualTestSession: { select: { projectId: true } },
      testRun: { select: { projectId: true } },
      testCase: { select: { projectId: true } },
      suite: { select: { projectId: true } },
      recordingSession: { select: { projectId: true } },
    },
  })
  if (!bug) return null
  return (
    bug.projectId ??
    bug.manualTestSession?.projectId ??
    bug.testRun?.projectId ??
    bug.testCase?.projectId ??
    bug.suite?.projectId ??
    bug.recordingSession?.projectId ??
    null
  )
}

/**
 * Gives a project-less bug its project (and a key) when it can be inferred,
 * so it can be opened, listed and deleted like any other. Returns the project id.
 */
export async function healBugProject(bugId: string): Promise<string | null> {
  const projectId = await inferBugProjectId(bugId)
  if (!projectId) return null
  const bug = await prisma.bugReport.findUnique({ where: { id: bugId }, select: { projectId: true, bugKey: true } })
  if (bug && (!bug.projectId || !bug.bugKey)) {
    await prisma.bugReport.update({
      where: { id: bugId },
      data: { projectId, ...(bug.bugKey ? {} : { bugKey: await nextBugKey(projectId) }) },
    })
  }
  return projectId
}
