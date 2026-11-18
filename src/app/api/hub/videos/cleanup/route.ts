import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"
import { cleanupOldVideos, readVideoSettings, computeVideoStorage } from "@/lib/hub-video"

export const dynamic = "force-dynamic"

// POST /api/hub/videos/cleanup — delete video evidence older than the configured
// retention window (or an explicit ?days override).
export async function POST(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    const days = Number(body.days) || readVideoSettings().autoDeleteDays
    if (!days || days <= 0) {
      return NextResponse.json({ error: "No retention window configured", removed: 0 }, { status: 400 })
    }
    const removed = await cleanupOldVideos(days)
    const storage = await computeVideoStorage()
    return NextResponse.json({ removed, storage })
  } catch (err: any) {
    console.error("POST video cleanup error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
