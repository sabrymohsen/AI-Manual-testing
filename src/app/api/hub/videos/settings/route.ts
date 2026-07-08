import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { readVideoSettings, writeVideoSettings, computeVideoStorage } from "@/lib/hub-video"

export const dynamic = "force-dynamic"

// GET /api/hub/videos/settings — recording config + real storage usage
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const [settings, storage] = await Promise.all([Promise.resolve(readVideoSettings()), computeVideoStorage()])
    return NextResponse.json({ settings, storage })
  } catch (err: any) {
    console.error("GET video settings error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/hub/videos/settings — persist recording config to custom.properties
export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const settings = writeVideoSettings(body)
    return NextResponse.json({ settings })
  } catch (err: any) {
    console.error("PUT video settings error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
