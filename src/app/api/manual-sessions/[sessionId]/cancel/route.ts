import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const session = await prisma.manualTestSession.findUnique({
      where: { id: params.sessionId },
      include: { project: { select: { userId: true } } }
    })

    if (!session) {
      return notFoundResponse("Manual session not found")
    }

    if (!(await canUseProject(session.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    await prisma.manualTestSession.update({
      where: { id: params.sessionId },
      data: {
        status: "Cancelled",
        completedAt: new Date()
      }
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to cancel manual session" }, { status: 500 })
  }
}
