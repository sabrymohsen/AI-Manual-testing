import { NextRequest, NextResponse } from "next/server"
import { requireHubExecution } from "@/lib/hub-access"
import { queuePosition } from "@/lib/hub-runner"

export const dynamic = "force-dynamic"

// GET /api/hub/executions/{id} — one run with its log and results, plus its
// place in the queue while it waits. Members of the run's project only.
export async function GET(_request: NextRequest, { params }: { params: { executionId: string } }) {
  const access = await requireHubExecution(params.executionId, "read")
  if (!access.ok) return access.response
  const { script, ...execution } = access.execution
  return NextResponse.json({
    execution: {
      ...execution,
      script: script ? { id: script.id, name: script.name, type: script.type, folder: script.folder } : null,
      queuePosition: execution.status === "Queued" ? queuePosition(execution.id) : null,
    },
  })
}
