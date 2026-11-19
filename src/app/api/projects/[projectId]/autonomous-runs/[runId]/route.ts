import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; runId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const run = await prisma.qAAgentRun.findFirst({
    where: { id: params.runId, projectId: params.projectId },
    include: {
      steps: true,
      findings: true,
      events: { orderBy: { createdAt: "asc" } }
    }
  })

  if (!run) {
    return notFoundResponse("Autonomous agent run not found")
  }

  let runMode = "Balanced"
  if (run.scope && typeof run.scope === 'object' && (run.scope as any).mode) {
    runMode = (run.scope as any).mode
  }

  const legacyAgentRun = {
    id: run.id,
    projectId: run.projectId,
    status: run.status,
    mode: runMode,
    safetyDoNotDelete: true,
    safetyDoNotModify: run.safetyLevel === "ReadOnly",
    summary: run.summary ? JSON.stringify(run.summary) : null,
    coverageReport: {
      scannedRoutes: run.scannerResult && typeof run.scannerResult === 'object' ? (run.scannerResult as any).routes || [] : [],
      discoveredElements: run.scannerResult && typeof run.scannerResult === 'object' ? (run.scannerResult as any).elements || [] : []
    },
    metrics: {
      passCount: run.steps.filter(s => s.status === "Passed").length,
      failCount: run.steps.filter(s => s.status === "Failed").length,
      selfHealedCount: run.steps.filter(s => s.status === "SelfHealed").length,
      bugCount: run.findings.filter(f => f.type === "TestFailure" || f.type === "BrokenElement").length,
      totalDurationMs: run.durationMs
    },
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    testRuns: [],
    bugReports: []
  }

  return NextResponse.json({ agentRun: legacyAgentRun })
}
