import { NextRequest, NextResponse } from "next/server"
import { requireAnyHubWriter } from "@/lib/hub-access"
import { startSession } from "@/lib/hub-recorder"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST /api/hub/recorder/start — launch a capture session
export async function POST(request: NextRequest) {
  // The recorder drives a browser on the server: project writers only.
  const access = await requireAnyHubWriter()
  if (!access.ok) return access.response

  try {
    const body = await request.json()
    const { url, device = "Desktop", browser = "Chrome", customViewport, customUserAgent, customScaleFactor, isMobile } = body

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "A valid http(s) URL is required" }, { status: 400 })
    }

    const session = await startSession({
      url,
      device,
      browserName: browser,
      customViewport,
      customUserAgent,
      customScaleFactor,
      isMobile
    })

    return NextResponse.json({
      sessionId: session.id,
      viewport: session.viewport,
      device: session.device,
      browser: session.browserName
    })
  } catch (err: any) {
    console.error("POST recorder start error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
