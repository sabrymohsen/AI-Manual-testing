import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { buildWaitProfiles } from "@/lib/hub-waits"

export const dynamic = "force-dynamic"

// GET /api/hub/wait-profiler — per-test auto-wait profiles + suite summary,
// derived from real shaft-trace action durations.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const data = await buildWaitProfiles()
    return NextResponse.json(data)
  } catch (err: any) {
    console.error("GET wait-profiler error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
