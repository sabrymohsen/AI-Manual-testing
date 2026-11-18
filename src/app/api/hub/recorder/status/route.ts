import { NextRequest, NextResponse } from "next/server"
import { requireAnyHubWriter } from "@/lib/hub-access"
import { getActiveSession, captureFrame } from "@/lib/hub-recorder"

export const dynamic = "force-dynamic"

// GET /api/hub/recorder/status — current frame + recorded actions
export async function GET(request: NextRequest) {
  // The recorder drives a browser on the server: project writers only.
  const access = await requireAnyHubWriter()
  if (!access.ok) return access.response

  try {
    const session = getActiveSession()
    if (!session) {
      return NextResponse.json({ recording: false, actions: [] })
    }

    let frame: string | null = null
    let currentUrl = session.url
    if (session.recording) {
      frame = await captureFrame(session)
      try {
        currentUrl = session.page.url()
      } catch {}
    }

    return NextResponse.json({
      sessionId: session.id,
      recording: session.recording,
      viewport: session.viewport,
      device: session.device,
      browser: session.browserName,
      currentUrl,
      frame,
      actions: session.actions
    })
  } catch (err: any) {
    console.error("GET recorder status error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
