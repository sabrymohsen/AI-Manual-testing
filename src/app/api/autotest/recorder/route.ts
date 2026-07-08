import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const sessions = await prisma.recorderSession.findMany({
      orderBy: { createdAt: "desc" }
    })
    return NextResponse.json({ sessions })
  } catch (err: any) {
    console.error("GET recorder sessions error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
