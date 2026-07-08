import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const item = await prisma.diagnosis.findUnique({
      where: { id: params.id }
    })

    if (!item) {
      return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 })
    }

    const updated = await prisma.diagnosis.update({
      where: { id: params.id },
      data: {
        status: "resolved",
        resolvedAt: new Date()
      }
    })

    return NextResponse.json({ diagnosis: updated })
  } catch (err: any) {
    console.error("PUT resolve diagnosis error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
