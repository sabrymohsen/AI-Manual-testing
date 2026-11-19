import { NextResponse } from "next/server"
import { unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"
import { getProjectMemory, recordUserCorrection } from "@/lib/agent-brain/memory"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const memory = await getProjectMemory(params.projectId)
  return NextResponse.json({ memory })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return badRequestResponse("Invalid JSON payload.")
  }

  const { targetValue, correctedSelector } = body
  if (!targetValue || !correctedSelector) {
    return badRequestResponse("Parameters targetValue and correctedSelector are required.")
  }

  await recordUserCorrection(params.projectId, targetValue, correctedSelector)

  return NextResponse.json({ success: true, message: "User correction recorded to memory." })
}
