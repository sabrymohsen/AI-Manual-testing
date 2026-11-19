import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { notFoundResponse, unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"

export async function POST(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const currentBug = await prisma.bugReport.findUnique({
    where: { id: params.bugId }
  })

  if (!currentBug) {
    return notFoundResponse("Bug report not found")
  }

  const auth = await requireProjectMember(currentBug.projectId!)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { duplicateOfId } = body

    if (!duplicateOfId) {
      return badRequestResponse("duplicateOfId is required")
    }

    const originalBug = await prisma.bugReport.findUnique({
      where: { id: duplicateOfId }
    })

    if (!originalBug) {
      return notFoundResponse("Original bug report not found")
    }

    const updatedBug = await prisma.$transaction(async (tx) => {
      const bug = await tx.bugReport.update({
        where: { id: params.bugId },
        data: {
          status: "Duplicate"
        }
      })

      // Create activity trails on both bugs
      await tx.bugActivity.create({
        data: {
          bugId: params.bugId,
          action: "Status Changed",
          details: `Marked as duplicate of bug report key ${originalBug.bugKey || originalBug.title}.`
        }
      })

      await tx.bugActivity.create({
        data: {
          bugId: duplicateOfId,
          action: "Duplicate Identified",
          details: `Bug report key ${currentBug.bugKey || currentBug.title} was marked as a duplicate of this report.`
        }
      })

      // If the duplicate has a test run associated, add it as a new occurrence of the original bug
      if (currentBug.testRunId) {
        await tx.bugOccurrence.create({
          data: {
            bugReportId: duplicateOfId,
            testRunId: currentBug.testRunId,
            evidence: {
              screenshotPath: currentBug.screenshotPath,
              consoleLogs: currentBug.consoleLogs,
              networkErrors: currentBug.networkErrors,
              actualResult: currentBug.actualResult
            }
          }
        })
      }

      return bug
    })

    return NextResponse.json({ bug: updatedBug })
  } catch (error: any) {
    console.error("POST /api/bug-reports/[bugId]/mark-duplicate error:", error)
    return NextResponse.json({ error: error.message || "Failed to mark duplicate" }, { status: 500 })
  }
}
