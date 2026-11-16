import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { asRegions } from "@/lib/visual-tests/compare-service"
import { errorResponse, guardVisualScreen } from "@/lib/visual-tests/access"

/**
 * Everything the analyzer shows for one screen: the screen, its regions of
 * difference, the ignore regions that apply, and its neighbours in the run for
 * previous / next navigation.
 */
export async function GET(_req: Request, { params }: { params: { screenId: string } }) {
  const g = await guardVisualScreen(params.screenId)
  if (!g.ok) return g.response
  const screen = g.record
  try {
    const [run, test, siblings, regions, bug, autoChildren] = await Promise.all([
      prisma.visualTestRun.findUnique({ where: { id: screen.runId }, select: { id: true, status: true, outcome: true, matchLevel: true, captureType: true, createdAt: true } }),
      prisma.visualTest.findUnique({ where: { id: screen.visualTestId }, select: { id: true, name: true, type: true, autoMaintenance: true, suite: { select: { id: true, name: true } } } }),
      prisma.visualScreen.findMany({
        where: { runId: screen.runId },
        orderBy: [{ name: "asc" }, { envName: "asc" }],
        select: { id: true, status: true, name: true, envName: true },
      }),
      prisma.visualTestRegion.findMany({
        where: {
          visualTestId: screen.visualTestId,
          AND: [{ OR: [{ screenKey: null }, { screenKey: screen.screenKey }] }, { OR: [{ envKey: null }, { envKey: screen.envKey }] }],
        },
        orderBy: { createdAt: "asc" },
      }),
      screen.bugReportId ? prisma.bugReport.findUnique({ where: { id: screen.bugReportId }, select: { id: true, bugKey: true, title: true, status: true } }) : null,
      prisma.visualScreen.findMany({ where: { autoFromScreenId: screen.id, resolvedByAuto: true }, select: { id: true, name: true, envName: true, status: true } }),
    ])
    // The run is sent on its own below; dynamic-text boxes are internal to the comparison.
    const rest: Record<string, unknown> = { ...screen }
    delete rest.run
    delete rest.dynamicRects
    return NextResponse.json({
      screen: { ...rest, diffRegions: asRegions(screen.diffRegions) },
      run,
      test,
      siblings,
      regions,
      bug,
      autoChildren,
    })
  } catch (err) {
    return errorResponse(err, "Could not load the screen")
  }
}
