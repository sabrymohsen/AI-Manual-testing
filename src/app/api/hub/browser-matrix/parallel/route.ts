import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { readParallelConfig, writeParallelConfig, checkDocker, computeParallelSavings } from "@/lib/hub-browsermatrix"

export const dynamic = "force-dynamic"

// GET /api/hub/browser-matrix/parallel
// Cross-browser parallel + Docker config, real docker status, and the
// sequential-vs-parallel time-saving derived from CrossBrowserResult history.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const [docker, savings] = await Promise.all([checkDocker(), computeParallelSavings()])
    return NextResponse.json({ config: readParallelConfig(), docker, savings })
  } catch (err: any) {
    console.error("GET parallel config error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/hub/browser-matrix/parallel — persist parallel mode / docker / threads
export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const config = writeParallelConfig({
      crossBrowserMode: body.crossBrowserMode,
      threadCount: body.threadCount,
      onDocker: body.onDocker
    })
    return NextResponse.json({ config })
  } catch (err: any) {
    console.error("PUT parallel config error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
