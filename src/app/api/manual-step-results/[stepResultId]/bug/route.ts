import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"
import { suiteIdOfTestCase } from "@/lib/bug-reports/module"
import { nextBugKey } from "@/lib/bug-reports/keys"
import { z } from "zod"

const bodySchema = z.object({
  title: z.string().optional(),
  severity: z.string().optional(),
  priority: z.string().optional(),
  stepsToReproduce: z.string().optional(),
  expectedResult: z.string().optional(),
  actualResult: z.string().optional(),
  screenshotPath: z.string().optional(),
  consoleLogs: z.string().optional(),
  networkErrors: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: { stepResultId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const rawBody = await request.json()
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.errors.map(e => e.message).join(", ") }, { status: 400 })
    }
    const body = rawBody
    const {
      title,
      severity,
      priority,
      stepsToReproduce,
      expectedResult,
      actualResult,
      screenshotPath,
      consoleLogs,
      networkErrors
    } = body

    const stepResult = await prisma.manualStepResult.findUnique({
      where: { id: params.stepResultId },
      include: {
        sessionCase: {
          include: {
            session: {
              include: {
                project: { select: { userId: true } }
              }
            },
            testCase: true
          }
        }
      }
    })

    if (!stepResult || !stepResult.sessionCase) {
      return notFoundResponse("Manual step result not found")
    }

    if (!(await canUseProject(stepResult.sessionCase.session.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    const manualSession = stepResult.sessionCase.session
    const testCaseId = stepResult.sessionCase.testCaseId

    // Inherit linked requirements from the manual session test case
    let requirementIds: string[] = []
    if (testCaseId) {
      const tcRequirements = await prisma.testCaseRequirement.findMany({
        where: { testCaseId }
      })
      requirementIds = tcRequirements.map((r) => r.requirementId)
    }

    // The bug row links to the manual session rather than the case, so the
    // module is read from the case behind that session.
    const suiteId = await suiteIdOfTestCase(testCaseId)

    // A bug must belong to the run's project: without it the bug could be
    // neither opened nor deleted (the detail and delete routes check access
    // through the project), and it never showed in the project's list.
    const projectId = manualSession.projectId
    const bugKey = await nextBugKey(projectId)

    const bugReport = await prisma.bugReport.create({
      data: {
        projectId,
        bugKey,
        reporterId: auth.session!.user.id,
        title: title || `Failed: ${stepResult.sessionCase.testCase.title} - Step ${stepResult.stepNumber}`,
        suiteId,
        severity: severity || "High",
        priority: priority || "High",
        environment: manualSession.environment,
        roleUsed: manualSession.credentialId ? "Authenticated User" : "None",
        stepsToReproduce: stepsToReproduce || `1. Open app.\n2. Execute: ${stepResult.sessionCase.testCase.title}\n3. Go to step ${stepResult.stepNumber}: ${stepResult.actionDescription}`,
        expectedResult: expectedResult || stepResult.expectedResult || "",
        actualResult: actualResult || stepResult.actualResult || "",
        screenshotPath: screenshotPath || stepResult.screenshotPath,
        consoleLogs: consoleLogs || "",
        networkErrors: networkErrors || "",
        browser: manualSession.browserType,
        viewport: manualSession.viewport,
        manualTestSessionId: manualSession.id,
        requirements: requirementIds.length > 0
          ? {
              create: requirementIds.map((reqId) => ({
                requirementId: reqId
              }))
            }
          : undefined
      }
    })

    await prisma.bugActivity.create({
      data: {
        bugId: bugReport.id,
        action: "Created",
        details: `Bug ${bugKey} filed from manual run step ${stepResult.stepNumber}.`,
      },
    }).catch(() => {})

    // Link bug report to manual step result
    await prisma.manualStepResult.update({
      where: { id: params.stepResultId },
      data: {
        bugReportId: bugReport.id
      }
    })

    return NextResponse.json(bugReport, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create bug report" }, { status: 500 })
  }
}
