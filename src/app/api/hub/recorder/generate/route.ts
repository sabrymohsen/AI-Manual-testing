import { NextRequest, NextResponse } from "next/server"
import { requireAnyHubWriter } from "@/lib/hub-access"
import { generatePlaywrightSpec } from "@/lib/recorder-codegen"
import { getActiveSession } from "@/lib/hub-recorder"

export const dynamic = "force-dynamic"

// POST /api/hub/recorder/generate — generate Playwright TypeScript code from recorded actions.
// Accepts an edited actions array (rows may have been deleted in review); falls
// back to the active session's actions when none are provided.
export async function POST(request: NextRequest) {
  // The recorder drives a browser on the server: project writers only.
  const access = await requireAnyHubWriter()
  if (!access.ok) return access.response

  try {
    const body = await request.json().catch(() => ({}))
    const className = body.className || "RecordedFlowTest"

    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(className)) {
      return NextResponse.json({ error: "className must be a valid Java class name" }, { status: 400 })
    }

    const actions = Array.isArray(body.actions) ? body.actions : getActiveSession()?.actions || []
    const code = generatePlaywrightSpec(actions, className)

    return NextResponse.json({ code, className, actionCount: actions.length })
  } catch (err: any) {
    console.error("POST recorder generate error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
