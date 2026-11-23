import { randomUUID } from "crypto"
import { prisma } from "@/lib/db"
import { startBatchRun, startScriptRun, type ExecutionTargetLike, type RunMeta } from "@/lib/hub-runner"
import { projectScriptsWhere } from "@/lib/hub-scripts"

/**
 * One way to start hub runs for a project, used by the Run buttons, re-runs,
 * schedules and the CI trigger, so they all pick tests the same way.
 */

export interface RunScope {
  scriptIds?: string[]
  folder?: string
  tag?: string
  /** Re-run the tests that failed in this batch. */
  rerunFailedOfBatch?: string
  /** Re-run the scripts of these executions. */
  rerunExecutionIds?: string[]
}

export async function resolveTarget(targetId?: string | null): Promise<ExecutionTargetLike | undefined> {
  if (!targetId || targetId === "local") return undefined
  const t = await prisma.executionTarget.findUnique({ where: { id: targetId } })
  return t ? { name: t.name, type: t.type, url: t.url, platform: t.platform, browser: t.browser, headless: t.headless } : undefined
}

/** Runs of a project, including legacy runs that only know their script's project. */
export const projectRunsWhere = (projectId: string) => ({
  OR: [{ projectId }, { projectId: null, script: { projectId } }],
})

export async function scriptsForScope(projectId: string, scope: RunScope) {
  const and: any[] = [projectScriptsWhere(projectId)]

  if (scope.rerunFailedOfBatch) {
    const failed = await prisma.testExecution.findMany({
      where: { batchId: scope.rerunFailedOfBatch, status: "Failed", ...projectRunsWhere(projectId) },
      select: { scriptId: true },
    })
    and.push({ id: { in: failed.map((f) => f.scriptId) } })
  } else if (scope.rerunExecutionIds?.length) {
    const execs = await prisma.testExecution.findMany({
      where: { id: { in: scope.rerunExecutionIds }, ...projectRunsWhere(projectId) },
      select: { scriptId: true },
    })
    and.push({ id: { in: execs.map((e) => e.scriptId) } })
  } else {
    if (scope.scriptIds?.length) and.push({ id: { in: scope.scriptIds.map(String) } })
    if (typeof scope.folder === "string") and.push({ folder: scope.folder })
    if (scope.tag) and.push({ tags: { has: scope.tag } })
  }
  // Projects on testers' computers run from the desktop app, never on the server.
  return prisma.testScript.findMany({ where: { AND: [...and, { mode: { notIn: ["local", "agent"] } }] }, orderBy: [{ folder: "asc" }, { name: "asc" }] })
}

export async function startScopedRun(
  projectId: string,
  scope: RunScope,
  opts: { browser?: string; targetId?: string | null; meta: RunMeta }
): Promise<{ batchId: string | null; executionIds: string[] } | { error: string }> {
  const scripts = await scriptsForScope(projectId, scope)
  if (!scripts.length) return { error: "No tests match" }
  const browser = String(opts.browser || "Headless")
  const target = await resolveTarget(opts.targetId)
  const meta: RunMeta = { ...opts.meta, projectId }

  if (scripts.length === 1) {
    const s = scripts[0]
    const id = await startScriptRun(s, browser, false, target, s.accessibilityEnabled, null, meta)
    return { batchId: null, executionIds: [id] }
  }
  const batchId = randomUUID()
  const executionIds = await startBatchRun(scripts, { browser, target, batchId, meta })
  return { batchId, executionIds }
}
