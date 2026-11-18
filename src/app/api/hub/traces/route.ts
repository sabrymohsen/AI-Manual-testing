import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { listTraces } from "@/lib/hub-traces"
import { traceVisibleTo } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

// GET /api/hub/traces — list available SHAFT trace bundles (newest first)
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    // Only traces of runs in the caller's projects.
    const all = await listTraces()
    const traces = []
    for (const t of all) if (await traceVisibleTo(auth.session!.user.id, t.id)) traces.push(t)
    return NextResponse.json({ traces })
  } catch (err: any) {
    console.error("GET hub traces error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
