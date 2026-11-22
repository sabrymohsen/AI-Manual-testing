import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { parseJunitReport, parsePlaywrightReport, summarize } from "@/lib/hub-report"

export const dynamic = "force-dynamic"

/** Where a project that runs on testers' computers is listed in the hub. */
const LOCAL_FOLDER = "On my computer"

/**
 * POST /api/hub/local-runs  { projectId, name, path, report, format?, log, durationMs }
 * format "junit" = report is JUnit XML text (pytest projects), else Playwright's JSON.
 * Results of a Playwright project the desktop app ran on the tester's own
 * computer, shared in the Automation Hub. The project shows as a "local" test
 * (it can't run on the server); each upload is a run in the Runs tab.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 8_000_000) return NextResponse.json({ error: "That report is too big to upload (8 MB max)" }, { status: 413 })
  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const auth = await requireHubProject(body.projectId, "write")
  if (!auth.ok) return auth.response
  const name = String(body.name || "").replace(/[^\p{L}\p{N}\p{M} _-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Local project"
  const where = typeof body.path === "string" ? body.path.slice(0, 500) : ""

  // Attachment paths point at the tester's disk: keep the results, drop the paths.
  const parsed = !body.report ? [] : body.format === "junit" ? parseJunitReport(String(body.report)) : parsePlaywrightReport(body.report)
  const results = parsed.map(({ screenshot, trace, video, ...r }) => r)
  const sum = summarize(results)
  const failed = sum.failed > 0 || (!results.length && body.exitCode !== 0)

  let script = await prisma.testScript.findFirst({ where: { projectId: body.projectId, mode: "local", name } })
  if (!script) {
    script = await prisma.testScript.create({
      data: {
        name,
        type: "Web",
        mode: "local",
        folder: LOCAL_FOLDER,
        projectId: body.projectId,
        tags: ["local"],
        code: `${body.format === "junit" ? "#" : "//"} "${name}" is a ${body.format === "junit" ? "pytest " : ""}Playwright project on a tester's computer${where ? ` (${where})` : ""}.\n${body.format === "junit" ? "#" : "//"} It runs there from the QA Engine desktop app; its results are shared here.\n`,
      },
    })
  }
  const user = auth.session.user
  const execution = await prisma.testExecution.create({
    data: {
      scriptId: script.id,
      status: failed ? "Failed" : "Passed",
      logOutput: String(body.log || "").slice(-200_000),
      duration: Number(body.durationMs) || null,
      results: results as any,
      projectId: body.projectId,
      browser: "Local",
      executionTarget: `${user.name || user.email}'s computer`,
      triggerSource: "local",
      triggeredById: user.id,
      triggeredByName: user.name || user.email,
    },
  })
  return NextResponse.json({ executionId: execution.id, scriptId: script.id, summary: sum }, { status: 201 })
}
