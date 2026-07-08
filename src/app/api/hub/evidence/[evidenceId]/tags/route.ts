import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

// PUT /api/hub/evidence/{id}/tags — replace the evidence tags
export async function PUT(
  request: NextRequest,
  { params }: { params: { evidenceId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    if (!Array.isArray(body.tags)) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 })
    }

    const tags = body.tags
      .map((t: unknown) => String(t).trim())
      .filter((t: string) => t.length > 0 && t.length <= 30)
      .slice(0, 12)

    const evidence = await prisma.evidenceFile.update({
      where: { id: params.evidenceId },
      data: { tags }
    })

    return NextResponse.json({ evidence })
  } catch (err: any) {
    console.error("PUT evidence tags error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
