import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { errorResponse, guardVisualTest } from "@/lib/visual-tests/access"
import { recompareScreens } from "@/lib/visual-tests/compare-service"

/**
 * Remove an ignore region and re-compare the latest run's screens it covered,
 * so a screen it had been hiding a change on goes back to Unresolved.
 */
export async function DELETE(_req: Request, { params }: { params: { regionId: string } }) {
  const region = await prisma.visualTestRegion.findUnique({ where: { id: params.regionId } })
  if (!region) return NextResponse.json({ error: "Region not found" }, { status: 404 })
  const g = await guardVisualTest(region.visualTestId)
  if (!g.ok) return g.response
  try {
    await prisma.visualTestRegion.delete({ where: { id: region.id } })
    const latest = await prisma.visualTestRun.findFirst({ where: { visualTestId: region.visualTestId }, orderBy: { createdAt: "desc" }, select: { id: true } })
    let updated: { id: string; status: string }[] = []
    if (latest) {
      const affected = await prisma.visualScreen.findMany({
        where: {
          runId: latest.id,
          status: { in: ["Unresolved", "Passed"] },
          ...(region.screenKey ? { screenKey: region.screenKey } : {}),
          ...(region.envKey ? { envKey: region.envKey } : {}),
        },
        select: { id: true },
        take: 500,
      })
      updated = await recompareScreens(affected.map(a => a.id))
    }
    return NextResponse.json({ ok: true, updated })
  } catch (err) {
    return errorResponse(err, "Could not remove the region")
  }
}
