import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { executionVisibleTo } from "@/lib/hub-access"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const item = await prisma.diagnosis.findUnique({
      where: { id: params.id }
    })

    if (!item) {
      return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 })
    }
    // Only members of the run's project may see it.
    if (item && !(await executionVisibleTo(auth.session!.user.id, item.testExecutionId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ diagnosis: item })
  } catch (err: any) {
    console.error("GET diagnosis by ID error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
