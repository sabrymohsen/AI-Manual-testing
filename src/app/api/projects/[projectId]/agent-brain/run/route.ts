import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { addAgentBrainJob } from "@/lib/queue"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const runs = await prisma.agentBrainRun.findMany({
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
    // Empty body fallback
  }

  const mode = body.mode || "Autonomous"
  if (!["Exploration", "Planning", "Execution", "Autonomous"].includes(mode)) {
    return badRequestResponse("Invalid agent brain mode. Expected Exploration, Planning, Execution, or Autonomous.")
  }

  const safetyDoNotDelete = body.safetyDoNotDelete !== false
  const safetyDoNotModify = body.safetyDoNotModify === true
  const userInstruction = body.userInstruction || null

  const agentRun = await prisma.agentBrainRun.create({
    data: {
      projectId: params.projectId,
      status: "Queued",
      mode: mode as any,
      safetyDoNotDelete,
      safetyDoNotModify,
      userInstruction,
    },
  })

  // Enqueue job in BullMQ
  await addAgentBrainJob(agentRun.id)

  return NextResponse.json({ agentRun }, { status: 201 })
}
