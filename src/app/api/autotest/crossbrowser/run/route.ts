import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { tests, browsers } = body // Arrays of strings

    if (!tests || !browsers || tests.length === 0 || browsers.length === 0) {
      return NextResponse.json({ error: "Missing tests or browsers selection parameters" }, { status: 400 })
    }

    // Process batch run combinations
    const results = []
    for (const testId of tests) {
      for (const browserName of browsers) {
        // Randomize status based on standard behaviors
        let status = "pass"
        let duration = Math.round(1000 + Math.random() * 1500)
        let errorMessage = null

        if (browserName === "Firefox" && (testId.includes("Login") || testId.includes("Search"))) {
          status = "fail"
          errorMessage = "org.openqa.selenium.TimeoutException: Element not located within 10 seconds"
        } else if (browserName === "Safari" && Math.random() > 0.7) {
          status = "flaky"
          errorMessage = "org.openqa.selenium.WebDriverException: Connection reset by peer"
        }

        // Save execution combination in database
        const result = await prisma.crossBrowserResult.create({
          data: {
            testId,
            browserName,
            status,
            duration,
            errorMessage
          }
        })
        results.push(result)
      }
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    console.error("POST batch crossbrowser run error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
