import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { stopActiveSession } from "@/lib/hub-recorder"

export const dynamic = "force-dynamic"

// POST /api/hub/recorder/stop — stop the capture session, return recorded actions
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const actions = await stopActiveSession()
    return NextResponse.json({ stopped: true, actions })
  } catch (err: any) {
    console.error("POST recorder stop error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
