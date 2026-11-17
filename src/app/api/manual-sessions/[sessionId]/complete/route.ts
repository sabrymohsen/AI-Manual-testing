import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"
import { recalcMany } from "@/lib/test-cases/rollup"

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

    if (!(await canUseProject(existing.projectId, auth.session!.user.id, "write"))) {
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

    // Refresh TestCase.lastStatus for every case in the session. Done after the
    // transaction commits so the rollup reads the settled rows, and awaited so
    // the client's next list fetch already reflects the new verdicts.
    await recalcMany(existing.sessionCases.map((c) => c.testCaseId))

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to complete manual session" }, { status: 500 })
  }
}
