import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"


export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const items = await prisma.crossBrowserResult.findMany({
      orderBy: { executionDate: "desc" }
    })

    // No invented sample rows: an empty table means nothing has been recorded yet.

    // Recommendation logic: find browsers that failed on specific tests
    // Say only what the recorded results show.
    const browsers = Array.from(new Set(items.map((r) => r.browserName)))
    const failing = browsers
      .map((name) => ({ name, fails: items.filter((r) => r.browserName === name && r.status === "fail").length }))
      .filter((b) => b.fails > 0)
      .sort((x, y) => y.fails - x.fails)
    const recommendation =
      items.length === 0
        ? "No cross-browser results yet. Run a test on more than one browser to fill the matrix."
        : failing.length === 0
          ? `All ${items.length} results passed on ${browsers.join(", ")}.`
          : `Failures by browser: ${failing.map((b) => `${b.name} ${b.fails}`).join(", ")}. Open the failed cells to compare.`

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
