import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

// Normalize a target URL into a base http(s) origin we can probe
function toOrigin(raw: string): string {
  let u = raw.trim()
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u.replace(/\/+$/, "")
}

// POST /api/hub/targets/{id}/test-connection — probe the grid/hub status endpoint
export async function POST(_request: NextRequest, { params }: { params: { targetId: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const target = await prisma.executionTarget.findUnique({ where: { id: params.targetId } })
    if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 })

    if (target.type === "local") {
      return NextResponse.json({ reachable: true, message: "Local execution is always available." })
    }
    if (!target.url) {
      return NextResponse.json({ reachable: false, message: "No URL configured for this target." })
    }

    const origin = toOrigin(target.url)
    // Selenium Grid / Docker expose /status (Grid 4) or /wd/hub/status (legacy)
    const candidates = [`${origin}/status`, `${origin}/wd/hub/status`, origin]

    const started = Date.now()
    for (const endpoint of candidates) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(endpoint, { signal: controller.signal })
        clearTimeout(timer)
        if (res.ok) {
          let ready: boolean | undefined
          try {
            const data = await res.json()
            ready = data?.value?.ready
          } catch {}
          return NextResponse.json({
            reachable: true,
            latencyMs: Date.now() - started,
            endpoint,
            message: ready === false ? "Grid reachable but reports not ready." : `Reachable in ${Date.now() - started}ms.`
          })
        }
      } catch {
        // try next candidate
      }
    }

    return NextResponse.json({
      reachable: false,
      message: `Could not reach ${origin} (tried /status and /wd/hub/status).`
    })
  } catch (err: any) {
    console.error("POST hub target test-connection error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
