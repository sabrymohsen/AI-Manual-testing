import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { addTestRunJob } from "@/lib/queue"
import { notFoundResponse, unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"
import { notifyBugStatus, notifyBugsBulk } from "@/lib/work-notifications"

export async function POST(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const bug = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    include: { testCase: { include: { project: true } } }
  })

  if (!bug) {
    return notFoundResponse("Bug report not found")
  }

  const auth = await requireProjectMember(bug.projectId!)
  if (auth.error) return unauthorizedResponse(auth.error)

  if (!bug.testCaseId) {
    return badRequestResponse("This bug report is not linked to a test case and cannot be automatically retested.")
  }

  try {
    const testCase = bug.testCase!
    const project = testCase.project

    let viewportWidth = 1280
    let viewportHeight = 800

    switch (project.viewport) {
      case "Desktop":
        viewportWidth = 1280; viewportHeight = 800; break
      case "Tablet":
        viewportWidth = 768; viewportHeight = 1024; break
      case "Mobile":
        viewportWidth = 375; viewportHeight = 667; break
      case "Custom":
        viewportWidth = project.customViewportWidth || 1280
        viewportHeight = project.customViewportHeight || 800
        break
    }

    // Create a new TestRun
    const testRun = await prisma.testRun.create({
      data: {
        projectId: bug.projectId!,
        testCaseId: bug.testCaseId,
        status: "Queued",
        roleUsed: bug.roleUsed || "None",
        browserType: project.browserType || "Chromium",
        viewport: project.viewport || "Desktop",
        viewportWidth,
        viewportHeight,
        triggeredBy: "Manual",
        executionMode: "SelfHealing"
      }
    })

    // Populate steps results
    const steps = await prisma.testStep.findMany({
      where: { testCaseId: bug.testCaseId },
      orderBy: { stepNumber: "asc" }
    })

    for (const step of steps) {
      await prisma.testStepResult.create({
        data: {
          testRunId: testRun.id,
          testStepId: step.id,
          stepNumber: step.stepNumber,
          actionDescription: step.actionDescription,
          expectedResult: step.expectedResult,
          status: "Pending"
        }
      })
    }

    // Add job to runner queue
    await addTestRunJob(testRun.id)

    // Update bug status to ReadyForRetest
    await prisma.$transaction([
      prisma.bugReport.update({
        where: { id: params.bugId },
        data: {
          status: "ReadyForRetest",
          testRunId: testRun.id // link latest run
        }
      }),
      prisma.bugActivity.create({
        data: {
          bugId: params.bugId,
          action: "Retest Triggered",
          details: `Retest triggered automatically. Spawning TestRun ID: ${testRun.id}. Status transitioned to ReadyForRetest.`
        }
      })
    ])

    if (bug.status !== "ReadyForRetest") {
      notifyBugsBulk({ bugIds: [params.bugId], kind: "status", status: "ReadyForRetest", actorId: auth.session!.user.id, actorName: auth.session!.user.name || auth.session!.user.email }).catch(() => {})
    }

    return NextResponse.json({ testRunId: testRun.id, message: "Retest job successfully queued" })
  } catch (error: any) {
    console.error("POST /api/bug-reports/[bugId]/retest error:", error)
    return NextResponse.json({ error: error.message || "Failed to trigger retest" }, { status: error?.statusCode || 500 })
  }
}
