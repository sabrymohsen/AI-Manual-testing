import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { visibleExecutionIds } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

// GET /api/hub/evidence/executions — recent executions that have evidence,
// used by the Timeline Walkthrough selector.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    // Only runs in the caller's projects.
    const visible = await visibleExecutionIds(auth.session!.user.id)
    const grouped = await prisma.evidenceFile.groupBy({
      ...(visible === "all" ? {} : { where: { testExecutionId: { in: visible } } }),
      by: ["testExecutionId"],
      _count: { id: true }
    })
    const counts = new Map(grouped.map((g) => [g.testExecutionId, g._count.id]))

    const executions = await prisma.testExecution.findMany({
      where: { id: { in: grouped.map((g) => g.testExecutionId) } },
      include: { script: { select: { name: true, type: true } } },
      orderBy: { createdAt: "desc" },
      take: 30
    })

    return NextResponse.json({
      executions: executions.map((e) => ({
        id: e.id,
        testName: e.script?.name || "Unknown test",
        scriptType: e.script?.type || null,
        status: e.status,
        browser: e.browser,
        duration: e.duration,
        createdAt: e.createdAt,
        evidenceCount: counts.get(e.id) || 0
      }))
    })
  } catch (err: any) {
    console.error("GET evidence executions error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
