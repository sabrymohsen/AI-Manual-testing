import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { startSession } from "@/lib/recording/session-manager"

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
    const result = await startSession(params.projectId, session.user.id, body)
    return NextResponse.json(result, { status: 201 })
  } catch (err: any) {
    console.error("Error starting recording session:", err)
    return NextResponse.json({ error: err.message || "Failed to start session" }, { status: 500 })
  }
}
