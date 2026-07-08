import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Default mock crossbrowser matrix data seed definitions
const SEED_CROSSBROWSER_RESULTS = [
  // LoginFlowTest
  { testId: "LoginFlowTest", browserName: "Chrome", status: "pass", duration: 1850, errorMessage: null },
  { testId: "LoginFlowTest", browserName: "Firefox", status: "fail", duration: 2420, errorMessage: "org.openqa.selenium.TimeoutException: waiting for visibility of element located by By.id(\"submit-btn-old\")" },
  { testId: "LoginFlowTest", browserName: "Edge", status: "pass", duration: 1980, errorMessage: null },
  { testId: "LoginFlowTest", browserName: "Safari", status: "flaky", duration: 2900, errorMessage: "org.openqa.selenium.WebDriverException: connection reset" },
  
  // ApiCrudTest
  { testId: "ApiCrudTest", browserName: "Chrome", status: "pass", duration: 420, errorMessage: null },
  { testId: "ApiCrudTest", browserName: "Firefox", status: "pass", duration: 460, errorMessage: null },
  { testId: "ApiCrudTest", browserName: "Edge", status: "pass", duration: 450, errorMessage: null },
  { testId: "ApiCrudTest", browserName: "Safari", status: "pass", duration: 520, errorMessage: null },

  // DbQueryTest
  { testId: "DbQueryTest", browserName: "Chrome", status: "pass", duration: 120, errorMessage: null },
  { testId: "DbQueryTest", browserName: "Firefox", status: "pass", duration: 140, errorMessage: null },
  { testId: "DbQueryTest", browserName: "Edge", status: "pass", duration: 130, errorMessage: null },
  { testId: "DbQueryTest", browserName: "Safari", status: "not_run", duration: 0, errorMessage: null },

  // SearchFlowTest
  { testId: "SearchFlowTest", browserName: "Chrome", status: "pass", duration: 1100, errorMessage: null },
  { testId: "SearchFlowTest", browserName: "Firefox", status: "fail", duration: 1650, errorMessage: "org.openqa.selenium.NoSuchElementException: Cannot locate element search-bar" },
  { testId: "SearchFlowTest", browserName: "Edge", status: "pass", duration: 1200, errorMessage: null },
  { testId: "SearchFlowTest", browserName: "Safari", status: "fail", duration: 1900, errorMessage: "org.openqa.selenium.NoSuchElementException: Cannot locate element search-bar" }
]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let items = await prisma.crossBrowserResult.findMany({
      orderBy: { executionDate: "desc" }
    })

    if (items.length === 0) {
      await Promise.all(
        SEED_CROSSBROWSER_RESULTS.map(r =>
          prisma.crossBrowserResult.create({ data: r })
        )
      )
      items = await prisma.crossBrowserResult.findMany({
        orderBy: { executionDate: "desc" }
      })
    }

    // Recommendation logic: find browsers that failed on specific tests
    const firefoxFails = items.filter(r => r.browserName === "Firefox" && r.status === "fail").length
    const chromePasses = items.filter(r => r.browserName === "Chrome" && r.status === "pass").length
    
    let recommendation = "All browsers behave consistently across stable APIs. Review element selectors to align styles."
    if (firefoxFails >= 2) {
      recommendation = "Firefox consistently fails on login and product searches. Investigate gecko driver element syncing timeout differences."
    } else if (chromePasses === items.filter(r => r.browserName === "Chrome").length) {
      recommendation = "Chrome passes 100% of execution combination targets. Double check Safari rendering compatibility offsets."
    }

    return NextResponse.json({
      results: items,
      recommendation
    })
  } catch (err: any) {
    console.error("GET crossbrowser results error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { testId, browserName, status, duration, screenshotPath, errorMessage } = body

    if (!testId || !browserName || !status || duration === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await prisma.crossBrowserResult.create({
      data: {
        testId,
        browserName,
        status,
        duration,
        screenshotPath,
        errorMessage
      }
    })

    return NextResponse.json({ result }, { status: 201 })
  } catch (err: any) {
    console.error("POST crossbrowser result error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
