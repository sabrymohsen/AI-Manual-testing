import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { addVisualTestRunJob, QueueUnavailableError } from "@/lib/queue"
import { errorResponse, guardVisualTest } from "@/lib/visual-tests/access"
import { sanitizeEnvironments } from "@/lib/visual-tests/environments"
import { activePages } from "@/lib/visual-tests/page-sync"

/** Start a run. One run per test at a time: two would race to write the same baselines. */
export async function POST(_req: Request, { params }: { params: { testId: string } }) {
  const g = await guardVisualTest(params.testId)
  if (!g.ok) return g.response
  const test = g.record
  if (test.type === "Flow") {
    return NextResponse.json({ error: "Checkpoints in a test case are captured when that test case runs." }, { status: 400 })
  }
  try {
    const envs = sanitizeEnvironments(test.environments)
    if (!envs.length) return NextResponse.json({ error: "Choose at least one browser or screen size first" }, { status: 400 })
    if (test.type === "UrlList") {
      const pages = await prisma.visualTestPage.findMany({ where: { visualTestId: test.id } })
      if (!activePages(pages, test.excludedFolders, test.maxUrls).length) {
        return NextResponse.json({ error: "Every page is excluded. Include at least one page first." }, { status: 400 })
      }
    }
    const active = await prisma.visualTestRun.findFirst({
      where: { visualTestId: test.id, status: { in: ["Queued", "Running"] } },
      select: { id: true },
    })
    if (active) return NextResponse.json({ error: "This test is already running", runId: active.id }, { status: 409 })

    const run = await prisma.visualTestRun.create({
      data: {
        visualTestId: test.id,
        projectId: test.projectId,
        environments: envs as any,
        matchLevel: test.matchLevel,
        captureType: test.captureType,
        triggeredById: g.session.user.id,
      },
      select: { id: true },
    })
    try {
      await addVisualTestRunJob(run.id)
    } catch (err) {
      await prisma.visualTestRun.update({
        where: { id: run.id },
        data: { status: "Failed", completedAt: new Date(), error: err instanceof QueueUnavailableError ? err.message : "The run could not be queued." },
      })
      throw err
    }
    return NextResponse.json({ runId: run.id }, { status: 201 })
  } catch (err) {
    return errorResponse(err, "Could not start the run")
  }
}
