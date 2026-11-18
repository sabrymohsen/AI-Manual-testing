import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { executionVisibleTo } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

// GET /api/hub/accessibility?scriptId=…  (or ?executionId=…)
// Returns the accessibility audit result — latest for a script, or a specific execution's.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const sp = request.nextUrl.searchParams
    const scriptId = sp.get("scriptId")
    const executionId = sp.get("executionId")

    if (!scriptId && !executionId) {
      return NextResponse.json({ error: "scriptId or executionId is required" }, { status: 400 })
    }

    const result = executionId
      ? await prisma.accessibilityResult.findUnique({ where: { testExecutionId: executionId } })
      : await prisma.accessibilityResult.findFirst({
          where: { scriptId: scriptId! },
          orderBy: { createdAt: "desc" }
        })
    // Only results from runs in the caller's projects.
    if (result && !(await executionVisibleTo(auth.session!.user.id, result.testExecutionId))) {
      return NextResponse.json({ result: null })
    }

    return NextResponse.json({ result })
  } catch (err: any) {
    console.error("GET hub accessibility error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
