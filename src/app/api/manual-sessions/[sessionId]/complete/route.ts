import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const existing = await prisma.manualTestSession.findUnique({
      where: { id: params.sessionId },
      include: {
        project: { select: { userId: true } },
        sessionCases: {
          include: {
            stepResults: true
          }
        }
      }
    })

    if (!existing) {
      return notFoundResponse("Manual session not found")
    }

    if (existing.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    const completedAt = new Date()
    const durationMs = completedAt.getTime() - new Date(existing.startedAt).getTime()

    await prisma.$transaction(async (tx) => {
      // Process and aggregate all test case statuses based on their step results
      for (const mcase of existing.sessionCases) {
        let finalStatus = "Passed" // StepStatus fallback

        const statuses = mcase.stepResults.map(s => s.status)
        if (statuses.includes("Failed")) {
          finalStatus = "Failed"
        } else if (statuses.includes("Blocked")) {
          finalStatus = "Blocked"
        } else if (statuses.includes("Warning")) {
          finalStatus = "Warning"
        } else if (statuses.includes("Pending") || statuses.includes("Running")) {
          finalStatus = "Pending"
        } else if (statuses.every(s => s === "Skipped")) {
          finalStatus = "Skipped"
        }

        await tx.manualSessionCase.update({
          where: { id: mcase.id },
          data: {
            status: finalStatus as any,
            completedAt: new Date()
          }
        })
      }

      await tx.manualTestSession.update({
        where: { id: params.sessionId },
        data: {
          status: "Completed",
          completedAt,
          durationMs
        }
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to complete manual session" }, { status: 500 })
  }
}
