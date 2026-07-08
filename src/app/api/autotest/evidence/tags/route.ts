import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { fileId, tags } = body

    if (!fileId || !tags) {
      return NextResponse.json({ error: "Missing fileId or tags" }, { status: 400 })
    }

    const updated = await prisma.evidenceFile.update({
      where: { id: fileId },
      data: { tags }
    })

    return NextResponse.json({ file: updated })
  } catch (err: any) {
    console.error("POST evidence tags error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
