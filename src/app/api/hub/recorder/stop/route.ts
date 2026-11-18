import { NextRequest, NextResponse } from "next/server"
import { requireAnyHubWriter } from "@/lib/hub-access"
import { stopActiveSession } from "@/lib/hub-recorder"

export const dynamic = "force-dynamic"

// POST /api/hub/recorder/stop — stop the capture session, return recorded actions
export async function POST(request: NextRequest) {
  // The recorder drives a browser on the server: project writers only.
  const access = await requireAnyHubWriter()
  if (!access.ok) return access.response

  try {
    const actions = await stopActiveSession()
    return NextResponse.json({ stopped: true, actions })
  } catch (err: any) {
    console.error("POST recorder stop error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
