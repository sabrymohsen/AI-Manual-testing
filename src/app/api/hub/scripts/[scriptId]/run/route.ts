import { NextRequest, NextResponse } from "next/server"
import { requireHubScript } from "@/lib/hub-access"
import { startScriptRun } from "@/lib/hub-runner"
import { resolveTarget } from "@/lib/hub-runs"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

// POST /api/hub/scripts/{id}/run  { projectId?, browser?, debug?, targetId?, environment? }
// Starts a run and returns its id immediately; progress via /executions/{id}.
// Running a test runs code on the server: project writers only, and a shared
// example must be run inside a project (`projectId`).
export async function POST(request: NextRequest, { params }: { params: { scriptId: string } }) {
  const body = await request.json().catch(() => ({}))
  const auth = await requireHubScript(params.scriptId, "run", body.projectId || null)
  if (!auth.ok) return auth.response

  if ((auth.script as any).mode === "local") {
    return NextResponse.json({ error: "This project runs on a tester's computer — run it from the QA Engine desktop app." }, { status: 400 })
  }
  if ((auth.script as any).mode === "agent") {
    return NextResponse.json({ error: "This test case is run by the Browser Agent — run it again from the Browser Agent tab." }, { status: 400 })
  }
  try {
    const target = await resolveTarget(body.targetId)
    const executionId = await startScriptRun(
      auth.script,
      String(body.browser || "Chrome"),
      Boolean(body.debug),
      target,
      auth.script.accessibilityEnabled,
      null,
      {
        projectId: auth.projectId,
        triggerSource: "manual",
        environment: body.environment ?? null,
        triggeredById: auth.session.user.id,
        triggeredByName: auth.session.user.name || auth.session.user.email,
      }
    )
    const execution = await prisma.testExecution.findUnique({ where: { id: executionId } })
    return NextResponse.json({ executionId, execution }, { status: 202 })
  } catch (err: any) {
    console.error("POST hub run error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
