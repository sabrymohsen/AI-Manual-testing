import { NextRequest, NextResponse } from "next/server"
import { requireHubExecution } from "@/lib/hub-access"
import { cancelRun } from "@/lib/hub-runner"

export const dynamic = "force-dynamic"

// POST /api/hub/executions/{id}/cancel — stop a queued or running run.
export async function POST(_request: NextRequest, { params }: { params: { executionId: string } }) {
  const access = await requireHubExecution(params.executionId, "write")
  if (!access.ok) return access.response
  const ok = await cancelRun(params.executionId, access.session.user.name || access.session.user.email)
  if (!ok) return NextResponse.json({ error: "This run has already finished" }, { status: 409 })
  return NextResponse.json({ cancelled: true })
}
