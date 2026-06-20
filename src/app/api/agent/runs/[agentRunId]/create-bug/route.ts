import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { Priority, BugStatus } from "@prisma/client"

export async function POST(
  request: Request,
  { params }: { params: { agentRunId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { findingId } = body

    if (!findingId) {
      return NextResponse.json({ error: "Missing required field: findingId" }, { status: 400 })
    }

    const finding = await prisma.qAAgentFinding.findUnique({
      where: { id: findingId },
      include: { agentRun: true }
    })

    if (!finding || finding.agentRunId !== params.agentRunId) {
      return notFoundResponse("Finding not found for this run session")
    }

    // Map severity to Prisma Priority
    let severity: Priority = Priority.Medium
    if (finding.severity === "Critical") severity = Priority.Critical
    if (finding.severity === "High") severity = Priority.High
    if (finding.severity === "Low") severity = Priority.Low

    // Create Bug Report
    const bug = await prisma.bugReport.create({
      data: {
        title: `[QA Agent Brain Defect] ${finding.title}`,
        projectId: finding.agentRun.projectId,
        severity,
        priority: Priority.Medium,
        status: BugStatus.Open,
        stepsToReproduce: finding.description || "Steps executed leading to failure.",
        expectedResult: "Element locator resolves and action completes safely.",
        actualResult: "Action failed or encountered warning during execution."
      }
    })

    // Link back to QAAgentFinding
    await prisma.qAAgentFinding.update({
      where: { id: findingId },
      data: { bugReportId: bug.id }
    })

    return NextResponse.json({ bug })
  } catch (err: any) {
    console.error("[QAAgentBugAPI] Failed to create bug:", err)
    return NextResponse.json({ error: err.message || "Failed to create bug report" }, { status: 500 })
  }
}
