import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { addTestRunJob } from "@/lib/queue"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      testCaseIds,
      executionMode,
      browserType,
      viewport,
      environment,
      credentialId,
      name
    } = body

    if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return NextResponse.json({ error: "No test case IDs provided" }, { status: 400 })
    }

    // Fetch test cases to group by projectId
    const testCases = await prisma.testCase.findMany({
      where: {
        id: { in: testCaseIds },
        project: { userId: session.user.id }
      },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        project: true
      }
    })

    if (testCases.length === 0) {
      return NextResponse.json({ error: "No valid test cases found" }, { status: 404 })
    }

    // Group by projectId
    const projectGroups: Record<string, typeof testCases> = {}
    for (const tc of testCases) {
      if (!projectGroups[tc.projectId]) {
        projectGroups[tc.projectId] = []
      }
      projectGroups[tc.projectId].push(tc)
    }

    if (executionMode === "Manual Session") {
      const createdSessions = []
      for (const [projectId, cases] of Object.entries(projectGroups)) {
        const sessionName = name || `Bulk Manual Session - ${new Date().toLocaleDateString()}`
        const activeCredentialId = credentialId || null
        
        const manualSession = await prisma.$transaction(async (tx) => {
          const createdSession = await tx.manualTestSession.create({
            data: {
              projectId,
              name: sessionName,
              credentialId: activeCredentialId,
              environment: (environment || cases[0].project.environment) as any,
              browserType: (browserType || cases[0].project.browserType) as any,
              viewport: (viewport || cases[0].project.viewport) as any,
              keepBrowserSession: true,
              stopOnFailure: false,
              status: "Active"
            }
          })

          for (let index = 0; index < cases.length; index++) {
            const tc = cases[index]
            const sessionCase = await tx.manualSessionCase.create({
              data: {
                sessionId: createdSession.id,
                testCaseId: tc.id,
                orderIndex: index,
                status: "Pending"
              }
            })

            for (const step of tc.steps) {
              await tx.manualStepResult.create({
                data: {
                  sessionCaseId: sessionCase.id,
                  testStepId: step.id,
                  stepNumber: step.stepNumber,
                  actionDescription: step.actionDescription,
                  expectedResult: step.expectedResult,
                  status: "Pending"
                }
              })
            }
          }
          return createdSession
        })
        createdSessions.push(manualSession)
      }

      return NextResponse.json({
        success: true,
        type: "manual",
        sessions: createdSessions.map(s => ({ id: s.id, projectId: s.projectId, name: s.name }))
      })
    } else {
      // Automated Run
      const testRuns = []
      for (const tc of testCases) {
        const project = tc.project
        let viewportWidth: number | null = null
        let viewportHeight: number | null = null

        const selectedViewport = viewport || project.viewport
        switch (selectedViewport) {
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

        let roleUsed = "None"
        if (credentialId) {
          const credential = await prisma.projectCredential.findUnique({
            where: { id: credentialId },
          })
          if (credential) {
            roleUsed = credential.roleName
          }
        }

        const run = await prisma.$transaction(async (tx) => {
          const testRun = await tx.testRun.create({
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
              triggeredBy: "Manual"
            }
          })

          for (const step of tc.steps) {
            await tx.testStepResult.create({
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
          return testRun
        })

        // Add to execution queue
        await addTestRunJob(run.id)
        testRuns.push(run)
      }

      return NextResponse.json({
        success: true,
        type: "automated",
        runsCount: testRuns.length
      })
    }
  } catch (error: any) {
    console.error("Bulk run error:", error)
    return NextResponse.json({ error: error.message || "Failed to execute bulk run" }, { status: 500 })
  }
}
