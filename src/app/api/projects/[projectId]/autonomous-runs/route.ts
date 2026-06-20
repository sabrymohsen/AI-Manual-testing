import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { addAutonomousAgentJob } from "@/lib/queue"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const runs = await prisma.autonomousAgentRun.findMany({
    where: { projectId: params.projectId },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ runs })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is fine (defaults will apply)
  }

  const mode = body.mode || "Balanced"
  if (!["Fast", "Balanced", "Full"].includes(mode)) {
    return badRequestResponse("Invalid execution mode. Expected Fast, Balanced, or Full.")
  }

  const safetyDoNotDelete = body.safetyDoNotDelete !== false
  const safetyDoNotModify = body.safetyDoNotModify === true

  const agentRun = await prisma.autonomousAgentRun.create({
    data: {
      projectId: params.projectId,
      status: "Queued",
      mode: mode as any,
      safetyDoNotDelete,
      safetyDoNotModify,
    },
  })

  // Enqueue job in BullMQ
  await addAutonomousAgentJob(agentRun.id)

  return NextResponse.json({ agentRun }, { status: 201 })
}
