import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Seed default healing events if database table is empty
const SEED_HEALING_EVENTS = [
  {
    originalLocator: "By.id(\"submit-btn-old\")",
    recoveredLocator: "By.xpath(\"//button[@type='submit' and contains(@class, 'indigo')]\")",
    confidence: 0.92,
    pageUrl: "https://example.com/login",
    testName: "LoginFlowTest.testLoginRedirection",
    status: "recovered"
  },
  {
    originalLocator: "By.cssSelector(\"input.search-bar\")",
    recoveredLocator: "By.id(\"search-input\")",
    confidence: 0.88,
    pageUrl: "https://example.com/products",
    testName: "SearchFlowTest.testSearchFunctionality",
    status: "recovered"
  },
  {
    originalLocator: "By.xpath(\"//a[text()='Upgrade Plan']\")",
    recoveredLocator: "By.cssSelector(\"a.pricing-btn-upgrade\")",
    confidence: 0.74,
    pageUrl: "https://example.com/settings",
    testName: "SettingsTest.testBillingUpgrade",
    status: "needs_review"
  },
  {
    originalLocator: "By.id(\"deprecated-delete-btn\")",
    recoveredLocator: "By.xpath(\"//button[contains(@class, 'btn-danger')]\")",
    confidence: 0.58,
    pageUrl: "https://example.com/admin",
    testName: "AdminUserTest.testDeleteUser",
    status: "needs_review"
  },
  {
    originalLocator: "By.className(\"pricing-plan-free\")",
    recoveredLocator: "By.cssSelector(\".pricing-card-free\")",
    confidence: 0.95,
    pageUrl: "https://example.com/pricing",
    testName: "PricingTest.testFreePlanSelection",
    status: "recovered"
  }
]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let events = await prisma.healingEvent.findMany({
      orderBy: { createdAt: "desc" }
    })

    if (events.length === 0) {
      await Promise.all(
        SEED_HEALING_EVENTS.map(e =>
          prisma.healingEvent.create({ data: e })
        )
      )
      events = await prisma.healingEvent.findMany({
        orderBy: { createdAt: "desc" }
      })
    }

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
