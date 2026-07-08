import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { createClip } from "@/lib/hub-video"

export const dynamic = "force-dynamic"

// POST /api/hub/videos/clips — cut a clip from a source video with ffmpeg and
// register it as a new video evidence row.
// body: { sourceEvidenceId, startSec, endSec, title, description }
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    if (!body.sourceEvidenceId || body.startSec === undefined || body.endSec === undefined) {
      return NextResponse.json({ error: "sourceEvidenceId, startSec and endSec are required" }, { status: 400 })
    }
    const clip = await createClip({
      sourceEvidenceId: body.sourceEvidenceId,
      startSec: Number(body.startSec),
      endSec: Number(body.endSec),
      title: body.title || "clip",
      description: body.description
    })
    return NextResponse.json({ clip: { id: clip.id, url: `/api/hub/evidence/${clip.id}/file` } }, { status: 201 })
  } catch (err: any) {
    console.error("POST video clip error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
