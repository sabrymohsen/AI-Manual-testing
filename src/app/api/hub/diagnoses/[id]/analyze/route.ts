import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(
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

    // Update status to diagnosing to simulate real-time doctor run
    const updated = await prisma.diagnosis.update({
      where: { id: params.id },
      data: {
        status: "diagnosing",
        confidence: Math.round((0.8 + Math.random() * 0.18) * 100) / 100
      }
    })

    return NextResponse.json({ diagnosis: updated })
  } catch (err: any) {
    console.error("POST analyze diagnosis error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
