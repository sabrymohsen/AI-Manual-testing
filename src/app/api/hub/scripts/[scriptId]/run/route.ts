import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { startScriptRun } from "@/lib/hub-runner"

export const dynamic = "force-dynamic"

// POST /api/hub/scripts/{id}/run — start an execution, return its id immediately.
// Progress is streamed via GET /api/hub/executions/{id}/live
export async function POST(
  request: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const browser: string = body.browser || "Chrome"
    const debug: boolean = Boolean(body.debug)
    const targetId: string | undefined = body.targetId || undefined

    const script = await prisma.testScript.findUnique({
      where: { id: params.scriptId }
    })

    if (!script) {
      return NextResponse.json({ error: "Test script not found" }, { status: 404 })
    }

    // Resolve the execution target (Section 1c). Omitted / "local" runs locally.
    let target
    if (targetId && targetId !== "local") {
      const t = await prisma.executionTarget.findUnique({ where: { id: targetId } })
      if (t) {
        target = {
          name: t.name,
          type: t.type,
          url: t.url,
          platform: t.platform,
          browser: t.browser,
          headless: t.headless
        }
      }
    }

    const executionId = await startScriptRun(script, browser, debug, target, script.accessibilityEnabled)
    const execution = await prisma.testExecution.findUnique({ where: { id: executionId } })

    return NextResponse.json({ executionId, execution }, { status: 202 })
  } catch (err: any) {
    console.error("POST hub run error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
