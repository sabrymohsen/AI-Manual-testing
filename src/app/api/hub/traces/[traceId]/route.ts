import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { readTrace } from "@/lib/hub-traces"

export const dynamic = "force-dynamic"

// GET /api/hub/traces/{traceId} — parsed + normalised trace for the viewer
export async function GET(
  request: NextRequest,
  { params }: { params: { traceId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const trace = await readTrace(params.traceId)
    if (!trace) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 })
    }
    return NextResponse.json(trace)
  } catch (err: any) {
    console.error("GET hub trace error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
