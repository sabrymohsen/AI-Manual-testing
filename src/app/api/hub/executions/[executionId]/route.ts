import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

// GET /api/hub/executions/{id} — get execution results
export async function GET(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const execution = await prisma.testExecution.findUnique({
      where: { id: params.executionId },
      include: {
        script: { select: { id: true, name: true, type: true } }
      }
    })

    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 })
    }

    return NextResponse.json({ execution })
  } catch (err: any) {
    console.error("GET hub execution error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
