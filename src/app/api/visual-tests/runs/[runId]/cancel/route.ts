import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { cancelVisualTestRunJob } from "@/lib/queue"
import { errorResponse, guardVisualRun } from "@/lib/visual-tests/access"
import { refreshRunTallies } from "@/lib/visual-tests/compare-service"

export async function POST(_req: Request, { params }: { params: { runId: string } }) {
  const g = await guardVisualRun(params.runId)
  if (!g.ok) return g.response
  const run = g.record
  if (run.status !== "Queued" && run.status !== "Running") {
    return NextResponse.json({ error: "This run has already finished" }, { status: 409 })
  }
  try {
    await cancelVisualTestRunJob(run.id).catch(() => {})
    if (run.status === "Queued") {
      // Nothing is capturing yet, so the run can be closed now.
      await prisma.visualTestRun.update({ where: { id: run.id }, data: { status: "Cancelled", completedAt: new Date() } })
      await refreshRunTallies([run.id])
    }
    // A running run stops after the pages already open, and closes itself.
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, "Could not stop the run")
  }
}
