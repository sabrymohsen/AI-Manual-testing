import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"


export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const events = await prisma.healingEvent.findMany({
      orderBy: { createdAt: "desc" }
    })

    // No invented sample rows: an empty table means nothing has been recorded yet.

    // Compute KPIs
    const totalRecoveries = events.length
    const successRate = totalRecoveries > 0 
      ? Math.round((events.filter(e => e.status === "recovered").length / totalRecoveries) * 100)
      : 100
    const avgConfidence = totalRecoveries > 0
      ? Math.round((events.reduce((sum, e) => sum + e.confidence, 0) / totalRecoveries) * 100)
      : 100
    const needsReview = events.filter(e => e.status === "needs_review").length

    return NextResponse.json({
      events,
      kpis: {
        totalRecoveries,
        successRate,
        avgConfidence,
        needsReview
      }
    })
  } catch (err: any) {
    console.error("GET healing events error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { originalLocator, recoveredLocator, confidence, pageUrl, testName, status } = body

    if (!originalLocator || !recoveredLocator || confidence === undefined || !pageUrl || !testName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const event = await prisma.healingEvent.create({
      data: {
        originalLocator,
        recoveredLocator,
        confidence,
        pageUrl,
        testName,
        status: status || "recovered"
      }
    })

    return NextResponse.json({ event }, { status: 201 })
  } catch (err: any) {
    console.error("POST healing event error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
