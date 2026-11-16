import fs from "node:fs/promises"
import { NextResponse } from "next/server"
import { guardVisualScreen } from "@/lib/visual-tests/access"

/**
 * A screen's images, checked against the screen's project. Served here rather
 * than through /api/files, which only checks that someone is signed in.
 */
export async function GET(req: Request, { params }: { params: { screenId: string } }) {
  const g = await guardVisualScreen(params.screenId)
  if (!g.ok) return g.response
  const kind = new URL(req.url).searchParams.get("kind")
  const s = g.record
  const filePath = kind === "baseline" ? s.baselineImagePath : kind === "diff" ? s.diffImagePath : s.actualImagePath
  if (!filePath) return NextResponse.json({ error: "No image" }, { status: 404 })
  try {
    const buffer = await fs.readFile(filePath)
    return new NextResponse(buffer, {
      headers: {
        "content-type": "image/png",
        // Image files are never rewritten in place (every capture gets a new name),
        // but a baseline URL points at whichever image is approved, so keep it short.
        "cache-control": kind === "baseline" ? "private, max-age=30" : "private, max-age=86400",
      },
    })
  } catch {
    return NextResponse.json({ error: "The image is no longer in storage" }, { status: 404 })
  }
}
