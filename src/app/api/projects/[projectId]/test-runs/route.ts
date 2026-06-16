import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { addTestRunJob } from "@/lib/queue"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const { testCaseId, credentialId } = body

  if (!testCaseId) {
    return NextResponse.json(
      { error: "testCaseId is required" },
      { status: 400 }
    )
  }

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
    return NextResponse.json({ error: "Test case not found" }, { status: 404 })
  }

  let roleUsed = "None"
  if (credentialId) {
    const credential = await prisma.projectCredential.findUnique({
      where: { id: credentialId },
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

  // Add job to queue
  await addTestRunJob(testRun.id)

  return NextResponse.json({ testRun }, { status: 201 })
}
