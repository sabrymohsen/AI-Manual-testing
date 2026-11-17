import { NextResponse } from "next/server"
import { requireTaskOwner } from "@/lib/scrum/server"
import { syncScrumTask, taskSyncInfo } from "@/lib/integrations/core/sync-scrum-task"

export const dynamic = "force-dynamic"

// GET — which tracker this project uses and where this task lives in it.
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json(await taskSyncInfo(params.taskId, auth.projectId))
}

// POST — send the task to the tracker, or update the item it is linked to.
export async function POST(_req: Request, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const result = await syncScrumTask(params.taskId, { createIfMissing: true })
    if (result.status === "skipped") return NextResponse.json({ error: result.reason }, { status: 409 })
    return NextResponse.json({ result, ...(await taskSyncInfo(params.taskId, auth.projectId)) })
  } catch (err: any) {
    return NextResponse.json({ error: `The tracker refused the update: ${String(err?.message || err).slice(0, 300)}` }, { status: 502 })
  }
}
