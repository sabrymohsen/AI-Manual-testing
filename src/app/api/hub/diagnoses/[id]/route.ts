import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function GET(
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

    return NextResponse.json({ diagnosis: item })
  } catch (err: any) {
    console.error("GET diagnosis by ID error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
