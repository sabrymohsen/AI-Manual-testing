import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"
import crypto from "node:crypto"

export const dynamic = "force-dynamic"

// POST /api/annotation-share
// Body: { imageDataUrl (PNG), title?, metadata?, expiresInDays? }
// Persists the annotated PNG to public/uploads/shares/<token>.png and records a
// SharedAnnotation. Returns an unguessable, optionally-expiring share link.
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const imageDataUrl: string = body.imageDataUrl || ""
    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "imageDataUrl must be a PNG data URL" }, { status: 400 })
    }

    const token = crypto.randomBytes(16).toString("hex")
    const b64 = imageDataUrl.split(",")[1] || ""
    const buffer = Buffer.from(b64, "base64")
    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 25MB)" }, { status: 413 })
    }

    const dir = path.join(process.cwd(), "public", "uploads", "shares")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${token}.png`), buffer)
    const imageUrl = `/uploads/shares/${token}.png`

    const days = Math.min(90, Math.max(1, Number(body.expiresInDays) || 7))
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    await prisma.sharedAnnotation.create({
      data: {
        token,
        imageUrl,
        title: String(body.title || "").slice(0, 200),
        metadata: body.metadata ?? undefined,
        createdBy: auth.session!.user.id,
        expiresAt,
      },
    })

    return NextResponse.json({ token, url: `/share/${token}`, imageUrl, expiresAt })
  } catch (err: any) {
    console.error("POST annotation-share error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
