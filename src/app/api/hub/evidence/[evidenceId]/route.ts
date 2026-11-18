import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { executionVisibleTo } from "@/lib/hub-access"
import { EXECUTION_LOG_SENTINEL } from "@/lib/hub-evidence"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/evidence/{id} — evidence detail with execution context and
// prev/next sibling ids (ordered by stepNumber within the same execution).
export async function GET(
  request: NextRequest,
  { params }: { params: { evidenceId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const item = await prisma.evidenceFile.findUnique({ where: { id: params.evidenceId } })
    if (!item) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 })
    }
    // Only members of the run's project may see it.
    if (item && !(await executionVisibleTo(auth.session!.user.id, item.testExecutionId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const [execution, siblings] = await Promise.all([
      prisma.testExecution.findUnique({
        where: { id: item.testExecutionId },
        include: { script: { select: { id: true, name: true, type: true } } }
      }),
      prisma.evidenceFile.findMany({
        where: { testExecutionId: item.testExecutionId },
        orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
        select: { id: true, fileType: true, stepNumber: true }
      })
    ])

    const idx = siblings.findIndex((s) => s.id === item.id)

    return NextResponse.json({
      evidence: {
        ...item,
        testName: execution?.script?.name || "Unknown test",
        scriptType: execution?.script?.type || null,
        executionStatus: execution?.status || null,
        executionDuration: execution?.duration ?? null,
        browser: execution?.browser || null,
        fileExists: item.filePath === EXECUTION_LOG_SENTINEL || fs.existsSync(item.filePath)
      },
      prevId: idx > 0 ? siblings[idx - 1].id : null,
      nextId: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null,
      stepIndex: idx + 1,
      stepTotal: siblings.length
    })
  } catch (err: any) {
    console.error("GET evidence detail error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
