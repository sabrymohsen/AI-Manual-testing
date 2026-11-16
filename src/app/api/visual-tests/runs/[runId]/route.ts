import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { errorResponse, guardVisualRun, isProjectAdmin } from "@/lib/visual-tests/access"
import { sanitizeEnvironments } from "@/lib/visual-tests/environments"

/** A run with all its screens (without the heavy JSON), for the results page. */
export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const g = await guardVisualRun(params.runId)
  if (!g.ok) return g.response
  try {
    const [run, screens] = await Promise.all([
      prisma.visualTestRun.findUnique({
        where: { id: params.runId },
        include: { visualTest: { select: { id: true, name: true, type: true, startUrl: true, autoMaintenance: true, testCaseId: true, suite: { select: { id: true, name: true } } } } },
      }),
      prisma.visualScreen.findMany({
        where: { runId: params.runId },
        orderBy: [{ name: "asc" }, { envName: "asc" }],
        select: {
          id: true, name: true, url: true, screenKey: true, envKey: true, envName: true, browser: true, viewport: true,
          status: true, diffState: true, httpStatus: true, errorMessage: true, loadMs: true, mismatchPercent: true,
          actualImagePath: true, baselineImagePath: true, diffImagePath: true, width: true, height: true,
          resolvedByAuto: true, resolvedAt: true, bugReportId: true, stepId: true, diffRegions: true,
        },
      }),
    ])
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 })
    return NextResponse.json({
      run: { ...run, environments: sanitizeEnvironments(run.environments) },
      screens: screens.map(({ diffRegions, actualImagePath, baselineImagePath, diffImagePath, ...s }) => ({
        ...s,
        regionCount: Array.isArray(diffRegions) ? diffRegions.length : 0,
        hasActual: !!actualImagePath,
        hasBaseline: !!baselineImagePath,
        hasDiff: !!diffImagePath,
      })),
    })
  } catch (err) {
    return errorResponse(err, "Could not load the run")
  }
}

export async function DELETE(_req: Request, { params }: { params: { runId: string } }) {
  const g = await guardVisualRun(params.runId)
  if (!g.ok) return g.response
  if (!(await isProjectAdmin(g.projectId, g.session.user.id))) {
    return NextResponse.json({ error: "Only a project owner or admin can delete a run" }, { status: 403 })
  }
  if (g.record.status === "Queued" || g.record.status === "Running") {
    return NextResponse.json({ error: "Stop the run before deleting it" }, { status: 409 })
  }
  try {
    // A baseline pointing at this run's images keeps working: images are not deleted.
    await prisma.visualTestRun.delete({ where: { id: params.runId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, "Could not delete the run")
  }
}
