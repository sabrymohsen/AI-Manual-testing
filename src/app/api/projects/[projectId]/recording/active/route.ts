import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { recorderWorkerRequest, RecorderWorkerError } from "@/lib/recording/worker-client"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const session = await prisma.recordingSession.findFirst({
    // Only this person's own Recorder Studio session — never a Live QA
    // session, and never a teammate's.
    where: {
      projectId: params.projectId,
      kind: "Studio",
      startedById: auth.session!.user.id,
      status: { in: ["Starting", "Active", "Paused", "Saving"] },
    },
    orderBy: { startedAt: "desc" },
    include: {
      recordedTestCases: {
        orderBy: { createdAt: "desc" },
        include: {
          steps: {
            orderBy: { stepNumber: "asc" },
          },
        },
      },
    },
  })

  if (!session) {
    return NextResponse.json({ session: null, connection: null })
  }

  let connection = null
  try {
    connection = await recorderWorkerRequest(`/sessions/${session.id}/connection`, {
      method: "GET",
    })
  } catch (err) {
    if (err instanceof RecorderWorkerError) {
      connection = {
        connectionStatus: "WorkerOffline",
        browserOpen: false,
        toolbarInjected: false,
        sessionStatus: session.status,
        lastError: session.lastError,
      }
    }
  }

  const currentCase =
    session.recordedTestCases.find((c) => c.id === session.currentRecordedTestCaseId) ||
    session.recordedTestCases.find((c) => c.status === "Draft") ||
    session.recordedTestCases[0] ||
    null

  return NextResponse.json({
    session,
    currentTestCase: currentCase,
    connection,
  })
}
