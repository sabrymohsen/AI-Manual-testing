import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { addTestRunJob } from "@/lib/queue"
import { createTestRunSchema } from "@/schemas"
import { unauthorizedResponse, badRequestResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { checkRateLimit } from "@/lib/rate-limit"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const testRuns = await prisma.testRun.findMany({
    where: { projectId: params.projectId },
    include: {
      testCase: { select: { id: true, title: true } },
      stepResults: { orderBy: { stepNumber: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return NextResponse.json({ testRuns })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  // Rate limit: 20 test runs per user per 10 minutes
  const rateLimit = await checkRateLimit(`testrun:${auth.session!.user.id}`, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 20,
    keyPrefix: "ratelimit",
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many test run requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)) } }
    )
  }

  const body = await request.json()
  const parsed = createTestRunSchema.safeParse(body)

  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }

  const { testCaseId, credentialId, executionMode } = parsed.data

  const testCase = await prisma.testCase.findFirst({
    where: { id: testCaseId, projectId: params.projectId },
    include: {
      project: {
        select: {
          browserType: true,
          viewport: true,
          customViewportWidth: true,
          customViewportHeight: true,
        },
      },
    },
  })

  if (!testCase) {
    return notFoundResponse("Test case not found")
  }

  let roleUsed = "None"
  if (credentialId) {
    const credential = await prisma.projectCredential.findFirst({
      where: { id: credentialId, projectId: params.projectId },
    })
    if (credential) {
      roleUsed = credential.roleName
    }
  }

  const project = testCase.project
  let viewportWidth: number | null = null
  let viewportHeight: number | null = null

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

  const testRun = await prisma.testRun.create({
    data: {
      projectId: params.projectId,
      testCaseId,
      credentialId: credentialId || null,
      status: "Queued",
      roleUsed,
      browserType: project.browserType,
      viewport: project.viewport,
      viewportWidth,
      viewportHeight,
      triggeredBy: "Manual",
      executionMode: executionMode || "SelfHealing",
    },
  })

  // Create initial step results
  const steps = await prisma.testStep.findMany({
    where: { testCaseId },
    orderBy: { stepNumber: "asc" },
  })

  for (const step of steps) {
    await prisma.testStepResult.create({
      data: {
        testRunId: testRun.id,
        testStepId: step.id,
        stepNumber: step.stepNumber,
        actionDescription: step.actionDescription,
        expectedResult: step.expectedResult,
        status: "Pending",
      },
    })
  }

  // Add job to queue. If the queue is unavailable the run must not be left
  // sitting in Queued forever with nothing to pick it up — mark it failed and
  // say why, so the run list explains itself instead of looking stuck.
  try {
    await addTestRunJob(testRun.id)
  } catch (err: any) {
    const reason = err?.message || "Could not queue the run"
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: { status: "Failed", completedAt: new Date() },
    })
    // TestRun has no error column, so the reason lives in the run's log where
    // the report view already surfaces it.
    await prisma.log.create({
      data: { testRunId: testRun.id, source: "server", level: "error", message: reason },
    })
    return NextResponse.json({ error: reason, testRun }, { status: err?.statusCode || 500 })
  }

  return NextResponse.json({ testRun }, { status: 201 })
}
