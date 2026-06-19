import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { updateTestCaseSchema } from "@/schemas"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const testCase = await prisma.testCase.findFirst({
    where: { id: params.tcId, projectId: params.projectId },
        include: {
      steps: { orderBy: { stepNumber: "asc" } },
      requiredCredential: {
        select: { id: true, roleName: true },
      },
      requirements: {
        include: {
          requirement: true
        }
      }
    },
  })

  if (!testCase) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 })
  }

  return NextResponse.json({ testCase })
}

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const parsed = updateTestCaseSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }
  const { steps, moduleId, featureId, componentId, requirementIds, ...testCaseData } = parsed.data

  let moduleName = testCaseData.module || "General"
  let finalModuleId = moduleId || null
  let finalFeatureId = featureId || null
  let finalComponentId = componentId || null

  if (finalComponentId && (!finalFeatureId || !finalModuleId)) {
    const c = await prisma.projectComponent.findUnique({ where: { id: finalComponentId } })
    if (c) {
      finalFeatureId = c.featureId
      finalModuleId = c.moduleId
    }
  } else if (finalFeatureId && !finalModuleId) {
    const f = await prisma.projectFeature.findUnique({ where: { id: finalFeatureId } })
    if (f) {
      finalModuleId = f.moduleId
    }
  }

  if (finalModuleId) {
    const m = await prisma.projectModule.findUnique({ where: { id: finalModuleId } })
    if (m) {
      moduleName = m.name
    }
  }

  const testCase = await prisma.testCase.update({
    where: { id: params.tcId },
    data: {
      ...testCaseData,
      moduleId: finalModuleId,
      featureId: finalFeatureId,
      componentId: finalComponentId,
      module: moduleName,
      steps: steps
        ? {
            deleteMany: {},
            create: steps.map((step: any, index: number) => ({
              ...step,
              stepNumber: index + 1,
            })),
          }
        : undefined,
      requirements: requirementIds && Array.isArray(requirementIds)
        ? {
            deleteMany: {},
            create: requirementIds.map((reqId: string) => ({
              requirementId: reqId
            }))
          }
        : undefined
    },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
    },
  })

  return NextResponse.json({ testCase })
}

export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  // Load test case
  const testCase = await prisma.testCase.findFirst({
    where: { id: params.tcId, projectId: params.projectId },
    include: {
      testRuns: { select: { id: true } },
      manualSessionCases: { select: { id: true } },
    }
  })

  if (!testCase) {
    return notFoundResponse("Test case not found")
  }

  try {
    await prisma.$transaction(async (tx) => {
      const testRunIds = testCase.testRuns.map(r => r.id)
      const manualSessionCaseIds = testCase.manualSessionCases.map(m => m.id)

      // Delete visual comparison results
      if (testRunIds.length > 0) {
        await tx.visualComparisonResult.deleteMany({ where: { testRunId: { in: testRunIds } } })
        await tx.log.deleteMany({ where: { testRunId: { in: testRunIds } } })
        await tx.networkLog.deleteMany({ where: { testRunId: { in: testRunIds } } })
        await tx.attachment.deleteMany({ where: { testRunId: { in: testRunIds } } })
      }

      // Find exclusive bug reports (linked only to this test case)
      const linkedBugs = await tx.bugReport.findMany({
        where: { OR: [
          { testCaseId: params.tcId },
          ...(testRunIds.length > 0 ? [{ testRunId: { in: testRunIds } }] : [])
        ]},
        select: { id: true, testCaseId: true }
      })

      const exclusiveBugIds = linkedBugs.filter(b => b.testCaseId === params.tcId).map(b => b.id)
      const sharedBugIdsFromRuns = linkedBugs.filter(b => b.testCaseId !== params.tcId).map(b => b.id)

      if (exclusiveBugIds.length > 0) {
        await tx.bugAttachment.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugActivity.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugComment.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugReportRequirement.deleteMany({ where: { bugReportId: { in: exclusiveBugIds } } })
        await tx.attachment.deleteMany({ where: { bugReportId: { in: exclusiveBugIds } } })
        await tx.visualDifferenceIssue.updateMany({
          where: { bugReportId: { in: exclusiveBugIds } },
          data: { bugReportId: null }
        })
        await tx.bugReport.deleteMany({ where: { id: { in: exclusiveBugIds } } })
      }

      if (sharedBugIdsFromRuns.length > 0) {
        await tx.bugReport.updateMany({
          where: { id: { in: sharedBugIdsFromRuns } },
          data: { testRunId: null }
        })
      }

      // Delete manual session data
      if (manualSessionCaseIds.length > 0) {
        await tx.manualStepResult.deleteMany({ where: { sessionCaseId: { in: manualSessionCaseIds } } })
        await tx.manualSessionCase.deleteMany({ where: { id: { in: manualSessionCaseIds } } })
      }

      // Delete step results, requirement links, jobs, runs, steps
      if (testRunIds.length > 0) {
        await tx.testStepResult.deleteMany({ where: { testRunId: { in: testRunIds } } })
        await tx.testJob.deleteMany({ where: { testRunId: { in: testRunIds } } })
        await tx.testRun.deleteMany({ where: { id: { in: testRunIds } } })
      }

      await tx.testCaseRequirement.deleteMany({ where: { testCaseId: params.tcId } })
      await tx.testStep.deleteMany({ where: { testCaseId: params.tcId } })
      await tx.testCase.delete({ where: { id: params.tcId } })
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Error permanently deleting test case:", err)
    return NextResponse.json({ error: err.message || "Failed to delete test case" }, { status: 500 })
  }
}

