import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubExecution } from "@/lib/hub-access"
import { EXECUTION_LOG_SENTINEL } from "@/lib/hub-evidence"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/executions/{id}/timeline — step-by-step evidence walkthrough
// for one execution, ordered by step number.
export async function GET(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  // Only members of the run's project may see it.
  const access = await requireHubExecution(params.executionId, "read")
  if (!access.ok) return access.response

  try {
    const execution = await prisma.testExecution.findUnique({
      where: { id: params.executionId },
      include: { script: { select: { id: true, name: true, type: true } } }
    })

    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 })
    }

    const steps = await prisma.evidenceFile.findMany({
      where: { testExecutionId: execution.id },
      orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }]
    })

    return NextResponse.json({
      execution: {
        id: execution.id,
        testName: execution.script?.name || "Unknown test",
        scriptType: execution.script?.type || null,
        status: execution.status,
        browser: execution.browser,
        duration: execution.duration,
        allureLink: execution.allureLink,
        createdAt: execution.createdAt
      },
      steps: steps.map((s) => ({
        ...s,
        fileExists: s.filePath === EXECUTION_LOG_SENTINEL || fs.existsSync(s.filePath)
      }))
    })
  } catch (err: any) {
    console.error("GET execution timeline error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
