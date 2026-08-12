import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, badRequestResponse, unauthorizedResponse } from "@/lib/api-guards"
import { addTestRunJob } from "@/lib/queue"
import { z } from "zod"

const bodySchema = z.object({
  testCaseIds: z.array(z.string().min(1)).min(1, "No test case IDs provided"),
  credentialId: z.string().optional().nullable(),
  browserType: z.string().optional().nullable(),
  viewport: z.string().optional().nullable(),
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  try {
    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { testCaseIds, credentialId, browserType, viewport } = parsed.data

    const testCases = await prisma.testCase.findMany({
      where: {
        id: { in: testCaseIds },
        project: { userId: session.user.id },
      },
      include: { project: true },
    })

    if (testCases.length === 0) {
      return NextResponse.json({ error: "No matching test cases found" }, { status: 404 })
    }

    const testRuns = []
    for (const tc of testCases) {
      const project = tc.project
      let viewportWidth: number | null = null
      let viewportHeight: number | null = null

      const selectedViewport = viewport || project.viewport
      switch (selectedViewport) {
        case "Desktop":
          viewportWidth = 1280
          viewportHeight = 800
          break
        case "Tablet":
          viewportWidth = 768
          viewportHeight = 1024
          break
        case "Mobile":
          viewportWidth = 375
          viewportHeight = 667
          break
        case "Custom":
          viewportWidth = project.customViewportWidth || 1280
          viewportHeight = project.customViewportHeight || 800
          break
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

      const testRun = await prisma.testRun.create({
        data: {
          projectId: tc.projectId,
          testCaseId: tc.id,
          credentialId: credentialId || null,
          status: "Queued",
          roleUsed,
          browserType: (browserType || project.browserType) as any,
          viewport: selectedViewport as any,
          viewportWidth,
          viewportHeight,
          triggeredBy: "Manual",
        },
      })

      // Create initial steps result records
      const steps = await prisma.testStep.findMany({
        where: { testCaseId: tc.id },
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

      await addTestRunJob(testRun.id)
      testRuns.push(testRun)
    }

    return NextResponse.json({ success: true, queuedCount: testRuns.length, runs: testRuns })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to queue test runs" }, { status: err?.statusCode || 500 })
  }
}
