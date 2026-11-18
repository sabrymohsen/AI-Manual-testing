import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/db"
import { requireHubExecution } from "@/lib/hub-access"
import { recalcOpenBugCount } from "@/lib/test-cases/rollup"
import { ARTIFACT_ROOT } from "@/lib/hub-evidence"
import { stripAnsi } from "@/lib/hub-report"

export const dynamic = "force-dynamic"

const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"

/**
 * POST /api/hub/executions/{id}/bug  { testIndex, severity?, title? }
 *
 * Files a bug from one failed test in an automated run: title, steps (the
 * test's location and how to re-run it), expected/actual (the assertion
 * error), and the failure screenshot copied into storage so the bug keeps it
 * even after run artifacts are cleaned up. Links the manual test case when
 * the script is linked to exactly one.
 */
export async function POST(request: NextRequest, { params }: { params: { executionId: string } }) {
  const access = await requireHubExecution(params.executionId, "write")
  if (!access.ok) return access.response
  const { execution, projectId } = access
  if (!projectId) return NextResponse.json({ error: "This run isn't attached to a project" }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const index = Number(body.testIndex)
  const results = Array.isArray(execution.results) ? (execution.results as any[]) : []
  const test = Number.isInteger(index) ? results[index] : null
  if (!test) return NextResponse.json({ error: "Pick a test from this run" }, { status: 400 })

  const severity = ["Low", "Medium", "High", "Critical"].includes(body.severity) ? body.severity : "High"
  const scriptName = execution.script?.name ?? "Automated test"
  const title = (typeof body.title === "string" && body.title.trim()) || `Automated test failed: ${test.title}`.slice(0, 300)
  const error = stripAnsi(
    [test.error?.message ?? (typeof test.error === "string" ? test.error : ""), test.error?.snippet ?? ""].filter(Boolean).join("\n\n")
  ).trim()
  const firstLine = error.split("\n").find((l) => l.trim()) ?? "The test failed"

  // Copy the screenshot into storage — the bug page serves files from there.
  let screenshotPath: string | null = null
  try {
    const src = test.screenshot ? path.resolve(String(test.screenshot)) : null
    if (src && src.startsWith(ARTIFACT_ROOT + path.sep) && fs.existsSync(src)) {
      const name = `hub-${execution.id.slice(0, 8)}-${index + 1}${path.extname(src) || ".png"}`
      const dir = path.join(STORAGE_ROOT, "screenshots")
      fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(src, path.join(dir, name))
      screenshotPath = path.posix.join("screenshots", name)
    }
  } catch (e) {
    console.error("hub bug screenshot copy failed:", e)
  }

  const links = await prisma.hubScriptTestCase.findMany({ where: { scriptId: execution.scriptId }, select: { testCaseId: true } })
  const testCaseId = links.length === 1 ? links[0].testCaseId : null
  const runUrl = `/projects/${projectId}/automation-hub?tab=runs&run=${execution.id}`

  const count = await prisma.bugReport.count({ where: { projectId } })
  const bugKey = `BUG-${String(count + 1).padStart(4, "0")}`
  const user = access.session.user

  const bug = await prisma.$transaction(async (tx) => {
    const b = await tx.bugReport.create({
      data: {
        bugKey,
        title,
        projectId,
        severity,
        priority: severity,
        status: "Open",
        tags: ["automation"],
        reporterId: user.id,
        source: "Automation",
        stepsToReproduce:
          `1. Run the automated test "${test.title}" (${scriptName}${execution.script?.folder ? `, folder ${execution.script.folder}` : ""}) in Automation Hub.\n` +
          `2. Browser: ${execution.browser ?? "default"}${execution.executionTarget ? ` on ${execution.executionTarget}` : ""}.\n` +
          `3. The run failed at: ${firstLine}`,
        expectedResult: "The test passes.",
        actualResult: error.slice(0, 5000) || "The test failed without an error message.",
        consoleLogs: `Automation run: ${runUrl}\nRun id: ${execution.id}`,
        screenshotPath,
        testCaseId,
      },
    })
    await tx.bugActivity.create({
      data: { bugId: b.id, action: "Bug Created", details: `Filed from automated run ${execution.id} by ${user.name || user.email}.` },
    })
    return b
  })
  if (testCaseId) await recalcOpenBugCount(testCaseId)

  return NextResponse.json({ bug: { id: bug.id, bugKey: bug.bugKey } }, { status: 201 })
}
