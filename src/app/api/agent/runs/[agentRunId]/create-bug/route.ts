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
      include: {
        agentRun: {
          include: {
            project: true
          }
        }
      }
    })

    if (!finding || finding.agentRunId !== params.agentRunId) {
      return notFoundResponse("Finding not found for this run session")
    }

    // Map severity to Prisma Priority
    let severity: Priority = Priority.Medium
    if (finding.severity === "Critical") severity = Priority.Critical
    if (finding.severity === "High") severity = Priority.High
    if (finding.severity === "Low") severity = Priority.Low

    // 1. Fetch credential role used
    let credentialRole = "Public Scan (No Login)"
    if (finding.agentRun.credentialId) {
      try {
        const cred = await prisma.projectCredential.findUnique({
          where: { id: finding.agentRun.credentialId },
          select: { roleName: true }
        })
        if (cred) {
          credentialRole = cred.roleName
        }
      } catch (err) {
        console.error("[QAAgentBugAPI] Error fetching credential role:", err)
      }
    }

    // 2. Extract console and network errors from findings of this run
    const logFindings = await prisma.qAAgentFinding.findMany({
      where: {
        agentRunId: params.agentRunId,
        type: { in: ["ConsoleError", "NetworkError"] }
      }
    })
    const consoleLogs = logFindings
      .filter(lf => lf.type === "ConsoleError")
      .map(lf => lf.description)
      .join("\n") || "No console errors detected."
    const networkErrors = logFindings
      .filter(lf => lf.type === "NetworkError")
      .map(lf => lf.description)
      .join("\n") || "No network errors detected."

    // 3. Chronological steps list
    const steps = await prisma.qAAgentRunStep.findMany({
      where: { agentRunId: params.agentRunId },
      orderBy: { stepNumber: "asc" }
    })
    const runScope = (finding.agentRun.scope || {}) as any
    const stepsText = [
      `QA Agent Run ID: ${finding.agentRunId}`,
      `Target URL: ${runScope.targetUrl || finding.agentRun.project.webAppUrl || "None"}`,
      `Environment: ${runScope.environment || "Development"}`,
      `Credential Role: ${credentialRole}`,
      `Safety Level: ${finding.agentRun.safetyLevel}`,
      `Browser: ${finding.agentRun.browserType || "Chromium"}`,
      `Viewport: ${finding.agentRun.viewport || "1280x800"}`,
      "",
      "Steps to Reproduce:",
      ...steps.map(s => `${s.stepNumber}. [${s.name}] - ${s.status} - ${(s.details as any)?.message || ""}`)
    ].join("\n")

    const evidence = (finding.evidence || {}) as any
    const actualResult = finding.description || evidence.error || "Action failed or encountered warning during execution."
    const screenshotPath = evidence.screenshotPath || null

    // Create Bug Report
    const bug = await prisma.bugReport.create({
      data: {
        title: `[QA Agent Brain Defect] ${finding.title}`,
        projectId: finding.agentRun.projectId,
        severity,
        priority: Priority.Medium,
        status: BugStatus.Open,
        stepsToReproduce: stepsText,
        expectedResult: "Action completes successfully and all page elements resolve properly.",
        actualResult,
        screenshotPath,
        consoleLogs,
        networkErrors,
        roleUsed: credentialRole,
        environment: (runScope.environment as any) || null,
        browser: finding.agentRun.browserType || null,
        viewport: finding.agentRun.viewport as any || null
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
