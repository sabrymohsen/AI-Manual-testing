import { NextRequest, NextResponse } from "next/server"
import { requireAnyHubWriter } from "@/lib/hub-access"
import { getActiveSession } from "@/lib/hub-recorder"

export const dynamic = "force-dynamic"

// POST /api/hub/recorder/input — forward user interactions from the streamed
// browser view into the live Playwright page (clicks, keys, scrolling).
export async function POST(request: NextRequest) {
  // The recorder drives a browser on the server: project writers only.
  const access = await requireAnyHubWriter()
  if (!access.ok) return access.response

  try {
    const session = getActiveSession()
    if (!session || !session.recording) {
      return NextResponse.json({ error: "No active recording session" }, { status: 409 })
    }

    const body = await request.json()
    const { type } = body

    if (type === "click") {
      const x = Math.max(0, Math.min(Number(body.x) || 0, session.viewport.width))
      const y = Math.max(0, Math.min(Number(body.y) || 0, session.viewport.height))
      await session.page.mouse.click(x, y)
    } else if (type === "key") {
      const key = String(body.key || "")
      if (key.length === 1) {
        await session.page.keyboard.type(key)
      } else if (
        ["Enter", "Backspace", "Delete", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(key)
      ) {
        await session.page.keyboard.press(key)
      }
    } else if (type === "scroll") {
      await session.page.mouse.wheel(0, Number(body.deltaY) || 0)
    } else {
      return NextResponse.json({ error: `Unknown input type: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("POST recorder input error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
