import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"


export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const tests = await prisma.flakyTest.findMany({
      orderBy: { flakinessScore: "desc" }
    })

    // No invented sample rows: an empty table means nothing has been recorded yet.

    // Compute KPIs
    const flakyCount = tests.filter(t => t.flakinessScore > 0.1).length
    // Not measured here (the Wait Analysis tab measures real trace timings).
    const avgActionTime = null
    const slowestTest = tests.length > 0 ? tests[0].testName : "N/A"
    const suiteStability = 100 - Math.round(
      (tests.reduce((sum, t) => sum + t.flakinessScore, 0) / (tests.length || 1)) * 100
    )

    return NextResponse.json({
      tests,
      kpis: {
        suiteStability,
        flakyCount,
        avgActionTime,
        slowestTest
      }
    })
  } catch (err: any) {
    console.error("GET flaky tests error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { testName, flakinessScore, totalRuns, failures, retries, rootCause, suggestedFix, trendDirection } = body

    if (!testName || flakinessScore === undefined || totalRuns === undefined || failures === undefined || retries === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const test = await prisma.flakyTest.create({
      data: {
        testName,
        flakinessScore,
        totalRuns,
        failures,
        retries,
        rootCause,
        suggestedFix,
        trendDirection: trendDirection || "flat"
      }
    })

    return NextResponse.json({ test }, { status: 201 })
  } catch (err: any) {
    console.error("POST flaky test error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
