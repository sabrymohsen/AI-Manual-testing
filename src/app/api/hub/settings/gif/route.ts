import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { MAVEN_PROJECT_PATH } from "@/lib/hub-evidence"
import * as fs from "fs"
import * as path from "path"

export const dynamic = "force-dynamic"

// SHAFT animated-GIF recording is configured through custom.properties.
// This endpoint reads / writes that single source of truth so the Test Studio
// "Enable GIF recording" toggle stays in sync with what SHAFT will actually do
// on the next run.
const CUSTOM_PROPS = path.join(MAVEN_PROJECT_PATH, "src/main/resources/properties/custom.properties")

// SHAFT property names for GIF capture.
const KEY_ENABLED = "createAnimatedGif"
const KEY_FRAME_DELAY = "animatedGif.frameDelay" // milliseconds between frames
const KEY_QUALITY = "animatedGif.quality" // SHAFT compression quality (1 = best)

function readProps(): Record<string, string> {
  if (!fs.existsSync(CUSTOM_PROPS)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(CUSTOM_PROPS, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

function upsert(body: string, key: string, value: string): string {
  const lines = body.split("\n")
  let found = false
  const next = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`) || line.trim() === key) {
      found = true
      return `${key}=${value}`
    }
    return line
  })
  if (!found) next.push(`${key}=${value}`)
  return next.join("\n")
}

// GET /api/hub/settings/gif — current GIF recording configuration
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const props = readProps()
  return NextResponse.json({
    enabled: props[KEY_ENABLED] === "true",
    frameDelay: Number(props[KEY_FRAME_DELAY]) || 500,
    quality: Number(props[KEY_QUALITY]) || 5
  })
}

// PUT /api/hub/settings/gif — persist the toggle + quality/frame-rate into
// custom.properties so the next SHAFT run records (or stops recording) GIFs.
export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const enabled = Boolean(body.enabled)
    const frameDelay = Math.min(5000, Math.max(50, Number(body.frameDelay) || 500))
    const quality = Math.min(20, Math.max(1, Number(body.quality) || 5))

    let content = fs.existsSync(CUSTOM_PROPS) ? fs.readFileSync(CUSTOM_PROPS, "utf8") : ""
    content = upsert(content, KEY_ENABLED, enabled ? "true" : "false")
    content = upsert(content, KEY_FRAME_DELAY, String(frameDelay))
    content = upsert(content, KEY_QUALITY, String(quality))

    fs.mkdirSync(path.dirname(CUSTOM_PROPS), { recursive: true })
    fs.writeFileSync(CUSTOM_PROPS, content, "utf8")

    return NextResponse.json({ enabled, frameDelay, quality })
  } catch (err: any) {
    console.error("PUT gif settings error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
