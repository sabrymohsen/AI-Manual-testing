import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function PUT(
  request: Request,
  { params }: { params: { stepResultId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { actualResult, status, notes, bugReportId, screenshotPath } = body

    const updated = await prisma.manualStepResult.update({
      where: { id: params.stepResultId },
      data: {
        actualResult,
        status: status as any,
        notes,
        bugReportId,
        screenshotPath
      }
    })

    // Propagate status failures to parent ManualSessionCase
    if (status === "Failed" || status === "Blocked" || status === "Warning") {
      const stepResult = await prisma.manualStepResult.findUnique({
        where: { id: params.stepResultId },
        include: {
          sessionCase: {
            include: {
              session: true
            }
          }
        }
      })

      if (stepResult?.sessionCase) {
        await prisma.manualSessionCase.update({
          where: { id: stepResult.sessionCase.id },
          data: {
            status: status as any
          }
        })
      }
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update step result" }, { status: 500 })
  }
}
