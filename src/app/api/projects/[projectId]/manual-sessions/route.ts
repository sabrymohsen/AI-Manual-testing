import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const sessions = await prisma.manualTestSession.findMany({
      where: { projectId: params.projectId },
      include: {
        sessionCases: {
          include: {
            testCase: { select: { title: true } }
          }
        }
      },
      orderBy: { startedAt: "desc" }
    })
    return NextResponse.json(sessions)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch sessions" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      name,
      credentialId,
      environment,
      browserType,
      viewport,
      keepBrowserSession,
      stopOnFailure,
      testCaseIds
    } = body

    if (!name || !environment || !browserType || !viewport || !testCaseIds || !Array.isArray(testCaseIds)) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    const newSession = await prisma.$transaction(async (tx) => {
      const createdSession = await tx.manualTestSession.create({
        data: {
          projectId: params.projectId,
          name,
          credentialId: credentialId || null,
          environment: environment as any,
          browserType: browserType as any,
          viewport: viewport as any,
          keepBrowserSession: keepBrowserSession !== undefined ? !!keepBrowserSession : true,
          stopOnFailure: !!stopOnFailure,
          status: "Active"
        }
      })

      // Fetch selected test cases with their steps
      const testCases = await tx.testCase.findMany({
        where: { id: { in: testCaseIds } },
        include: {
          steps: { orderBy: { stepNumber: "asc" } }
        }
      })

      // Instantiate ManualSessionCase and ManualStepResult records
      for (let index = 0; index < testCaseIds.length; index++) {
        const tcId = testCaseIds[index]
        const tc = testCases.find(t => t.id === tcId)
        if (!tc) continue

        const sessionCase = await tx.manualSessionCase.create({
          data: {
            sessionId: createdSession.id,
            testCaseId: tcId,
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

    return NextResponse.json(newSession, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create manual session" }, { status: 500 })
  }
}
