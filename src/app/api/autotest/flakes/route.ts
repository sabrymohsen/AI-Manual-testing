import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Seed default flaky tests if database table is empty
const SEED_FLAKY_TESTS = [
  {
    testName: "LoginFlowTest.testLoginRedirection",
    flakinessScore: 0.38,
    totalRuns: 50,
    failures: 12,
    retries: 7,
    rootCause: "Sync Issue (Element not loaded fast enough)",
    suggestedFix: "Locator 'id=submit-btn' took 4.2s — consider using clickableField('Submit') with explicit wait",
    trendDirection: "up"
  },
  {
    testName: "SearchFlowTest.testSearchFunctionality",
    flakinessScore: 0.15,
    totalRuns: 60,
    failures: 4,
    retries: 5,
    rootCause: "Locator Issue (Dynamic class name overrides)",
    suggestedFix: "Avoid dynamic CSS classes; switch to fixed accessibilityId() or target text",
    trendDirection: "down"
  },
  {
    testName: "ApiCrudTest.testGetUserList",
    flakinessScore: 0.08,
    totalRuns: 80,
    failures: 2,
    retries: 4,
    rootCause: "Network Issue (Rate limiting on mock API)",
    suggestedFix: "Add retry block or stub API responses locally with dynamic mock endpoints",
    trendDirection: "flat"
  },
  {
    testName: "SettingsTest.testBillingUpgrade",
    flakinessScore: 0.44,
    totalRuns: 45,
    failures: 15,
    retries: 8,
    rootCause: "Data Issue (Stale credit card mock tokens)",
    suggestedFix: "Reset sandbox tokens inside test teardown block to prevent state overlap",
    trendDirection: "up"
  }
]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let tests = await prisma.flakyTest.findMany({
      orderBy: { flakinessScore: "desc" }
    })

    if (tests.length === 0) {
      await Promise.all(
        SEED_FLAKY_TESTS.map(t =>
          prisma.flakyTest.create({ data: t })
        )
      )
      tests = await prisma.flakyTest.findMany({
        orderBy: { flakinessScore: "desc" }
      })
    }

    // Compute KPIs
    const flakyCount = tests.filter(t => t.flakinessScore > 0.1).length
    const avgActionTime = 380 // simulated 380ms
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
