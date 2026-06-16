import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  pauseSession,
  resumeSession,
  finishSession,
  cancelSession,
  startNewRecordedTestCase,
  saveCurrentRecordedTestCase
} from "@/lib/recording/session-manager"

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const path = params.path
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  // 1. GET /api/recording/[sessionId]/steps
  if (path.length === 2 && path[1] === "steps") {
    const sessionId = path[0]
    const activeCase = await prisma.recordedTestCase.findFirst({
      where: { sessionId, status: "Draft" },
      orderBy: { createdAt: "desc" }
    })
    
    if (!activeCase) {
      return NextResponse.json({ steps: [] })
    }

    const steps = await prisma.recordedStep.findMany({
      where: { recordedTestCaseId: activeCase.id },
      orderBy: { stepNumber: "asc" }
    })
    return NextResponse.json({ steps, testCaseId: activeCase.id })
  }

  // 2. GET /api/recording/[sessionId]
  if (path.length === 1 && path[0] !== "steps") {
    const sessionId = path[0]
    const recSession = await prisma.recordingSession.findUnique({
      where: { id: sessionId },
      include: {
        recordedTestCases: {
          orderBy: { createdAt: "desc" }
        }
      }
    })

    if (!recSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    return NextResponse.json({ session: recSession })
  }

  return NextResponse.json({ error: "Invalid GET endpoint" }, { status: 400 })
}

export async function POST(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const path = params.path
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  const sessionId = path[0]

  try {
    // 1. POST /api/recording/[sessionId]/pause
    if (path.length === 2 && path[1] === "pause") {
      await pauseSession(sessionId)
      return NextResponse.json({ success: true })
    }

    // 2. POST /api/recording/[sessionId]/resume
    if (path.length === 2 && path[1] === "resume") {
      await resumeSession(sessionId)
      return NextResponse.json({ success: true })
    }

    // 3. POST /api/recording/[sessionId]/finish
    if (path.length === 2 && path[1] === "finish") {
      await finishSession(sessionId)
      return NextResponse.json({ success: true })
    }

    // 4. POST /api/recording/[sessionId]/cancel
    if (path.length === 2 && path[1] === "cancel") {
      await cancelSession(sessionId)
      return NextResponse.json({ success: true })
    }

    // 5. POST /api/recording/[sessionId]/test-case/start-new
    if (path.length === 3 && path[1] === "test-case" && path[2] === "start-new") {
      const body = await request.json()
      const newCase = await startNewRecordedTestCase(sessionId, body)
      return NextResponse.json({ testCase: newCase })
    }

    // 6. POST /api/recording/[sessionId]/test-case/save-current
    if (path.length === 3 && path[1] === "test-case" && path[2] === "save-current") {
      const body = await request.json()
      const { testCaseId } = body
      if (!testCaseId) {
        return NextResponse.json({ error: "testCaseId is required" }, { status: 400 })
      }
      const savedCase = await saveCurrentRecordedTestCase(sessionId, testCaseId)
      return NextResponse.json({ testCase: savedCase })
    }
  } catch (err: any) {
    console.error("Error in recording POST action:", err)
    return NextResponse.json({ error: err.message || "Failed to process request" }, { status: 500 })
  }

  return NextResponse.json({ error: "Invalid POST endpoint" }, { status: 400 })
}

export async function PUT(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const path = params.path
  
  // 1. PUT /api/recording/steps/[stepId]
  if (path.length === 2 && path[0] === "steps") {
    const stepId = path[1]
    try {
      const body = await request.json()
      const updatedStep = await prisma.recordedStep.update({
        where: { id: stepId },
        data: body
      })
      return NextResponse.json({ step: updatedStep })
    } catch (err: any) {
      console.error("Error updating recorded step:", err)
      return NextResponse.json({ error: err.message || "Failed to update step" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Invalid PUT endpoint" }, { status: 400 })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { path: string[] } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const path = params.path

  // 1. DELETE /api/recording/steps/[stepId]
  if (path.length === 2 && path[0] === "steps") {
    const stepId = path[1]
    try {
      // Find step to re-adjust subsequent step numbers
      const stepToDelete = await prisma.recordedStep.findUnique({
        where: { id: stepId }
      })
      
      if (stepToDelete) {
        await prisma.recordedStep.delete({
          where: { id: stepId }
        })

        // Re-adjust numbers of subsequent steps
        await prisma.recordedStep.updateMany({
          where: {
            recordedTestCaseId: stepToDelete.recordedTestCaseId,
            stepNumber: { gt: stepToDelete.stepNumber }
          },
          data: {
            stepNumber: { decrement: 1 }
          }
        })
      }

      return NextResponse.json({ success: true })
    } catch (err: any) {
      console.error("Error deleting recorded step:", err)
      return NextResponse.json({ error: err.message || "Failed to delete step" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Invalid DELETE endpoint" }, { status: 400 })
}
